# Energy Consumption Report

Real-time snapshot report for **Voltage, Current, Power Factor, and Max Demand**,
built as a **React + Vite** static application.

The UI, calculations, gauges, sparklines, recent-history trend (with hover
tooltip), and data table are the original report, unchanged — only the project
has been restructured into a buildable React + Vite app.

## Develop

```bash
npm install --force
npm run dev        # http://localhost:5173
```

## Build

```bash
npm run build      # outputs static files to dist/
npm run preview    # serve the production build locally
```

## Deploy — AI Studio Manager (Vite framework)

| Setting          | Value             |
| ---------------- | ----------------- |
| Framework        | `vite`            |
| Install command  | `npm install --force` |
| Build command    | `npm run build`   |
| Output directory | `dist`            |
| Start command    | `npm run preview` |
| SSR              | off (static)      |

`vite.config.js` sets `base: './'` so the static build works whether it is served
from a domain root or a sub-path.

## Structure

```
index.html          Vite entry (mounts #root)
vite.config.js      base './', outDir dist
src/
  main.jsx          React entry
  App.jsx           static shell that mirrors the original markup
  report.js         data + gauge/sparkline/trend/table rendering (ported verbatim)
  index.css         styles (ported verbatim, theme-aware light/dark)
```

## Wiring real data

The values are simulated in `src/report.js`. To go live, replace the `series(...)`
generators and the demo device/sensor IDs in `src/App.jsx` with real readings.
