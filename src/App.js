import { useEffect, useRef, useState } from 'react'
import { renderReport } from './report.js'
import { PARAM_DEFS, DEVICE_ID } from './params.js'
import { ensureAuth, fetchSensor, resample, fetchDeviceMeta } from './api.js'

const DEBUG = (() => {
  try { return new URLSearchParams(window.location.search).get('debug') === '1' } catch (e) { return false }
})()

// Date/time range presets: how many samples, their spacing, and labels.
const PRESETS = [
  { id: '15m', label: 'Last 15 min',  samples: 15, stepMs: 60000,     sub: 'Last 15 minutes · 1-minute samples',  spanLabel: 'Last 15 min' },
  { id: '30m', label: 'Last 30 min',  samples: 30, stepMs: 60000,     sub: 'Last 30 minutes · 1-minute samples',  spanLabel: 'Last 30 min' },
  { id: '1h',  label: 'Last 1 hour',  samples: 30, stepMs: 120000,    sub: 'Last 1 hour · 2-minute samples',      spanLabel: 'Last 1 hour' },
  { id: '6h',  label: 'Last 6 hours', samples: 36, stepMs: 600000,    sub: 'Last 6 hours · 10-minute samples',    spanLabel: 'Last 6 hours' },
  { id: '24h', label: 'Last 24 hours',samples: 48, stepMs: 1800000,   sub: 'Last 24 hours · 30-minute samples',   spanLabel: 'Last 24 hours' },
  { id: '7d',  label: 'Last 7 days',  samples: 42, stepMs: 14400000,  sub: 'Last 7 days · 4-hour samples',        spanLabel: 'Last 7 days' },
]

const CUSTOM_SAMPLES = 60

