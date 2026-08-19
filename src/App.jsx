import { useEffect, useRef } from 'react'
import { renderReport } from './report.js'

// The static shell mirrors the original standalone report markup exactly.
// renderReport() fills the #cards, #legend, #trend-chart and table body, wires
// the hover tooltip, and sets the live timestamp — preserving the original
// behavior, calculations and styling unchanged.
export default function App() {
  const rootRef = useRef(null)

  useEffect(() => {
    const cleanup = renderReport(rootRef.current)
    return cleanup
  }, [])

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

        <div className="grid4" id="cards"></div>

        <section className="trend">
          <h2>Recent history</h2>
          <div className="sub">Last 30 minutes &middot; 1-minute samples &middot; each series indexed to its own scale</div>
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
