# Energy Consumption Report

Real-time snapshot report for **Voltage, Current, Power Factor, and Max Demand**,
built as a **React** application (Create React App / `react-scripts`).

The UI, calculations, gauges, sparklines, recent-history trend (with hover
tooltip), data table, and the date/time range picker are unchanged — only the
toolchain is plain React (no Vite).

## Develop

```bash
npm install
npm start          # http://localhost:3000
```

## Build

```bash
npm run build      # outputs static files to build/
npx serve -s build # serve the production build locally
```

## Deploy — AI Studio Manager (CRA framework)

| Setting          | Value                 |
| ---------------- | --------------------- |
| Framework        | `cra`                 |
| Install command  | `npm install --force` |
| Build command    | `npm run build`       |
| Output directory | `build`               |
| Start command    | `serve -s build`      |
| SSR              | off (static)          |

`"homepage": "."` in `package.json` makes the build use relative asset paths, so
it works whether served from a domain root or a sub-path.

## Structure

```
public/index.html   HTML template (mounts #root)
src/
  index.js          React entry
  App.js            static shell that mirrors the original markup + range picker
  report.js         data + gauge/sparkline/trend/table rendering (ported verbatim)
  index.css         styles (ported verbatim, theme-aware light/dark)
```

## Wiring real data

The values are simulated in `src/report.js`. To go live, replace the `series(...)`
generators and the demo device/sensor IDs in `src/App.js` with real readings.
