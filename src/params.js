// Device + sensor configuration for the energy meter, and the render metadata
// (units, gauge ranges, status thresholds) for each parameter.
//
// Energy meter device: SSPEM_D2
//   Voltage      -> D4
//   Current      -> D8
//   Power Factor -> D12
//   Active Power -> D16   (replaces the earlier "Max Demand")

export const API_BASE = 'https://connector.iosense.io'
export const DEVICE_ID = 'SSPEM_D2'
export const CALIBRATION = true

export const PARAM_DEFS = [
  {
    key: 'voltage', name: 'Voltage', sensor: 'D4', unit: 'V', series: '--series-1',
    min: 200, max: 250, decimals: 1, range: 'Nominal 230 V · 200–250 V',
    status: (v) => (v >= 207 && v <= 244) ? 'good' : ((v >= 200 && v <= 250) ? 'warn' : 'crit'),
  },
  {
    key: 'current', name: 'Current', sensor: 'D8', unit: 'A', series: '--series-2',
    min: 0, max: 100, decimals: 1, range: 'Rated 100 A',
    status: (v) => v <= 80 ? 'good' : (v <= 95 ? 'warn' : 'crit'),
  },
  {
    // Power factor is signed (− = leading/capacitive or reverse power). Quality is
    // judged on the magnitude |PF|, but the signed value is what gets displayed.
    key: 'pf', name: 'Power Factor', sensor: 'D12', unit: '', series: '--series-3',
    min: 0, max: 1, decimals: 3, abs: true, range: 'Target |PF| ≥ 0.90 · − = leading',
    status: (v) => { const a = Math.abs(v); return a >= 0.90 ? 'good' : (a >= 0.80 ? 'warn' : 'crit'); },
  },
  {
    // Active Power gauge auto-scales to the data, since the meter's magnitude
    // (and unit) depends on site rating; status is informational.
    key: 'active', name: 'Active Power', sensor: 'D16', unit: 'kW', series: '--series-4',
    min: 0, max: 250, decimals: 1, dynamicMax: true, range: 'Live from D16',
    status: () => 'good',
  },
  {
    // Apparent Power — auto-scaled gauge, informational status (like Active Power).
    key: 'apparent', name: 'Apparent Power', sensor: 'D20', unit: 'kVA', series: '--series-5',
    min: 0, max: 250, decimals: 1, dynamicMax: true, range: 'Live from D20',
    status: () => 'good',
  },
]
