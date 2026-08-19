import { useEffect, useRef, useState } from 'react'
import { renderReport } from './report.js'

// Date/time range presets. Each defines how many samples to draw, their spacing,
// and the labels shown in the trend subtitle and the per-card sparkline.
const PRESETS = [
  { id: '15m', label: 'Last 15 min', samples: 15, stepMs: 60000,      sub: 'Last 15 minutes · 1-minute samples',  spanLabel: 'Last 15 min' },
  { id: '30m', label: 'Last 30 min', samples: 30, stepMs: 60000,      sub: 'Last 30 minutes · 1-minute samples',  spanLabel: 'Last 30 min' },
  { id: '1h',  label: 'Last 1 hour', samples: 30, stepMs: 120000,     sub: 'Last 1 hour · 2-minute samples',      spanLabel: 'Last 1 hour' },
  { id: '6h',  label: 'Last 6 hours',samples: 36, stepMs: 600000,     sub: 'Last 6 hours · 10-minute samples',    spanLabel: 'Last 6 hours' },
  { id: '24h', label: 'Last 24 hours',samples: 48, stepMs: 1800000,   sub: 'Last 24 hours · 30-minute samples',   spanLabel: 'Last 24 hours' },
  { id: '7d',  label: 'Last 7 days', samples: 42, stepMs: 14400000,   sub: 'Last 7 days · 4-hour samples',        spanLabel: 'Last 7 days' },
]

const CUSTOM_SAMPLES = 60

// Format a Date for the <input type="datetime-local"> value (local time).
function toLocalInput(d) {
  const p = (n) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function App() {
  const rootRef = useRef(null)
  const [activeId, setActiveId] = useState('30m')

  // Custom range defaults to the last 24 hours.
  const nowInit = new Date()
  const [customFrom, setCustomFrom] = useState(() => toLocalInput(new Date(nowInit.getTime() - 24 * 3600000)))
  const [customTo, setCustomTo] = useState(() => toLocalInput(nowInit))

  useEffect(() => {
    let range
    if (activeId === 'custom') {
      const fromMs = new Date(customFrom).getTime()
      const toMs = new Date(customTo).getTime()
      // Fall back to last-24h if the inputs are missing or inverted.
      if (!isFinite(fromMs) || !isFinite(toMs) || toMs <= fromMs) {
        const end = Date.now()
        range = { samples: CUSTOM_SAMPLES, stepMs: (24 * 3600000) / (CUSTOM_SAMPLES - 1), endMs: end, sub: 'Custom range', spanLabel: 'Custom range' }
      } else {
        const stepMs = (toMs - fromMs) / (CUSTOM_SAMPLES - 1)
        const label = `${customFrom.replace('T', ' ')} → ${customTo.replace('T', ' ')}`
        range = { samples: CUSTOM_SAMPLES, stepMs, endMs: toMs, sub: label, spanLabel: 'Custom range' }
      }
    } else {
      const p = PRESETS.find((x) => x.id === activeId) || PRESETS[1]
      range = { samples: p.samples, stepMs: p.stepMs, endMs: Date.now(), sub: p.sub, spanLabel: p.spanLabel }
    }
    const cleanup = renderReport(rootRef.current, range)
    return cleanup
  }, [activeId, customFrom, customTo])

  return (
    <div className="app" ref={rootRef}>
      <div className="wrap">
        <header className="rpt">
          <div>
            <h1>Energy Consumption Report</h1>
            <div className="sub">Real-time snapshot &middot; Voltage &middot; Current &middot; Power Factor &middot; Max Demand</div>
          </div>
          <div className="meta">
            <span className="live"><span className="dot"></span>LIVE</span>
            <span>Device: <b id="dev">DVC-0000 (demo)</b></span>
            <span>Sensor: <b id="sen">SN-0000 (demo)</b></span>
            <span id="ts">—</span>
          </div>
        </header>

        {/* Date/time range picker */}
        <div className="toolbar">
          <span className="tb-label">Range</span>
          <div className="chips">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={'chip' + (activeId === p.id ? ' active' : '')}
                onClick={() => setActiveId(p.id)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className={'chip' + (activeId === 'custom' ? ' active' : '')}
              onClick={() => setActiveId('custom')}
            >
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
        </div>

        <div className="grid4" id="cards"></div>

        <section className="trend">
          <h2>Recent history</h2>
          <div className="sub" id="rangesub">Last 30 minutes · 1-minute samples · each series indexed to its own scale</div>
          <div className="legend" id="legend"></div>
          <div id="trend-chart"></div>
        </section>

        <div className="tbl-wrap">
          <table id="tbl">
            <thead><tr><th>Time</th><th>Voltage (V)</th><th>Current (A)</th><th>Power Factor</th><th>Max Demand (kW)</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>

        <footer className="rpt">Demo report with simulated data. Replace device/sensor IDs and wire to live readings to go production.</footer>
      </div>

      <div className="tooltip" id="tt"></div>
    </div>
  )
}