function toLocalInput(d) {
  const p = (n) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Demo fallback: plausible wandering series, one per parameter key.
function demoData(N) {
  const gen = (base, amp, noise, seed, clamp1) => {
    const out = []; let s = seed
    for (let i = 0; i < N; i++) {
      s = (s * 9301 + 49297) % 233280
      const r = s / 233280
      let v = base + Math.sin(i / 4 + seed) * amp + (r - 0.5) * noise
      if (clamp1) v = Math.max(-1, Math.min(1, v))
      out.push(v)
    }
    return out
  }
  return {
    voltage: gen(231, 2.4, 3.0, 3),
    current: gen(42, 3.5, 4.0, 11),
    pf: gen(-0.90, 0.015, 0.02, 7, true), // signed PF (− = leading), ~ real reading (-0.9)
    active: gen(150, 14, 12, 5),
    apparent: gen(166, 15, 12, 9), // ≈ active / |pf|
  }
}

export default function App() {
  const rootRef = useRef(null)
  const [activeId, setActiveId] = useState('30m')
  const [token, setToken] = useState(null) // null = auth still resolving
  const [status, setStatus] = useState({ source: 'loading', note: 'Resolving authentication…' })
  const [refreshMs, setRefreshMs] = useState(30000) // 0 = off
  const [tick, setTick] = useState(0)
  const [meta, setMeta] = useState(null) // debug: device sensor list

  const nowInit = new Date()
  const [customFrom, setCustomFrom] = useState(() => toLocalInput(new Date(nowInit.getTime() - 24 * 3600000)))
  const [customTo, setCustomTo] = useState(() => toLocalInput(nowInit))

  // Resolve auth once on startup.
  useEffect(() => {
    let alive = true
    ensureAuth().then((t) => { if (alive) setToken(t || '') })
    return () => { alive = false }
  }, [])

  // Debug: load the device's sensor list so tag→name mapping can be verified.
  useEffect(() => {
    if (!DEBUG || !token) return
    let alive = true
    fetchDeviceMeta(DEVICE_ID, token)
      .then((d) => { if (alive) setMeta(d) })
      .catch((e) => { if (alive) setMeta({ error: e.message }) })
    return () => { alive = false }
  }, [token])

  // Auto-refresh: bump `tick` on the chosen interval; the data effect re-fetches.
  useEffect(() => {
    if (!refreshMs) return undefined
    const id = setInterval(() => setTick((t) => t + 1), refreshMs)
    return () => clearInterval(id)
  }, [refreshMs])

  useEffect(() => {
    if (token === null) return // wait for auth to resolve

    let cancelled = false
    let disposeRender = null

    // Build the time axis for the selected range.
    let samples, stepMs, endMs, sub, spanLabel
    if (activeId === 'custom') {
      const fromMs = new Date(customFrom).getTime()
      const toMs = new Date(customTo).getTime()
      if (!isFinite(fromMs) || !isFinite(toMs) || toMs <= fromMs) {
        samples = CUSTOM_SAMPLES; endMs = Date.now(); stepMs = (24 * 3600000) / (CUSTOM_SAMPLES - 1)
        sub = 'Custom range'; spanLabel = 'Custom range'
      } else {
        samples = CUSTOM_SAMPLES; endMs = toMs; stepMs = (toMs - fromMs) / (CUSTOM_SAMPLES - 1)
        sub = `${customFrom.replace('T', ' ')} → ${customTo.replace('T', ' ')}`; spanLabel = 'Custom range'
      }
    } else {
      const p = PRESETS.find((x) => x.id === activeId) || PRESETS[1]
      samples = p.samples; stepMs = p.stepMs; endMs = Date.now(); sub = p.sub; spanLabel = p.spanLabel
    }

    const timesMs = []
    for (let i = 0; i < samples; i++) timesMs.push(Math.round(endMs - (samples - 1 - i) * stepMs))
    const times = timesMs.map((ms) => new Date(ms))

    // Demo last-point map: last value at the window end.
    const demoLast = (dbk) => {
      const m = {}
      PARAM_DEFS.forEach((d) => {
        const arr = dbk[d.key] || []
        m[d.key] = arr.length ? { t: timesMs[timesMs.length - 1], v: arr[arr.length - 1] } : null
      })
      return m
    }

    ;(async () => {
      let dataByKey, lastByKey, source, note
      if (!token) {
        dataByKey = demoData(samples)
        lastByKey = demoLast(dataByKey)
        source = 'demo'
        note = 'No auth token — showing demo data. Open this report from the IOsense portal (adds ?token=…) or set localStorage["bearer_token"] to see live SSPEM_D2 readings.'
      } else {
        try {
          const sTime = timesMs[0]
          const eTime = timesMs[timesMs.length - 1]
          const results = await Promise.all(
            PARAM_DEFS.map((d) => fetchSensor(DEVICE_ID, d.sensor, sTime, eTime, token))
          )
          if (cancelled) return
          dataByKey = {}
          lastByKey = {}
          PARAM_DEFS.forEach((d, i) => {
            dataByKey[d.key] = resample(results[i], timesMs)
            const pts = results[i]
            lastByKey[d.key] = pts && pts.length ? { t: pts[pts.length - 1].t, v: pts[pts.length - 1].v } : null
          })
          const anyData = PARAM_DEFS.some((d) => (dataByKey[d.key] || []).some((v) => v != null && isFinite(v)))
          if (!anyData) {
            dataByKey = demoData(samples); lastByKey = demoLast(dataByKey); source = 'demo'
            note = `No readings returned for ${DEVICE_ID} in this range — showing demo data.`
          } else {
            source = 'live'; note = ''
          }
        } catch (e) {
          if (cancelled) return
          dataByKey = demoData(samples); lastByKey = demoLast(dataByKey); source = 'error'
          note = `Live fetch failed (${e.message}) — showing demo data.`
        }
      }
      if (cancelled) return
      setStatus({ source, note })
      disposeRender = renderReport(rootRef.current, { defs: PARAM_DEFS, times, dataByKey, lastByKey, sub, spanLabel })
    })()

    return () => { cancelled = true; if (disposeRender) disposeRender() }
  }, [activeId, customFrom, customTo, token, tick])

  const live = status.source === 'live'

  return (
    <div className="app" ref={rootRef}>
      <div className="wrap">
        <header className="rpt">
          <div>
            <h1>Energy Consumption Report</h1>
            <div className="sub">Real-time snapshot &middot; Voltage &middot; Current &middot; Power Factor &middot; Active Power</div>
          </div>
          <div className="meta">
            <span className={'live' + (live ? '' : ' off')}><span className="dot"></span>{live ? 'LIVE' : status.source.toUpperCase()}</span>
            <span>Device: <b>{DEVICE_ID}</b></span>
            <span>Sensors: <b>V·D4 &middot; I·D8 &middot; PF·D12 &middot; P·D16</b></span>
            <span id="ts">—</span>
          </div>
        </header>

        {/* Date/time range picker */}
        <div className="toolbar">
          <span className="tb-label">Range</span>
          <div className="chips">
            {PRESETS.map((p) => (
              <button key={p.id} type="button"
                className={'chip' + (activeId === p.id ? ' active' : '')}
                onClick={() => setActiveId(p.id)}>
                {p.label}
              </button>
            ))}
            <button type="button"
              className={'chip' + (activeId === 'custom' ? ' active' : '')}
              onClick={() => setActiveId('custom')}>
              Custom
            </button>
          </div>
          {activeId === 'custom' && (
            <div className="custom">
              <label>From
                <input type="datetime-local" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
              </label>
              <label>To
                <input type="datetime-local" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} />
              </label>
            </div>
          )}
          <div className="refresh">
            <label>Auto-refresh
              <select value={refreshMs} onChange={(e) => setRefreshMs(Number(e.target.value))}>
                <option value={0}>Off</option>
                <option value={10000}>10s</option>
                <option value={30000}>30s</option>
                <option value={60000}>1m</option>
                <option value={300000}>5m</option>
              </select>
            </label>
            <button type="button" className="chip" onClick={() => setTick((t) => t + 1)} title="Refresh now">↻</button>
          </div>
        </div>

        {status.note && (
          <div className={'banner' + (status.source === 'error' ? ' err' : '')}>{status.note}</div>
        )}

        {DEBUG && (
          <div className="banner">
            <b>Debug · {DEVICE_ID} sensors</b>
            {!meta && <div>Loading device metadata…</div>}
            {meta && meta.error && <div>Error: {meta.error}</div>}
            {meta && meta.sensors && (
              <div className="tbl-wrap" style={{ marginTop: 8 }}>
                <table>
                  <thead><tr><th>Sensor ID</th><th>Sensor name</th><th>Unit</th></tr></thead>
                  <tbody>
                    {meta.sensors.map((s) => (
                      <tr key={s.sensorId}>
                        <td style={{ textAlign: 'left' }}>{s.sensorId}</td>
                        <td style={{ textAlign: 'left' }}>{s.sensorName}</td>
                        <td style={{ textAlign: 'left' }}>{(meta.unitSelected && meta.unitSelected[s.sensorId]) || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="grid4" id="cards"></div>

        <section className="trend">
          <h2>Recent history</h2>
          <div className="sub" id="rangesub">Last 30 minutes · 1-minute samples · each series indexed to its own scale</div>
          <div className="legend" id="legend"></div>
          <div id="trend-chart"></div>
        </section>

        <div className="tbl-wrap">
          <table id="tbl">
            <thead>
              <tr>
                <th>Time</th>
                {PARAM_DEFS.map((d) => (
                  <th key={d.key}>{d.name}{d.unit ? ` (${d.unit})` : ''}</th>
                ))}
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>

        <footer className="rpt">Energy meter {DEVICE_ID} · Voltage D4 · Current D8 · Power Factor D12 · Active Power D16.</footer>
      </div>

      <div className="tooltip" id="tt"></div>
    </div>
  )
}
