// Energy consumption report renderer.
//
// Render-only: the data is supplied by the caller (real readings from the energy
// meter, or the demo fallback). Draws the parameter cards (gauge + readout +
// sparkline), the recent-history trend chart with hover tooltip, and the table.
//
//   model = {
//     defs:      PARAM_DEFS (name, unit, series, min, max, decimals, status, ...),
//     times:     Date[]                 // shared x-axis, ascending
//     dataByKey: { [key]: number[] }    // aligned to times, one array per def
//     sub:       string,                // trend subtitle
//     spanLabel: string,                // per-card sparkline window label
//   }
//
// Returns a cleanup function that detaches the hover listeners.

export function renderReport(root, model) {
  const defs = model.defs
  const times = model.times
  const dataByKey = model.dataByKey || {}

  function cssv(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }
  function pad(n) { return n.toString().padStart(2, "0"); }

  var N = times.length;
  var spanMs = N > 1 ? (times[N - 1].getTime() - times[0].getTime()) : 0;

  function fmtT(t) {
    var hm = pad(t.getHours()) + ":" + pad(t.getMinutes());
    if (spanMs > 3 * 86400000) return pad(t.getDate()) + "/" + pad(t.getMonth() + 1);
    if (spanMs > 86400000) return pad(t.getDate()) + "/" + pad(t.getMonth() + 1) + " " + hm;
    return hm;
  }
  function fmtV(p, v) {
    if (v == null || !isFinite(v)) return "—";
    return Number(v).toFixed(p.decimals);
  }
  function fmtStamp(t) {
    return pad(t.getDate()) + "/" + pad(t.getMonth() + 1) + " " +
           pad(t.getHours()) + ":" + pad(t.getMinutes()) + ":" + pad(t.getSeconds());
  }
  var lastByKey = model.lastByKey || {};

  // Assemble params: defs + injected data + current value.
  var params = defs.map(function (d) {
    var raw = dataByKey[d.key] || [];
    var data = raw.map(function (x) { return (x == null || !isFinite(x)) ? 0 : Number(x); });
    var val = data.length ? data[data.length - 1] : 0;
    var out = {};
    for (var k in d) out[k] = d[k];
    out.data = data;
    out.val = val;
    return out;
  });

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
  function gaugeMax(p) {
    if (!p.dynamicMax) return p.max;
    var mx = p.data.length ? Math.max.apply(null, p.data) : p.max;
    mx = mx * 1.1;
    return (isFinite(mx) && mx > p.min) ? mx : p.max;
  }
  function gauge(p) {
    var W = 132, H = 84, cx = W / 2, cy = 76, r = 56, sw = 11;
    var effMax = gaugeMax(p);
    var gval = p.abs ? Math.abs(p.val) : p.val;
    var frac = Math.max(0, Math.min(1, (gval - p.min) / (effMax - p.min)));
    var end = frac * 180;
    var st = p.status(p.val);
    var col = cssv(st === "good" ? STC.good : STC[st]);
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
    var pad2 = (max - min) * 0.15 || 1; min -= pad2; max += pad2;
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

  // ---- Range subtitle --------------------------------------------------------
  var subEl = root.querySelector("#rangesub");
  if (subEl) subEl.textContent = model.sub + " · each series indexed to its own scale";

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
        '<div class="readout"><div><span class="val">' + fmtV(p, p.val) + '</span>' +
        (p.unit ? '<span class="unit">' + p.unit + '</span>' : '') + '</div>' +
        '<div class="rng">' + p.range + '</div></div></div>' +
      '<div class="spark"><div class="lbl"><span>' + model.spanLabel + '</span><span>min ' +
        fmtV(p, Math.min.apply(null, p.data)) + ' &middot; max ' + fmtV(p, Math.max.apply(null, p.data)) + '</span></div>' +
        sparkline(p.data, p.series) + '</div>' +
      '<div class="last">' + (lastByKey[p.key]
        ? 'Last data point: <b>' + fmtV(p, lastByKey[p.key].v) + (p.unit ? ' ' + p.unit : '') + '</b> &middot; ' + fmtStamp(new Date(lastByKey[p.key].t))
        : 'No data point in range') + '</div>';
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

  var ticks = [0, Math.round((N - 1) / 3), Math.round(2 * (N - 1) / 3), N - 1]
    .filter(function (v, i, a) { return a.indexOf(v) === i; });

  var chart = '<svg id="tsvg" width="100%" viewBox="0 0 ' + TW + ' ' + TH + '" style="display:block">';
  for (var g = 0; g <= 4; g++) {
    var gy = MT + (g / 4) * plotH;
    chart += '<line x1="' + ML + '" y1="' + gy + '" x2="' + (TW - MR) + '" y2="' + gy + '" stroke="' + cssv("--grid") + '" stroke-width="1"/>';
  }
  ticks.forEach(function (i) {
    var t = times[i];
    var anchor = i === 0 ? "start" : (i === N - 1 ? "end" : "middle");
    chart += '<text x="' + tx(i).toFixed(1) + '" y="' + (TH - 8) + '" fill="' + cssv("--muted") + '" font-size="12" text-anchor="' + anchor + '">' + fmtT(t) + '</text>';
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
        p.name + ': <b>' + fmtV(p, p.data[idx]) + (p.unit ? ' ' + p.unit : '') + '</b></div>';
    }).join("");
    tt.innerHTML = '<div class="tt-t">' + fmtT(t) + '</div>' + rows;
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
    var tr = document.createElement("tr");
    var cells = "<td>" + fmtT(times[j]) + "</td>";
    for (var c = 0; c < params.length; c++) cells += "<td>" + fmtV(params[c], params[c].data[j]) + "</td>";
    tr.innerHTML = cells;
    tb.appendChild(tr);
  }

  // ---- Timestamp -------------------------------------------------------------
  var now = new Date();
  root.querySelector("#ts").textContent = "As of " +
    pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds());

  // ---- Cleanup ---------------------------------------------------------------
  return function cleanup() {
    svgEl.removeEventListener("mousemove", onMove);
    svgEl.removeEventListener("mouseleave", onLeave);
  };
}
