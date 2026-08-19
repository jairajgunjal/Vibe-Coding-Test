// Energy consumption report rendering logic.
//
// This is the exact computation + rendering from the original standalone HTML
// report, parameterized to run against a provided root element (the React-mounted
// `.app` node) instead of `document`. Behavior, data, gauges, sparklines, the
// trend chart, hover tooltip, and table are preserved unchanged.
//
// Returns a cleanup function that detaches the hover listeners.

export function renderReport(root) {
  "use strict";

  function cssv(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }

  // ---- Simulated real-time data ---------------------------------------------
  var N = 30;                       // samples (minutes)
  var now = new Date();
  var times = [];
  for (var i = N - 1; i >= 0; i--) times.push(new Date(now.getTime() - i * 60000));

  // deterministic-ish wandering series so the report is stable per load
  function series(base, amp, noise, seed) {
    var out = [], v = base, s = seed;
    for (var i = 0; i < N; i++) {
      s = (s * 9301 + 49297) % 233280;
      var r = s / 233280;
      var wobble = Math.sin(i / 4 + seed) * amp;
      v = base + wobble + (r - 0.5) * noise;
      out.push(v);
    }
    return out;
  }

  var voltage = series(231, 2.4, 3.0, 3).map(function (x) { return +x.toFixed(1); });
  var current = series(42, 3.5, 4.0, 11).map(function (x) { return +x.toFixed(1); });
  var pf      = series(0.93, 0.02, 0.03, 7).map(function (x) { return +Math.min(1, x).toFixed(3); });
  var demand  = series(150, 14, 12, 5).map(function (x) { return +x.toFixed(1); });

  var last = N - 1;

  var params = [
    { key: "voltage", name: "Voltage", unit: "V",  data: voltage, val: voltage[last],
      min: 200, max: 250, nominal: 230, series: "--series-1",
      fmt: function (v) { return v.toFixed(1); },
      status: function (v) { return (v >= 207 && v <= 244) ? "good" : (v >= 200 && v <= 250 ? "warn" : "crit"); },
      range: "Nominal 230 V &middot; 200–250 V" },
    { key: "current", name: "Current", unit: "A",  data: current, val: current[last],
      min: 0, max: 100, nominal: null, series: "--series-2",
      fmt: function (v) { return v.toFixed(1); },
      status: function (v) { return v <= 80 ? "good" : (v <= 95 ? "warn" : "crit"); },
      range: "Rated 100 A" },
    { key: "pf", name: "Power Factor", unit: "", data: pf, val: pf[last],
      min: 0, max: 1, nominal: 1, series: "--series-3",
      fmt: function (v) { return v.toFixed(3); },
      status: function (v) { return v >= 0.90 ? "good" : (v >= 0.80 ? "warn" : "crit"); },
      range: "Target ≥ 0.90 (lag)" },
    { key: "demand", name: "Max Demand", unit: "kW", data: demand, val: Math.max.apply(null, demand),
      min: 0, max: 200, nominal: 200, series: "--series-4",
      fmt: function (v) { return v.toFixed(1); },
      status: function (v) { return v <= 160 ? "good" : (v <= 190 ? "warn" : "crit"); },
      range: "Contract limit 200 kW" }
  ];

  var STC = { good: "--good", warn: "--warning", crit: "--critical" };
  var STLABEL = { good: "Normal", warn: "High", crit: "Critical" };

  var ICON = {
    good: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4 6 12 3 9"/></svg>',
    warn: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2 15 14H1z"/><path d="M8 6v4"/><path d="M8 12h.01"/></svg>',
    crit: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v4"/><path d="M8 11h.01"/></svg>'
  };

  // ---- Semicircle gauge ------------------------------------------------------
  function polar(cx, cy, r, deg) {
    var a = (deg - 180) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function arc(cx, cy, r, a0, a1) {
    var p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    var large = (a1 - a0) > 180 ? 1 : 0;
    return "M" + p0[0].toFixed(2) + " " + p0[1].toFixed(2) +
           " A" + r + " " + r + " 0 " + large + " 1 " + p1[0].toFixed(2) + " " + p1[1].toFixed(2);
  }
  function gauge(p) {
    var W = 132, H = 84, cx = W / 2, cy = 76, r = 56, sw = 11;
    var frac = Math.max(0, Math.min(1, (p.val - p.min) / (p.max - p.min)));
    var end = frac * 180;
    var col = cssv(p.status(p.val) === "good" ? STC.good : STC[p.status(p.val)]);
    var svg = '<svg class="gauge" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">';
    svg += '<path d="' + arc(cx, cy, r, 0, 180) + '" fill="none" stroke="' + cssv("--track") + '" stroke-width="' + sw + '" stroke-linecap="round"/>';
    if (end > 0.5) svg += '<path d="' + arc(cx, cy, r, 0, end) + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '" stroke-linecap="round"/>';
    var kp = polar(cx, cy, r, end);
    svg += '<circle cx="' + kp[0].toFixed(2) + '" cy="' + kp[1].toFixed(2) + '" r="4.5" fill="' + col + '" stroke="' + cssv("--surface-1") + '" stroke-width="2"/>';
    svg += '</svg>';
    return svg;
  }

  // ---- Sparkline -------------------------------------------------------------
  function sparkline(data, colorVar, w, h) {
    w = w || 190; h = h || 40;
    var min = Math.min.apply(null, data), max = Math.max.apply(null, data);
    var pad = (max - min) * 0.15 || 1; min -= pad; max += pad;
    var col = cssv(colorVar);
    var pts = data.map(function (v, i) {
      var x = (i / (data.length - 1)) * (w - 6) + 3;
      var y = h - 4 - ((v - min) / (max - min)) * (h - 8);
      return [x, y];
    });
    var d = pts.map(function (pt, i) { return (i ? "L" : "M") + pt[0].toFixed(1) + " " + pt[1].toFixed(1); }).join(" ");
    var area = "M" + pts[0][0].toFixed(1) + " " + (h - 2) + " " + d.replace("M", "L").slice(1) +
               " L" + pts[pts.length - 1][0].toFixed(1) + " " + (h - 2) + " Z";
    var lastPt = pts[pts.length - 1];
    var svg = '<svg width="100%" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">';
    svg += '<path d="' + area + '" fill="' + col + '" fill-opacity="0.10"/>';
    svg += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    svg += '<circle cx="' + lastPt[0].toFixed(1) + '" cy="' + lastPt[1].toFixed(1) + '" r="3.5" fill="' + col + '" stroke="' + cssv("--surface-1") + '" stroke-width="2"/>';
    svg += '</svg>';
    return svg;
  }

  // ---- Render cards ----------------------------------------------------------
  var cardsEl = root.querySelector("#cards");
  cardsEl.innerHTML = "";
  params.forEach(function (p) {
    var st = p.status(p.val);
    var stClass = st === "good" ? "st-good" : st === "warn" ? "st-warn" : "st-crit";
    var el = document.createElement("div");
    el.className = "card";
    el.innerHTML =
      '<div class="top"><span class="name">' + p.name + '</span>' +
      '<span class="status ' + stClass + '">' + ICON[st] + STLABEL[st] + '</span></div>' +
      '<div class="body">' + gauge(p) +
        '<div class="readout"><div><span class="val">' + p.fmt(p.val) + '</span>' +
        (p.unit ? '<span class="unit">' + p.unit + '</span>' : '') + '</div>' +
        '<div class="rng">' + p.range + '</div></div></div>' +
      '<div class="spark"><div class="lbl"><span>Last 30 min</span><span>min ' +
        p.fmt(Math.min.apply(null, p.data)) + ' &middot; max ' + p.fmt(Math.max.apply(null, p.data)) + '</span></div>' +
        sparkline(p.data, p.series) + '</div>';
    cardsEl.appendChild(el);
  });

  // ---- Recent-history multi-line (indexed to each own scale) -----------------
  var legendEl = root.querySelector("#legend");
  legendEl.innerHTML = "";
  params.forEach(function (p) {
    var it = document.createElement("span");
    it.className = "item";
    it.innerHTML = '<span class="key" style="background:' + cssv(p.series) + '"></span>' + p.name + ' (' + (p.unit || "PF") + ')';
    legendEl.appendChild(it);
  });

  function normalize(data) {
    var min = Math.min.apply(null, data), max = Math.max.apply(null, data), rng = (max - min) || 1;
    return data.map(function (v) { return (v - min) / rng; });
  }
  var TW = 1000, TH = 240, ML = 8, MR = 8, MT = 12, MB = 26;
  var plotW = TW - ML - MR, plotH = TH - MT - MB;
  function tx(i) { return ML + (i / (N - 1)) * plotW; }
  function ty(f) { return MT + (1 - f) * plotH; }

  var chart = '<svg id="tsvg" width="100%" viewBox="0 0 ' + TW + ' ' + TH + '" style="display:block">';
  // gridlines
  for (var g = 0; g <= 4; g++) {
    var gy = MT + (g / 4) * plotH;
    chart += '<line x1="' + ML + '" y1="' + gy + '" x2="' + (TW - MR) + '" y2="' + gy + '" stroke="' + cssv("--grid") + '" stroke-width="1"/>';
  }
  // x labels (every ~10 min)
  [0, 10, 20, 29].forEach(function (i) {
    var t = times[i];
    var lbl = t.getHours().toString().padStart(2, "0") + ":" + t.getMinutes().toString().padStart(2, "0");
    chart += '<text x="' + tx(i).toFixed(1) + '" y="' + (TH - 8) + '" fill="' + cssv("--muted") + '" font-size="12" text-anchor="' + (i === 0 ? "start" : i === 29 ? "end" : "middle") + '">' + lbl + '</text>';
  });
  params.forEach(function (p) {
    var norm = normalize(p.data);
    var d = norm.map(function (f, i) { return (i ? "L" : "M") + tx(i).toFixed(1) + " " + ty(f).toFixed(1); }).join(" ");
    chart += '<path d="' + d + '" fill="none" stroke="' + cssv(p.series) + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    var le = norm.length - 1;
    chart += '<circle cx="' + tx(le).toFixed(1) + '" cy="' + ty(norm[le]).toFixed(1) + '" r="4" fill="' + cssv(p.series) + '" stroke="' + cssv("--surface-1") + '" stroke-width="2"/>';
  });
  chart += '<line id="cross" x1="0" y1="' + MT + '" x2="0" y2="' + (MT + plotH) + '" stroke="' + cssv("--baseline") + '" stroke-width="1" opacity="0"/>';
  chart += '</svg>';
  root.querySelector("#trend-chart").innerHTML = chart;

  // ---- Hover crosshair + tooltip --------------------------------------------
  var tt = root.querySelector("#tt");
  var svgEl = root.querySelector("#tsvg");
  var cross = root.querySelector("#cross");
  function onMove(e) {
    var rect = svgEl.getBoundingClientRect();
    var xr = (e.clientX - rect.left) / rect.width * TW;
    var idx = Math.round((xr - ML) / plotW * (N - 1));
    idx = Math.max(0, Math.min(N - 1, idx));
    cross.setAttribute("x1", tx(idx)); cross.setAttribute("x2", tx(idx)); cross.setAttribute("opacity", "1");
    var t = times[idx];
    var rows = params.map(function (p) {
      return '<div class="tt-r"><span class="k" style="background:' + cssv(p.series) + '"></span>' +
        p.name + ': <b>' + p.fmt(p.data[idx]) + (p.unit ? ' ' + p.unit : '') + '</b></div>';
    }).join("");
    tt.innerHTML = '<div class="tt-t">' + t.getHours().toString().padStart(2, "0") + ":" + t.getMinutes().toString().padStart(2, "0") + '</div>' + rows;
    tt.style.opacity = "1";
    var tx2 = e.clientX + 14, ty2 = e.clientY + 14;
    if (tx2 + 180 > window.innerWidth) tx2 = e.clientX - 194;
    tt.style.left = tx2 + "px"; tt.style.top = ty2 + "px";
  }
  function onLeave() { tt.style.opacity = "0"; cross.setAttribute("opacity", "0"); }
  svgEl.addEventListener("mousemove", onMove);
  svgEl.addEventListener("mouseleave", onLeave);

  // ---- Table -----------------------------------------------------------------
  var tb = root.querySelector("#tbl tbody");
  tb.innerHTML = "";
  for (var j = N - 1; j >= 0; j--) {
    var trow = times[j];
    var tr = document.createElement("tr");
    tr.innerHTML = "<td>" + trow.getHours().toString().padStart(2, "0") + ":" + trow.getMinutes().toString().padStart(2, "0") + "</td>" +
      "<td>" + voltage[j].toFixed(1) + "</td><td>" + current[j].toFixed(1) + "</td>" +
      "<td>" + pf[j].toFixed(3) + "</td><td>" + demand[j].toFixed(1) + "</td>";
    tb.appendChild(tr);
  }

  // ---- Timestamp -------------------------------------------------------------
  root.querySelector("#ts").textContent = "As of " +
    now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0") + ":" +
    now.getSeconds().toString().padStart(2, "0");

  // ---- Cleanup ---------------------------------------------------------------
  return function cleanup() {
    svgEl.removeEventListener("mousemove", onMove);
    svgEl.removeEventListener("mouseleave", onLeave);
  };
}
