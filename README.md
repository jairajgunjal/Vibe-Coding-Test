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
  App.js            shell + range picker; resolves auth, fetches data, renders
  params.js         device + sensor map and per-parameter render metadata
  api.js            IOsense auth (SSO/bearer) + getDataCalibration fetch + resample
  report.js         gauge/sparkline/trend/table renderer (data injected)
  index.css         styles (theme-aware light/dark)
```

## Live data (IOsense energy meter)

Bound to device **SSPEM_D2**:

| Parameter    | Sensor |
| ------------ | ------ |
| Voltage      | D4     |
| Current      | D8     |
| Power Factor | D12    |
| Active Power | D16    |

Data is read from
`GET /api/account/deviceData/getDataCalibration/{devID}/{sensor}/{sTime}/{eTime}/true`
on `https://connector.iosense.io`, resampled onto the selected time window.

**Auth** (Bearer JWT), resolved in `src/api.js`:

1. `?token=<sso>` in the URL → exchanged once via `retrieve-sso-token`, stored as
   `localStorage['bearer_token']`, URL cleaned. (This is what the IOsense portal does.)
2. else an existing `localStorage['bearer_token']`.
3. dev convenience: `?authentication=<jwt>`.

Without a token (or if the fetch fails / returns nothing) the report falls back to
**demo data** and shows a banner — so it always renders.

To edit the device/sensors or thresholds, see `src/params.js`. Active Power's gauge
auto-scales to the data; its unit label (kW) and any limit are placeholders — adjust
in `params.js` to match the meter.
