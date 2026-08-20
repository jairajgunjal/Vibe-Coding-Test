// Data layer for the IOsense energy meter.
//
// Auth follows the platform pattern:
//   - ?token=xxx in the URL  -> exchange once via retrieve-sso-token, store the
//     returned "Bearer ..." JWT in localStorage['bearer_token'], clean the URL.
//   - otherwise fall back to localStorage['bearer_token'].
//   - ?authentication=<jwt> is also accepted as a dev convenience.
//
// Data comes from getDataCalibration (time-series within a range).

import { API_BASE } from './params.js'

export function getToken() {
  try { return localStorage.getItem('bearer_token') || '' } catch (e) { return '' }
}

// Resolve auth on startup. Returns the Bearer token (or '' if none available).
export async function ensureAuth() {
  let url
  try { url = new URL(window.location.href) } catch (e) { return getToken() }

  // Dev convenience: ?authentication=<jwt>
  const manual = url.searchParams.get('authentication')
  if (manual) {
    const val = manual.startsWith('Bearer ') ? manual : 'Bearer ' + manual
    try { localStorage.setItem('bearer_token', val) } catch (e) {}
    url.searchParams.delete('authentication')
    window.history.replaceState({}, '', url.toString())
  }

  // SSO one-time token exchange.
  const sso = url.searchParams.get('token')
  if (sso) {
    try {
      const r = await fetch(`${API_BASE}/api/retrieve-sso-token/${encodeURIComponent(sso)}`, {
        headers: {
          organisation: 'https://iosense.io',
          'ngsw-bypass': 'true',
          'Content-Type': 'application/json',
        },
      })
      const j = await r.json()
      if (j && j.success && j.token) {
        try { localStorage.setItem('bearer_token', j.token) } catch (e) {}
      }
    } catch (e) {
      // ignore — fall through to whatever is stored
    }
    url.searchParams.delete('token')
    window.history.replaceState({}, '', url.toString())
  }

  return getToken()
}

// Fetch one sensor's time-series in [sTime, eTime] (unix ms). Returns an ascending
// array of { t: ms, v: number }.
export async function fetchSensor(devID, sensor, sTime, eTime, token) {
  const url = `${API_BASE}/api/account/deviceData/getDataCalibration/${devID}/${sensor}/${sTime}/${eTime}/${true}`
  const r = await fetch(url, {
    headers: { Authorization: token, 'Content-Type': 'application/json' },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${sensor}`)
  const j = await r.json()

  // Response shape: { success, data: [[{time, value}, ...], ...] }
  let pts = []
  const d = j && j.data
  if (Array.isArray(d)) {
    for (const grp of d) {
      if (Array.isArray(grp)) pts = pts.concat(grp)
      else if (grp && typeof grp === 'object') pts.push(grp)
    }
  }
  return pts
    .map((p) => ({ t: new Date(p.time).getTime(), v: Number(p.value) }))
    .filter((p) => isFinite(p.t) && isFinite(p.v))
    .sort((a, b) => a.t - b.t)
}

// Last-observation-carried-forward resample of ascending points onto the given
// bucket times (ms). Leading gap is back-filled from the first point; a series
// with no points resamples to all-nulls.
export function resample(points, timesMs) {
  const out = new Array(timesMs.length).fill(null)
  if (!points || points.length === 0) return out
  let i = 0
  for (let k = 0; k < timesMs.length; k++) {
    while (i < points.length && points[i].t <= timesMs[k]) i++
    out[k] = i > 0 ? points[i - 1].v : points[0].v // back-fill leading gap
  }
  return out
}
