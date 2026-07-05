// World Literacy Atlas — shared client. Detects page by element presence.
const DATA_URL = "data/geography.json";

// theme: auto (OS) / light / dark — applied immediately so there's no flash
const THEME_KEY = "wl-theme";
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  document.dispatchEvent(new Event("wl-theme"));  // canvas views re-read colours
}
applyTheme(localStorage.getItem(THEME_KEY) || "auto");

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const byIso = {};

// Region colour palette — grouped by continent (Africa=warm, Asia/ME=reds,
// Europe=blues, Americas=greens, Oceania=violet).
const REGION_COLORS = {
  "North Africa": "#E8A33D", "West Africa": "#D98324", "Central Africa": "#C56B2C",
  "East Africa": "#E5C35B", "Southern Africa": "#B5651D",
  "Middle East": "#C0504D", "Central Asia": "#D9776F", "South Asia": "#B5527A",
  "Southeast Asia": "#8E5572", "East Asia": "#A23B72",
  "Western Europe": "#3A6EA5", "Northern Europe": "#4C8FB0",
  "Eastern Europe": "#5B8C9E", "Southeast Europe": "#6FA8A0",
  "North America": "#3E8E5A", "Central America": "#5BA86E",
  "Caribbean": "#7BBF7B", "South America": "#2F7D55",
  "Oceania": "#7B6CB3",
};

const fmtPop = (n) => !n ? "—" : n >= 1e9 ? (n/1e9).toFixed(2)+"B"
  : n >= 1e6 ? (n/1e6).toFixed(1)+"M" : n >= 1e3 ? Math.round(n/1e3)+"k" : ""+n;
const fmtUSD = (n) => !n ? "—" : "$" + Math.round(n).toLocaleString("en-US");
const fmtArea = (n) => !n ? "—" : n >= 1e6 ? (n/1e6).toFixed(2)+"M km²"
  : Math.round(n).toLocaleString("en-US") + " km²";

// palette for composition stacks (religions, ethnic groups)
const COMP_COLORS = ["#3A6EA5","#C0504D","#3E8E5A","#E8A33D","#7B6CB3","#4C8FB0","#A23B72","#5BA86E","#D9776F","#6FA8A0"];

// History timeline — region-group lanes (fixed order) + colours
const TL_LANES = ["Europe", "Russia/Eurasia", "Americas", "Asia", "Middle East", "Africa", "Global"];
const TL_COLORS = {
  "Europe": "#3A6EA5", "Russia/Eurasia": "#C56B2C", "Americas": "#3E8E5A",
  "Asia": "#A23B72", "Middle East": "#C0504D", "Africa": "#E8A33D", "Global": "#7B6CB3",
};

// Per-field identity: description + presentation style for fields.html and the
// homepage tiles. Styles: entries (encyclopedia), people (portrait grid),
// essays (Threads stories), dashboard (Global Trends indicator grid).
const FIELD_META = {
  "History":       { style: "entries",   color: "#3A6EA5",
    desc: "From the first cities to today — what happened, and why it mattered, on one timeline." },
  "People":        { style: "people",    color: "#A23B72",
    desc: "The polymath canon — the figures you can't be historically literate without." },
  "Economics":     { style: "entries",   color: "#3E8E5A",
    desc: "The conceptual machinery of money and the economy." },
  "Geopolitics":   { style: "entries",   color: "#C0504D",
    desc: "The hard machinery of power — weapons, energy, trade and chips." },
  "Threads":       { style: "essays",    color: "#B5527A",
    desc: "The stories that run across everything else — places, long arcs, the 1945 order, fault lines." },
};
// Hidden from nav/tiles but still reachable (direct URL or search):
const FIELD_META_HIDDEN = {
  "Global Trends": { style: "dashboard", color: "#7B6CB3",
    desc: "How the world is actually doing — calibration against the data." },
};

// People-section medallion colours (portrait grid)
const PEOPLE_COLORS = {
  "Rulers & Empire-builders": "#C0504D", "Revolutionaries & Founders": "#D98324",
  "Philosophers & Thinkers": "#3A6EA5", "Scientists & Inventors": "#3E8E5A",
  "Faith & Moral Leaders": "#7B6CB3", "Renaissance & Visual Art": "#A23B72",
  "Writers & Composers": "#4C8FB0", "Explorers & Enterprise": "#B5651D",
};

// inline (Feather-style) icons — no icon library
const ICONS = {
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  area: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  card: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  bank: '<line x1="3" y1="21" x2="21" y2="21"/><path d="M4 21V10l8-5 8 5v11"/><line x1="9" y1="21" x2="9" y2="13"/><line x1="15" y1="21" x2="15" y2="13"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
};
const icon = (name, cls = "ic") => ICONS[name]
  ? `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
  : "";

// "Hindu 79.8%, Muslim 14.2%, … (2011 est.)" -> [{name,pct}, …]
function parsePct(str) {
  if (!str) return [];
  return str.replace(/\([^)]*\)/g, "").split(/[,;]/).map(s => {
    const m = s.trim().match(/^(.*?)\s*([\d.]+)\s*%$/);
    if (!m) return null;
    const name = m[1].replace(/^(and|of which)\s+/i, "").trim();
    const pct = parseFloat(m[2]);
    return (name && !isNaN(pct)) ? { name, pct } : null;
  }).filter(Boolean);
}

function compositionPanel(label, str, ic) {
  const items = parsePct(str);
  if (items.length < 2) return "";
  const sum = items.reduce((a, b) => a + b.pct, 0);
  const rem = Math.max(0, 100 - sum);
  const seg = (w, bg, t) => `<span style="width:${w}%;background:${bg}"${t ? ` title="${t}"` : ""}></span>`;
  const segs = items.map((it, i) => seg(it.pct, COMP_COLORS[i % COMP_COLORS.length], `${esc(it.name)} ${it.pct}%`)).join("")
    + (rem > 1.5 ? seg(rem, "var(--map-land)") : "");
  const legend = items.map((it, i) =>
    `<div><span class="sw" style="background:${COMP_COLORS[i % COMP_COLORS.length]}"></span><span>${esc(it.name)}</span><span class="pc">${it.pct}%</span></div>`).join("");
  return `<div class="panel"><h2>${ic ? icon(ic) + " " : ""}${esc(label)}</h2><div class="stack">${segs}</div><div class="stack-legend">${legend}</div></div>`;
}

async function load() {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error("Could not load " + DATA_URL);
  const data = await res.json();
  data.countries.forEach(c => { byIso[(c.iso2 || "").toLowerCase()] = c; });
  return data;
}

/* ---------- shared map helpers ---------- */
function mapTip() {
  let tip = document.querySelector(".map-tip");
  if (!tip) { tip = document.createElement("div"); tip.className = "map-tip"; document.body.appendChild(tip); }
  return tip;
}
function showTip(tip, e, c) {
  tip.innerHTML = `<div><img src="${esc(c.flag_url)}" alt=""><b>${esc(c.country)}</b></div>
    <div class="t-meta">${esc(c.region)} · ${esc(c.capital || "")} · ${esc(c.pop_disp || "")}</div>`;
  tip.style.opacity = 1;
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + w > innerWidth) x = e.clientX - w - pad;
  if (y + h > innerHeight) y = e.clientY - h - pad;
  tip.style.left = x + "px"; tip.style.top = y + "px";
}

/* ---------- map layers: choropleth shading + chokepoints ---------- */
let MAP_SHADE = "region", SHADE_BIN = null, CHOKES_ON = false;
const SHADE_COLORS = ["#d9e5f1", "#bcd2e8", "#9cbcdd", "#79a4d0", "#578bc0", "#3b70a8", "#27578c"];
function buildShadeBins(data, key) {
  const vals = data.countries.filter(c => c[key]).map(c => c[key]).sort((a, b) => a - b);
  SHADE_BIN = { key, th: SHADE_COLORS.map((_, i) =>
    vals[Math.min(vals.length - 1, Math.floor((i + 1) / SHADE_COLORS.length * vals.length))]) };
}
function shadeColor(c) {
  if (MAP_SHADE === "region") return REGION_COLORS[c.region] || "#999";
  const v = c[MAP_SHADE];
  if (!v) return "rgba(128,134,145,.35)";
  let i = 0;
  while (i < SHADE_BIN.th.length - 1 && v > SHADE_BIN.th[i]) i++;
  return SHADE_COLORS[i];
}
// the straits the Geopolitics deck teaches — plotted on the globe (lon, lat)
const CHOKEPOINTS = [
  { n: "Strait of Hormuz", lon: 56.6, lat: 26.6, q: "most important oil chokepoint" },
  { n: "Strait of Malacca", lon: 100.5, lat: 2.9, q: "Malacca Dilemma" },
  { n: "Suez Canal", lon: 32.4, lat: 30.5, q: "Suez Canal so important" },
  { n: "Panama Canal", lon: -79.7, lat: 9.1, q: "Panama Canal connect" },
  { n: "Bab-el-Mandeb", lon: 43.4, lat: 12.6, q: "southern entrance to the Red Sea" },
  { n: "Turkish Straits", lon: 29.0, lat: 41.1, q: "access to the Black Sea" },
  { n: "Cape of Good Hope", lon: 18.5, lat: -34.4, q: "which long detour" },
];

/* ---------- flat map (SVG) with zoom + pan ---------- */
function buildFlatMap(data) {
  const host = document.getElementById("worldmap");
  if (!host) return { zoomBy() {}, reset() {}, recolor() {} };
  host.classList.add("zoomable");
  const tip = mapTip();
  let svg = null, vb0 = null, vb = null;
  const apply = () => svg && svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

  function clampZoom() {
    const maxW = vb0.w, minW = vb0.w / 14;
    if (vb.w > maxW) { const s = maxW / vb.w; vb.w *= s; vb.h *= s; }
    if (vb.w < minW) { const s = minW / vb.w; vb.w *= s; vb.h *= s; }
    vb.x = Math.max(vb0.x, Math.min(vb.x, vb0.x + vb0.w - vb.w));
    vb.y = Math.max(vb0.y, Math.min(vb.y, vb0.y + vb0.h - vb.h));
  }
  function zoomAt(cx, cy, f) {
    if (!svg) return;
    vb.x = cx - (cx - vb.x) * f; vb.y = cy - (cy - vb.y) * f;
    vb.w *= f; vb.h *= f; clampZoom(); apply();
  }

  (async () => {
    let t; try { const r = await fetch("assets/world-states.svg"); if (!r.ok) throw 0; t = await r.text(); }
    catch { host.innerHTML = `<div class="empty">Map asset missing.</div>`; return; }
    host.innerHTML = t;
    svg = host.querySelector("svg");
    const paint = () => data.countries.forEach(c => {
      const g = host.querySelector(`g[id="${c.iso2}"]`);
      if (!g) return;
      g.classList.add("country");
      g.style.setProperty("--c", shadeColor(c));
      g.dataset.iso = (c.iso2 || "").toLowerCase();
    });
    paint();
    ret.recolor = paint;
    const a = (svg.getAttribute("viewBox") || "0 0 1000 507").split(/\s+/).map(Number);
    vb0 = { x: a[0], y: a[1], w: a[2], h: a[3] }; vb = { ...vb0 };

    let down = null, moved = false;
    svg.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY, vbx: vb.x, vby: vb.y }; moved = false;
      host.classList.add("grabbing"); svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener("pointermove", (e) => {
      if (down) {
        const rect = svg.getBoundingClientRect();
        if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 3) moved = true;
        vb.x = down.vbx - (e.clientX - down.x) * (vb.w / rect.width);
        vb.y = down.vby - (e.clientY - down.y) * (vb.h / rect.height);
        clampZoom(); apply(); tip.style.opacity = 0; return;
      }
      const g = e.target.closest("g.country"); const c = g && byIso[g.dataset.iso];
      if (c) showTip(tip, e, c); else tip.style.opacity = 0;
    });
    const end = () => { if (down) { host.classList.remove("grabbing"); down = null; } };
    svg.addEventListener("pointerup", (e) => {
      const wasMoved = moved; end();
      if (!wasMoved) { const g = e.target.closest("g.country"); if (g && g.dataset.iso) location.href = `country.html?iso=${g.dataset.iso}`; }
    });
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("mouseleave", () => { tip.style.opacity = 0; });
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const mx = vb.x + (e.clientX - rect.left) / rect.width * vb.w;
      const my = vb.y + (e.clientY - rect.top) / rect.height * vb.h;
      zoomAt(mx, my, e.deltaY < 0 ? 1 / 1.2 : 1.2);
    }, { passive: false });
  })();

  const ret = {
    zoomBy: (f) => { if (svg) zoomAt(vb.x + vb.w / 2, vb.y + vb.h / 2, 1 / f); },
    reset: () => { if (svg) { vb = { ...vb0 }; apply(); } },
    recolor: () => {},  // replaced once the SVG is loaded
  };
  return ret;
}

/* ---------- globe (canvas, d3-geo orthographic) ---------- */
const GLOBE_ALIAS = {
  "Dem. Rep. Congo": "DR Congo", "Congo": "Republic of the Congo",
  "Central African Rep.": "Central African Republic", "Dominican Rep.": "Dominican Republic",
  "Eq. Guinea": "Equatorial Guinea", "United States of America": "United States",
  "Bosnia and Herz.": "Bosnia and Herzegovina", "Macedonia": "North Macedonia",
  "S. Sudan": "South Sudan", "Solomon Is.": "Solomon Islands", "eSwatini": "Eswatini",
};
function buildGlobe(data) {
  const canvas = document.getElementById("globe");
  if (!canvas || typeof d3 === "undefined" || typeof topojson === "undefined")
    return { zoomBy() {}, reset() {}, resize() {} };
  const ctx = canvas.getContext("2d");
  const cv = (n, f) => getComputedStyle(document.body).getPropertyValue(n).trim() || f;
  const readColors = () => ({ ocean: cv("--globe-ocean", "#18202b"), land: cv("--map-land", "#34343d"), line: cv("--line", "#2e2e36"), accent: cv("--accent", "#8fb4d6"), ink: cv("--ink", "#e8ebf0") });
  let C = readColors();
  document.addEventListener("wl-theme", () => { C = readColors(); draw(); });
  const nameToIso = {}; data.countries.forEach(c => nameToIso[c.country] = c.iso2);
  const tip = mapTip();

  const proj = d3.geoOrthographic().clipAngle(90).precision(0.4);
  const path = d3.geoPath(proj, ctx);
  const sphere = { type: "Sphere" }, grat = d3.geoGraticule10();
  let features = [], rot = [-10, -18], W = 0, H = 0, scaleK = 1, hovered = null, ready = false, raf = false;

  const colorOf = (f) => { const c = f.__iso2 && byIso[f.__iso2.toLowerCase()]; return c ? shadeColor(c) : C.land; };

  const chokeVisible = (cp) => d3.geoDistance([cp.lon, cp.lat], [-rot[0], -rot[1]]) < Math.PI / 2 * 0.97;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); path(sphere); ctx.fillStyle = C.ocean; ctx.fill();
    ctx.beginPath(); path(grat); ctx.strokeStyle = C.line; ctx.globalAlpha = 0.5; ctx.lineWidth = 0.4; ctx.stroke(); ctx.globalAlpha = 1;
    for (const f of features) { ctx.beginPath(); path(f); ctx.fillStyle = f === hovered ? C.accent : colorOf(f); ctx.fill(); ctx.lineWidth = 0.4; ctx.strokeStyle = C.ocean; ctx.stroke(); }
    ctx.beginPath(); path(sphere); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
    if (CHOKES_ON) for (const cp of CHOKEPOINTS) {   // strait markers (Geopolitics deck)
      if (!chokeVisible(cp)) continue;
      const [px, py] = proj([cp.lon, cp.lat]);
      ctx.beginPath(); ctx.arc(px, py, 7, 0, 2 * Math.PI);
      ctx.strokeStyle = "#e4572e"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py, 2.6, 0, 2 * Math.PI);
      ctx.fillStyle = "#e4572e"; ctx.fill();
      ctx.font = "600 10.5px sans-serif"; ctx.fillStyle = C.ink;
      ctx.strokeStyle = C.ocean; ctx.lineWidth = 3; ctx.lineJoin = "round";
      ctx.strokeText(cp.n, px + 10, py + 3.5); ctx.fillText(cp.n, px + 10, py + 3.5);
    }
  }
  function size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.min(560, canvas.parentElement.clientWidth || 560); H = W;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    proj.translate([W / 2, H / 2]).scale((W / 2 - 6) * scaleK).rotate(rot);
    draw();
  }
  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    const p = proj.invert([e.clientX - r.left, e.clientY - r.top]);
    if (!p) return null;
    for (const f of features) if (f.__iso2 && d3.geoContains(f, p)) return f;
    return null;
  };

  (async () => {
    try {
      const topo = await (await fetch("assets/vendor/countries-110m.json")).json();
      features = topojson.feature(topo, topo.objects.countries).features;
      features.forEach(f => { const n = f.properties.name; f.__iso2 = nameToIso[n] || nameToIso[GLOBE_ALIAS[n]] || ""; });
      ready = true; draw();
    } catch { /* keep ocean-only globe */ }
  })();
  size();

  let down = null, moved = false;
  canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, rot: rot.slice() }; moved = false; canvas.classList.add("grabbing"); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      const k = 0.26 / scaleK;
      rot = [down.rot[0] + dx * k, Math.max(-90, Math.min(90, down.rot[1] - dy * k))];
      proj.rotate(rot); draw(); tip.style.opacity = 0; return;
    }
    if (!ready || raf) return; raf = true;
    requestAnimationFrame(() => {
      raf = false; const f = at(e);
      if (f !== hovered) { hovered = f; draw(); }
      const c = f && byIso[f.__iso2.toLowerCase()];
      if (c) showTip(tip, e, c); else tip.style.opacity = 0;
    });
  });
  const endG = () => { if (down) { canvas.classList.remove("grabbing"); down = null; } };
  canvas.addEventListener("pointerup", (e) => {
    const wasMoved = moved; endG();
    if (wasMoved || !ready) return;
    if (CHOKES_ON) {  // chokepoint hit? -> its Geopolitics card
      const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      for (const cp of CHOKEPOINTS) {
        if (!chokeVisible(cp)) continue;
        const [px, py] = proj([cp.lon, cp.lat]);
        if ((mx - px) ** 2 + (my - py) ** 2 < 144) {
          location.href = `fields.html?f=Geopolitics&q=${encodeURIComponent(cp.q)}`; return;
        }
      }
    }
    const f = at(e); if (f && f.__iso2) location.href = `country.html?iso=${f.__iso2.toLowerCase()}`;
  });
  canvas.addEventListener("pointercancel", endG);
  canvas.addEventListener("mouseleave", () => { tip.style.opacity = 0; if (hovered) { hovered = null; draw(); } });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); scaleK = Math.max(0.6, Math.min(6, scaleK * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); proj.scale((W / 2 - 6) * scaleK); draw(); }, { passive: false });
  window.addEventListener("resize", () => { if (!canvas.hidden) size(); });

  return {
    zoomBy: (f) => { scaleK = Math.max(0.6, Math.min(6, scaleK * f)); proj.scale((W / 2 - 6) * scaleK); draw(); },
    reset: () => { scaleK = 1; rot = [-10, -18]; proj.scale(W / 2 - 6).rotate(rot); draw(); },
    resize: () => size(),
    redraw: () => draw(),
  };
}

/* ---------- map view coordinator (Flat | Globe + zoom buttons) ---------- */
function setupMaps(data) {
  // both maps build lazily — the globe is the default, so the 1.3 MB flat-map
  // SVG is only fetched if the user actually switches to Flat
  let flat = null, globe = null, view = "flat";
  const viewToggle = document.getElementById("mapView");
  const zoomCtl = document.getElementById("mapZoom");
  const active = () => (view === "globe" ? globe : flat);
  function setView(v) {
    view = v;
    if (viewToggle) viewToggle.querySelectorAll("button").forEach(x => x.classList.toggle("active", x.dataset.v === view));
    document.getElementById("worldmap").hidden = view !== "flat";
    document.getElementById("globe").hidden = view !== "globe";
    if (view === "globe") { if (!globe) globe = buildGlobe(data); else globe.resize(); }
    else if (!flat) flat = buildFlatMap(data);
  }
  if (viewToggle) viewToggle.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    setView(b.dataset.v);
  });
  setView("globe");  // the globe is the atlas's front face

  // layer controls: choropleth shading + the chokepoints overlay
  const tb = document.querySelector(".map-toolbar");
  if (tb) {
    const sel = document.createElement("select");
    sel.id = "shadeSel";
    sel.innerHTML = `<option value="region">Colour: region</option>
      <option value="pop_num">Colour: population</option>
      <option value="gdp_num">Colour: GDP per capita</option>
      <option value="area_num">Colour: area</option>`;
    const ck = document.createElement("button");
    ck.id = "chokeBtn"; ck.type = "button"; ck.textContent = "⚓ Chokepoints";
    tb.insertBefore(ck, zoomCtl); tb.insertBefore(sel, ck);

    const legendEl = document.getElementById("legend");
    let legendOrig = null;
    sel.addEventListener("change", () => {
      MAP_SHADE = sel.value;
      if (MAP_SHADE !== "region") {
        buildShadeBins(data, MAP_SHADE);
        if (legendEl) {
          if (legendOrig === null) legendOrig = legendEl.innerHTML;
          legendEl.innerHTML = `<span class="shade-lbl">low</span>` +
            SHADE_COLORS.map(cl => `<span class="sw shade-sw" style="background:${cl}"></span>`).join("") +
            `<span class="shade-lbl">high · grey = no data</span>`;
        }
      } else if (legendEl && legendOrig !== null) legendEl.innerHTML = legendOrig;
      if (flat) flat.recolor();
      if (globe) globe.redraw();
    });
    ck.addEventListener("click", () => {
      CHOKES_ON = !CHOKES_ON;
      ck.classList.toggle("active", CHOKES_ON);
      if (CHOKES_ON && view !== "globe") setView("globe");  // markers live on the globe
      else if (globe) globe.redraw();
    });
  }

  if (zoomCtl) zoomCtl.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const a = active(); if (!a) return;
    if (b.dataset.z === "in") a.zoomBy(1.4);
    else if (b.dataset.z === "out") a.zoomBy(1 / 1.4);
    else a.reset();
  });
}

/* ---------- legend (region filter) ---------- */
function buildLegend(data, regionSelect, onFilter) {
  const el = document.getElementById("legend");
  if (!el) return;
  el.innerHTML = data.regions.map(r =>
    `<button data-region="${esc(r)}"><span class="sw" style="background:${REGION_COLORS[r] || "#999"}"></span>${esc(r)}</button>`
  ).join("");
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const r = b.dataset.region;
    const active = b.classList.contains("active");
    el.querySelectorAll("button").forEach(x => x.classList.remove("active"));
    regionSelect.value = active ? "" : r;
    if (!active) b.classList.add("active");
    onFilter();
    // dim non-selected regions on the map
    document.querySelectorAll("#worldmap g.country").forEach(g => {
      const c = byIso[g.dataset.iso];
      g.style.opacity = (active || !c || c.region === r) ? "" : "0.25";
    });
  });
}

/* ---------- ranking charts ---------- */
function buildRankings(data) {
  const tabsEl = document.getElementById("rankTabs");
  const barsEl = document.getElementById("ranks");
  if (!tabsEl || !barsEl) return;
  const metrics = {
    "Population": { key: "pop_num", fmt: fmtPop },
    "GDP per capita": { key: "gdp_num", fmt: fmtUSD },
    "Area": { key: "area_num", fmt: fmtArea },
  };
  const names = Object.keys(metrics);
  tabsEl.innerHTML = names.map((n, i) =>
    `<button data-m="${n}"${i === 0 ? ' class="active"' : ""}>${n}</button>`).join("");

  function draw(name) {
    const { key, fmt } = metrics[name];
    const rows = data.countries.filter(c => c[key]).sort((a, b) => b[key] - a[key]).slice(0, 15);
    const max = rows[0] ? rows[0][key] : 1;
    barsEl.innerHTML = rows.map(c => `
      <div class="bar-row">
        <a class="lbl" href="country.html?iso=${esc((c.iso2 || "").toLowerCase())}">${esc(c.country)}</a>
        <div class="bar-track"><div class="bar-fill" style="width:${(c[key] / max * 100).toFixed(1)}%;background:${REGION_COLORS[c.region] || "var(--accent)"}"></div></div>
        <span class="bar-val">${fmt(c[key])}</span>
      </div>`).join("");
  }
  tabsEl.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    tabsEl.querySelectorAll("button").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    draw(b.dataset.m);
  });
  draw(names[0]);
}

/* ---------- index (atlas grid) ---------- */
async function initIndex() {
  const grid = document.getElementById("grid");
  let data;
  try { data = await load(); }
  catch (e) {
    grid.innerHTML = `<div class="empty">${esc(e.message)}<br>
      Run <code>py build_web.py</code>, then serve with <code>py -m http.server 8000</code>.</div>`;
    return;
  }

  // hero — the front door: the system in one line, search as the primary action,
  // and one tile per field (live counts fill in when cards.json arrives)
  const hero = document.getElementById("hero");
  if (hero) {
    const tiles = Object.entries(FIELD_META).map(([n, m]) => `
      <a class="ftile" href="fields.html?f=${encodeURIComponent(n)}" style="--fc:${m.color}">
        <div class="ft-n">${esc(n)}</div>
        <div class="ft-d">${esc(m.desc)}</div>
        <div class="ft-c" data-f="${esc(n)}"></div>
      </a>`).join("");
    hero.innerHTML = `
      <h1>How the world works, in one place.</h1>
      <p class="hero-sub">${data.countries.length} countries on the globe below — and five connected fields:
        history from the first cities to today, the people, the money, the power,
        and the threads between them.</p>
      <button class="hero-search" id="heroSearch">Search countries, people, events, cards…
        <kbd>Ctrl K</kbd></button>
      <div class="ftiles">${tiles}</div>`;
    document.getElementById("heroSearch").addEventListener("click", () => {
      const b = document.getElementById("osbtn"); if (b) b.click();
    });
    getCards().then(cd => cd.fields.forEach(f => {
      const el = hero.querySelector(`.ft-c[data-f="${CSS.escape(f.name)}"]`);
      if (el) el.textContent = `${f.count} entries`;
    }));
  }

  const q = document.getElementById("q");
  const region = document.getElementById("region");
  const sort = document.getElementById("sort");
  const count = document.getElementById("count");

  data.regions.forEach(r => {
    const o = document.createElement("option");
    o.value = r; o.textContent = r; region.appendChild(o);
  });

  // metric sort where missing values (Liechtenstein/Vatican GDP, etc.) always
  // sort LAST instead of as 0 — so they never look like the "lowest".
  const cmpMetric = (key, asc) => (a, b) => {
    const av = a[key] || null, bv = b[key] || null;
    if (av == null && bv == null) return a.country.localeCompare(b.country);
    if (av == null) return 1;
    if (bv == null) return -1;
    return asc ? av - bv : bv - av;
  };
  const sorters = {
    country: (a, b) => a.country.localeCompare(b.country),
    pop_desc: cmpMetric("pop_num", false),
    pop_asc: cmpMetric("pop_num", true),
    gdp_desc: cmpMetric("gdp_num", false),
    gdp_asc: cmpMetric("gdp_num", true),
    area_desc: cmpMetric("area_num", false),
  };
  // which metric a card shows, by active sort
  const SORT_METRIC = {
    pop_desc: ["pop_num", fmtPop], pop_asc: ["pop_num", fmtPop],
    gdp_desc: ["gdp_num", fmtUSD], gdp_asc: ["gdp_num", fmtUSD],
    area_desc: ["area_num", fmtArea],
  };

  function render() {
    const term = q.value.trim().toLowerCase();
    const reg = region.value;
    let rows = data.countries.filter(c => {
      if (reg && c.region !== reg) return false;
      if (!term) return true;
      return (c.country || "").toLowerCase().includes(term)
          || (c.capital || "").toLowerCase().includes(term);
    });
    rows.sort(sorters[sort.value] || sorters.country);
    count.textContent = `${rows.length} of ${data.count}`;
    if (!rows.length) { grid.innerHTML = `<div class="empty">No matches.</div>`; return; }
    const m = SORT_METRIC[sort.value];
    grid.innerHTML = rows.map(c => {
      const metaVal = m ? (c[m[0]] ? m[1](c[m[0]]) : "No data") : (c.pop_disp || "");
      return `
      <a class="card" href="country.html?iso=${esc((c.iso2 || "").toLowerCase())}">
        <img class="flag" loading="lazy" src="${esc(c.flag_url)}" alt="Flag of ${esc(c.country)}">
        <div class="region">${esc(c.region)}</div>
        <div class="name">${esc(c.country)}</div>
        <div class="meta">${esc(c.capital || "—")} · ${metaVal === "No data" ? '<span style="opacity:.6">No data</span>' : esc(metaVal)}</div>
      </a>`;
    }).join("");
  }
  q.addEventListener("input", render);
  region.addEventListener("change", render);
  sort.addEventListener("change", render);
  render();
  buildRankings(data);
  buildLegend(data, region, render);
  setupMaps(data);
}

/* ---------- country detail ---------- */
async function initCountry() {
  const el = document.getElementById("detail");
  let data;
  try { data = await load(); } catch (e) { el.innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }

  const iso = new URLSearchParams(location.search).get("iso") || "";
  const c = byIso[iso.toLowerCase()];
  if (!c) { el.innerHTML = `<p class="empty">Country not found. <a href="index.html">Back to atlas</a></p>`; return; }
  document.title = `${c.country} — World Literacy`;

  const ordinal = (n) => n + (["th","st","nd","rd"][(n % 100 - 20) % 10] || ["th","st","nd","rd"][n] || "th");
  const fact = (label, val, ic) => val ? `<div class="fact"><dt>${ic ? icon(ic) : ""}${esc(label)}</dt><dd>${val}</dd></div>` : "";

  const neighbors = (c.neighbors || "").split(",").map(s => s.trim()).filter(Boolean);
  const neighborHtml = neighbors.length
    ? `<div class="neighbors">${neighbors.map(n => {
        const m = data.countries.find(x => x.country === n);
        return m ? `<a href="country.html?iso=${esc((m.iso2 || "").toLowerCase())}">${esc(n)}</a>`
                 : `<span class="" style="opacity:.7">${esc(n)}</span>`;
      }).join("")}</div>` : "—";

  // world rank for a metric -> position on a low→high strip (answers "compared to what?")
  function rankInfo(key) {
    if (!c[key]) return null;
    const sorted = data.countries.filter(x => x[key]).sort((a, b) => b[key] - a[key]);
    const r = sorted.findIndex(x => x.iso2 === c.iso2) + 1, n = sorted.length;
    return { pos: n > 1 ? ((n - r) / (n - 1) * 100) : 50, text: `${ordinal(r)} of ${n} worldwide` };
  }

  // stat tiles with icon + rank strip ("No data" when the source lacks a value)
  const tile = (ic, key, fmt, lbl) => {
    const has = !!c[key], rank = has ? rankInfo(key) : null;
    const num = has ? `<div class="tnum">${fmt(c[key])}</div>`
                    : `<div class="tnum" style="font-size:18px;color:var(--muted)">No data</div>`;
    return `<div class="tile">
      <div class="tile-top">${icon(ic, "ic ic-lg")}<span class="tlbl">${lbl}</span></div>
      ${num}
      ${rank ? `<div class="rankstrip"><div class="track"><span class="marker" style="left:${rank.pos.toFixed(1)}%"></span></div></div><div class="tsub">${rank.text}</div>` : ""}
    </div>`;
  };
  const tilesHtml = [
    tile("users", "pop_num", fmtPop, "Population"),
    tile("area", "area_num", fmtArea, "Area"),
    tile("dollar", "gdp_num", fmtUSD, "GDP per capita"),
  ].join("");

  // composition charts (fall back to text in details if unparseable)
  const relPanel = compositionPanel("Religions", c.religions, "book");
  const ethPanel = compositionPanel("Ethnic groups", c.ethnic_groups, "users");
  const compositionHtml = relPanel + ethPanel;

  const sectionTitle = (t) => `<h2 style="font-family:var(--sans);font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:34px 0 12px">${t}</h2>`;
  const locatorHtml = `<div class="vh">${icon("pin")} Location</div><div class="locator" id="locator"><div class="empty">Loading map…</div></div>`;
  const visualRow = compositionHtml
    ? `<div class="panels"><div>${locatorHtml}</div><div class="vcol">${compositionHtml}</div></div>`
    : `<div style="margin:24px 0">${locatorHtml}</div>`;

  el.innerHTML = `
    <div class="top">
      <img src="${esc(c.flag_url)}" alt="Flag of ${esc(c.country)}">
      <div>
        <h1>${esc(c.country)}</h1>
        <div class="sub">${esc(c.region)} · capital ${esc(c.capital || "—")}${c.landlocked ? " · landlocked" : ""}</div>
      </div>
    </div>
    ${c.background ? `<p class="lead">${esc(c.background)}</p>` : ""}
    <div class="tiles">${tilesHtml}</div>
    ${visualRow}
    ${sectionTitle("Details")}
    <dl class="facts">
      ${fact("Currency", esc(c.currency), "card")}
      ${fact("Government", esc(c.gov_type), "bank")}
      ${fact("Languages", esc(c.languages), "globe")}
      ${relPanel ? "" : fact("Religions", esc(c.religions), "book")}
      ${ethPanel ? "" : fact("Ethnic groups", esc(c.ethnic_groups), "users")}
      ${fact("Independence", esc(c.independence), "calendar")}
      ${fact("Natural resources", esc(c.natural_resources), "box")}
      ${fact("Main exports", esc(c.exports), "send")}
      ${fact("Neighbors", neighborHtml, "share")}
      ${fact("Flag", esc(c.flag_desc), "flag")}
    </dl>
    <div id="insystem"></div>
    <a class="back" href="index.html">← Back to atlas</a>`;

  // upgrade the lead paragraph with the full Factbook background (kept out of
  // geography.json for weight — fetched only here, where it's read)
  (async () => {
    try {
      const bgs = await (await fetch("data/backgrounds.json")).json();
      const full = bgs[c.iso2], leadEl = el.querySelector(".lead");
      if (full && leadEl) leadEl.textContent = full;
    } catch {}
  })();

  // "In this system" — the link layer: everything the corpus knows about this
  // country (its people, its events, every card across the fields that touches it).
  (async () => {
    const host = document.getElementById("insystem");
    const links = await getLinks(), cd = await getCards();
    const entry = (links.countries || {})[iso.toLowerCase()];
    if (!host || !entry || (!entry.people.length && !entry.cards.length)) return;
    const byName = {}; cd.fields.forEach(f => byName[f.name] = f.cards);
    let html = sectionTitle("In this system");
    if (entry.people.length && byName["People"]) {
      html += `<div class="dos-field">People</div><div class="dos-people">` +
        entry.people.map(i => {
          const p = byName["People"][i];
          return `<a class="chip" href="person.html?n=${encodeURIComponent(p.front.split(" — ")[0])}">${esc(p.front)}</a>`;
        }).join("") + `</div>`;
    }
    const groups = {};
    entry.cards.forEach(([f, i]) => byName[f] && (groups[f] = groups[f] || []).push(byName[f][i]));
    for (const [fname, cards] of Object.entries(groups)) {
      html += `<div class="dos-field">${esc(fname)}</div>` + cards.map(cc => `
        <details class="dcard"><summary>${esc(cc.front)}</summary>
          <div class="a">${linkify(esc(cc.back))}</div>
          ${cc.extra ? `<div class="x">${linkify(esc(cc.extra))}</div>` : ""}
        </details>`).join("");
    }
    host.innerHTML = html;
  })();

  // locator map — highlight this country + neighbours, zoom to its bounding box
  (async () => {
    const host = document.getElementById("locator");
    if (!host) return;
    let svgText;
    try { const r = await fetch("assets/world-states.svg"); if (!r.ok) throw 0; svgText = await r.text(); }
    catch { host.innerHTML = `<div class="empty">Map unavailable.</div>`; return; }
    host.innerHTML = svgText;
    const svg = host.querySelector("svg");
    const g = host.querySelector(`g[id="${c.iso2}"]`);
    if (!g) { host.innerHTML = `<div class="empty">Not on map.</div>`; return; }
    g.classList.add("hot");
    (c.neighbors || "").split(",").map(s => s.trim()).filter(Boolean).forEach(n => {
      const m = data.countries.find(x => x.country === n);
      const ng = m && host.querySelector(`g[id="${m.iso2}"]`);
      if (ng) ng.classList.add("nbr");
    });
    try {
      const bb = g.getBBox();
      const ext = Math.max(bb.width, bb.height, 25), pad = ext * 0.8;
      svg.removeAttribute("width"); svg.removeAttribute("height");
      svg.setAttribute("viewBox", `${bb.x - pad} ${bb.y - pad} ${bb.width + 2 * pad} ${bb.height + 2 * pad}`);
    } catch {}
  })();
}

/* ---------- person page (dossier per figure) ---------- */
async function initPerson() {
  const el = document.getElementById("person");
  const name = new URLSearchParams(location.search).get("n") || "";
  const [cd, links, ports] = await Promise.all([getCards(), getLinks(), getPortraits()]);
  const people = (cd.fields.find(f => f.name === "People") || { cards: [] }).cards;
  const idx = people.findIndex(c => c.front.split(" — ")[0] === name);
  if (idx < 0) {
    el.innerHTML = `<p class="empty">Person not found. <a href="fields.html?f=People">All people →</a></p>`;
    return;
  }
  const p = people[idx];
  document.title = `${name} — World Literacy`;
  const role = p.front.split(" — ").slice(1).join(" — ");
  const port = ports[name] || {};
  const col = PEOPLE_COLORS[p.section] || "var(--accent)";
  const initials = name.split(/\s+/).filter(w => /^[A-ZÀ-Þ]/.test(w)).slice(0, 2).map(w => w[0]).join("") || name[0];
  const wiki = port.url || `https://en.wikipedia.org/wiki/${encodeURIComponent(name.replace(/ /g, "_"))}`;

  const homes = (p.home || []).map(iso =>
    `<a class="chip" href="country.html?iso=${esc(iso)}">${esc((links.isoNames || {})[iso] || iso.toUpperCase())}</a>`).join("");

  // contemporaries — overlapping lifespans, nearest births first
  let contemp = "";
  if (p.time) {
    contemp = people
      .filter((o, j) => j !== idx && o.time &&
        o.time.year_start <= p.time.year_end && o.time.year_end >= p.time.year_start)
      .sort((a, b) => Math.abs(a.time.year_start - p.time.year_start) - Math.abs(b.time.year_start - p.time.year_start))
      .slice(0, 8)
      .map(o => { const on = o.front.split(" — ")[0];
        return `<a class="chip" href="person.html?n=${encodeURIComponent(on)}">${esc(on)} <span class="chip-f">${esc(o.dates || "")}</span></a>`; })
      .join("");
  }

  // the world during their life — History events overlapping the lifespan
  let during = "";
  if (p.time) {
    during = ((cd.fields.find(f => f.name === "History") || { cards: [] }).cards)
      .filter(c => c.time && c.time.year_start <= p.time.year_end && c.time.year_end >= p.time.year_start)
      .slice(0, 8)
      .map(c => `<a class="chip" href="fields.html?f=History&q=${encodeURIComponent(c.front.slice(0, 40))}">${esc(c.front)}</a>`)
      .join("");
  }

  const t = (s) => `<h2 class="ptitle">${s}</h2>`;
  el.innerHTML = `
    <div class="ptop" style="--pc:${col}">
      <span class="pmed pmed-xl">${esc(initials)}${port.img ? `<img src="${esc(port.img)}" alt="${esc(name)}">` : ""}</span>
      <div>
        <h1>${esc(name)}</h1>
        <div class="sub">${esc(role)}${p.dates ? ` · ${esc(p.dates)}` : ""}${p.region ? ` · ${esc(p.region)}` : ""}</div>
        <div class="sub2"><span class="pbadge">${esc(p.section)}</span>
          <a href="${esc(wiki)}" target="_blank" rel="noopener">Wikipedia ↗</a></div>
      </div>
    </div>
    <p class="lead">${linkify(esc(p.back))}</p>
    ${t("Why they matter")}<p class="pwhy">${linkify(esc(p.why || ""))}</p>
    ${homes ? t("Place") + `<div class="dos-people">${homes}</div>` : ""}
    ${contemp ? t("Contemporaries") + `<div class="dos-people">${contemp}</div>` : ""}
    ${during ? t("The world during their life") + `<div class="dos-people">${during}</div>` : ""}
    <a class="back" href="fields.html?f=People">← All people</a>`;
}

/* ---------- explore (data table + Gapminder-style scatter) ---------- */
async function initExplore() {
  let data;
  try { data = await load(); } catch (e) {
    document.getElementById("scatter").innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }

  // ---- scatter: GDP per capita (log x) vs population (log y), r = area ----
  const host = document.getElementById("scatter");
  const pts = data.countries.filter(c => c.gdp_num && c.pop_num)
    .sort((a, b) => (b.area_num || 0) - (a.area_num || 0));  // big bubbles behind
  const W = 960, H = 500, M = { l: 62, r: 18, t: 14, b: 42 };
  const lg = Math.log10;
  const x0 = Math.floor(Math.min(...pts.map(c => lg(c.gdp_num)))),
        x1 = Math.ceil(Math.max(...pts.map(c => lg(c.gdp_num)))),
        y0 = Math.floor(Math.min(...pts.map(c => lg(c.pop_num)))),
        y1 = Math.ceil(Math.max(...pts.map(c => lg(c.pop_num))));
  const X = v => M.l + (lg(v) - x0) / (x1 - x0) * (W - M.l - M.r);
  const Y = v => H - M.b - (lg(v) - y0) / (y1 - y0) * (H - M.t - M.b);
  const R = c => Math.max(3, Math.sqrt(c.area_num || 2e4) / 240);
  let s = "";
  for (let e = x0; e <= x1; e++)
    s += `<line class="ax" x1="${X(10 ** e)}" y1="${M.t}" x2="${X(10 ** e)}" y2="${H - M.b}"/>
          <text class="axl" x="${X(10 ** e)}" y="${H - M.b + 18}" text-anchor="middle">$${(10 ** e).toLocaleString("en-US")}</text>`;
  for (let e = y0; e <= y1; e++)
    s += `<line class="ax" x1="${M.l}" y1="${Y(10 ** e)}" x2="${W - M.r}" y2="${Y(10 ** e)}"/>
          <text class="axl" x="${M.l - 8}" y="${Y(10 ** e) + 4}" text-anchor="end">${fmtPop(10 ** e)}</text>`;
  s += pts.map(c => `<a href="country.html?iso=${(c.iso2 || "").toLowerCase()}">
    <circle cx="${X(c.gdp_num).toFixed(1)}" cy="${Y(c.pop_num).toFixed(1)}" r="${R(c).toFixed(1)}"
      fill="${REGION_COLORS[c.region] || "#999"}" fill-opacity=".72" stroke="var(--panel)" stroke-width=".8">
      <title>${esc(c.country)} — ${fmtUSD(c.gdp_num)}/cap · ${fmtPop(c.pop_num)} · ${fmtArea(c.area_num)}</title>
    </circle></a>`).join("");
  s += `<text class="axt" x="${(M.l + W - M.r) / 2}" y="${H - 6}" text-anchor="middle">GDP per capita (log)</text>
        <text class="axt" x="14" y="${(M.t + H - M.b) / 2}" transform="rotate(-90 14 ${(M.t + H - M.b) / 2})" text-anchor="middle">Population (log)</text>`;
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;

  // ---- the full table: sortable, filterable, all the fields the UI never showed ----
  const COLS = [
    { k: "country", t: "Country" }, { k: "region", t: "Region" }, { k: "capital", t: "Capital" },
    { k: "pop_num", t: "Population", num: true, f: fmtPop },
    { k: "gdp_num", t: "GDP/cap", num: true, f: fmtUSD },
    { k: "area_num", t: "Area", num: true, f: fmtArea },
    { k: "landlocked", t: "Landlocked", f: v => v ? "yes" : "" },
    { k: "currency", t: "Currency" }, { k: "exports", t: "Top exports" },
  ];
  const q = document.getElementById("q"), regionSel = document.getElementById("region"),
        count = document.getElementById("count"), table = document.getElementById("dtable");
  data.regions.forEach(r => { const o = document.createElement("option"); o.value = o.textContent = r; regionSel.appendChild(o); });
  let sortK = "country", sortDir = 1;
  function render() {
    const term = q.value.trim().toLowerCase(), reg = regionSel.value;
    let rows = data.countries.filter(c =>
      (!reg || c.region === reg) &&
      (!term || `${c.country} ${c.capital} ${c.currency} ${c.exports} ${c.languages}`.toLowerCase().includes(term)));
    const col = COLS.find(c => c.k === sortK);
    rows = rows.slice().sort((a, b) => col.num
      ? ((a[sortK] || -1) - (b[sortK] || -1)) * sortDir
      : String(a[sortK] || "").localeCompare(String(b[sortK] || "")) * sortDir);
    count.textContent = `${rows.length} of ${data.countries.length}`;
    table.innerHTML = `<thead><tr>${COLS.map(c =>
      `<th data-k="${c.k}" class="${c.num ? "num" : ""}${sortK === c.k ? " sorted" : ""}">${c.t}${sortK === c.k ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(c => `<tr>${COLS.map(col2 => {
        const raw = c[col2.k], v = col2.f ? col2.f(raw) : (raw || "");
        const cell = col2.k === "country"
          ? `<a href="country.html?iso=${(c.iso2 || "").toLowerCase()}">${esc(c.country)}</a>` : esc(String(v));
        return `<td class="${col2.num ? "num" : ""}">${cell}</td>`;
      }).join("")}</tr>`).join("")}</tbody>`;
  }
  table.addEventListener("click", (e) => {
    const th = e.target.closest("th"); if (!th) return;
    if (sortK === th.dataset.k) sortDir = -sortDir; else { sortK = th.dataset.k; sortDir = 1; }
    render();
  });
  q.addEventListener("input", render);
  regionSel.addEventListener("change", render);
  render();
}

/* ---------- fields (card browser) ---------- */
async function initFields() {
  const wrap = document.getElementById("cards");
  let data;
  try {
    const res = await fetch("data/cards.json");
    if (!res.ok) throw new Error("Could not load data/cards.json");
    data = await res.json();
  } catch (e) {
    wrap.innerHTML = `<div class="empty">${esc(e.message)}<br>Run <code>py build_web.py</code> first.</div>`;
    return;
  }

  const num = (s) => { const m = String(s).replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0; };
  const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;

  function renderCard(c) {
    if (c.viz) {
      const v = c.viz, a = num(v.v0), b = num(v.v1);
      const max = Math.max(a, b, 1);
      const dir = b < a ? "down" : b > a ? "up" : "flat";
      const arrow = b < a ? "↓" : b > a ? "↑" : "→";
      // "Better"/"Worse" verdicts colour by sentiment; bare directions colour by motion
      const vd = (v.verdict || "").toLowerCase();
      const cls = vd.includes("better") ? "up" : vd.includes("worse") ? "down"
        : vd.includes("same") ? "flat" : dir;
      return `<div class="qa trend">
        <div class="badge">Indicator</div>
        <div class="q">${esc(cap(v.label))}</div>
        <div class="verdict ${cls}">${arrow} ${esc(v.verdict)}</div>
        <div class="trend-bars">
          <div class="tb"><span class="ty">${esc(v.y0)}</span><div class="bar-track"><div class="bar-fill then" style="width:${(a/max*100).toFixed(1)}%"></div></div><span class="tv">${esc(v.v0)}</span></div>
          <div class="tb"><span class="ty">${esc(v.y1)}</span><div class="bar-track"><div class="bar-fill now" style="width:${(b/max*100).toFixed(1)}%"></div></div><span class="tv">${esc(v.v1)}</span></div>
        </div>
        ${v.why ? `<div class="x">${esc(v.why)}</div>` : ""}
      </div>`;
    }
    return `<div class="qa">
      ${c.section ? `<div class="badge">${esc(c.section)}</div>` : ""}
      <div class="q">${linkify(esc(c.front))}</div>
      <div class="a">${linkify(esc(c.back))}</div>
      ${c.extra ? `<div class="x">${linkify(esc(c.extra))}</div>` : ""}
    </div>`;
  }

  const params = new URLSearchParams(location.search);
  let fieldName = params.get("f") || (data.fields[0] && data.fields[0].name);
  let field = data.fields.find(f => f.name === fieldName) || data.fields[0];
  if (!field) { wrap.innerHTML = `<div class="empty">No fields found.</div>`; return; }
  document.title = `${field.name} — World Literacy`;

  // highlight active nav link
  document.querySelectorAll("#nav a").forEach(a => {
    if (a.getAttribute("href") === `fields.html?f=${field.name}`) a.classList.add("active");
  });

  await getLinks();  // country-name regex for clickable card text
  CARDSDATA = data;  // share with see-also / omnisearch (same payload)
  await getPortraits();  // People portraits (tiny; medallion fallback offline)

  const meta = FIELD_META[field.name] || FIELD_META_HIDDEN[field.name]
    || { style: "entries", color: "var(--accent)", desc: "" };
  const byName = {}; data.fields.forEach(f => byName[f.name] = f.cards);

  // field header — give the page an identity beyond "cards"
  document.getElementById("fieldhead").innerHTML = `
    <div class="fh" style="--fc:${meta.color}">
      <h1>${esc(field.name)}</h1>
      <p>${esc(meta.desc)} <span class="fh-n">${field.count} entries · ${field.sections.length} sections</span></p>
    </div>`;

  const q = document.getElementById("q");
  const count = document.getElementById("count");
  q.value = params.get("q") || "";  // deep-linkable search (omnisearch, dossiers)
  q.placeholder = `Search ${field.name}…`;

  // section chips (replaces the old <select>)
  let sec = "";
  const chipsEl = document.getElementById("secchips");
  chipsEl.innerHTML = [`<button class="active" data-s="">All</button>`,
    ...field.sections.map(s => `<button data-s="${esc(s)}">${esc(s)}</button>`)].join("");
  chipsEl.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    sec = b.dataset.s;
    chipsEl.querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
    render();
  });

  // "See also" — the link layer made ambient: cards sharing this card's
  // countries, cross-field first. Turns every entry into a trailhead.
  function seeAlso(c, idx) {
    if (!c.iso || !LINKS) return "";
    const counts = {};
    c.iso.forEach(iso => ((LINKS.countries[iso] || {}).cards || []).forEach(([f, i]) => {
      if (f === field.name && i === idx) return;
      const k = f + "\x1f" + i; counts[k] = (counts[k] || 0) + 1;
    }));
    const top = Object.entries(counts)
      .map(([k, n]) => { const [f, i] = k.split("\x1f"); return { f, i: +i, n, same: f === field.name ? 1 : 0 }; })
      .sort((a, b) => a.same - b.same || b.n - a.n).slice(0, 3);
    if (!top.length) return "";
    return `<div class="rel">${top.map(({ f, i }) => {
      const t = byName[f][i];
      const label = (t.kind === "event" || f === "People" ? t.front : t.front).slice(0, 64);
      return `<a class="chip" href="fields.html?f=${encodeURIComponent(f)}&q=${encodeURIComponent(t.front.slice(0, 40))}">
        <span class="chip-f">${esc(f)}</span>${esc(label)}</a>`;
    }).join("")}</div>`;
  }

  /* ---- per-field renderers ---- */
  function renderEntry(c, i) {
    let title = c.front, when = "";
    if (c.kind === "event") {
      const m = c.front.match(/^(.*)\s\(([^)]+)\)$/);
      if (m) { title = m[1]; when = m[2]; }
    }
    let extra = c.extra || "", region = "";
    const rm = extra.match(/\n\nRegion: (.+)$/);
    if (rm) { region = rm[1]; extra = extra.slice(0, rm.index); }
    return `<article class="entry">
      ${when || region ? `<div class="entry-meta">${when ? `<span class="when">${esc(when)}</span>` : ""}${region ? `<span class="where">${esc(region)}</span>` : ""}</div>` : ""}
      <h3>${linkify(esc(title))}</h3>
      <p class="lead">${linkify(esc(c.back))}</p>
      ${extra ? `<p class="ctx">${linkify(esc(extra))}</p>` : ""}
      ${seeAlso(c, i)}
    </article>`;
  }

  function renderPerson(c, i) {
    const [name, ...rest] = c.front.split(" — ");
    const role = rest.join(" — ");
    const initials = name.split(/\s+/).filter(w => /^[A-ZÀ-Þ]/.test(w)).slice(0, 2).map(w => w[0]).join("") || name[0];
    const col = PEOPLE_COLORS[c.section] || "var(--accent)";
    const img = ((PORTRAITS || {})[name] || {}).img;  // portrait; medallion beneath as fallback
    return `<div class="pcard" data-i="${i}" style="--pc:${col}">
      <div class="phead"><span class="pmed">${esc(initials)}${img
        ? `<img src="${esc(img)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span>
        <div><div class="pname"><a href="person.html?n=${encodeURIComponent(name)}">${esc(name)}</a></div><div class="prole">${esc(role)}</div>
        <div class="pdates">${esc(c.dates || "")}</div></div></div>
      <div class="pbody"><p class="lead">${linkify(esc(c.back))}</p>
        <p class="ctx">${linkify(esc(c.why || c.extra))}</p></div>
    </div>`;
  }

  function renderEssay(c, i) {
    let extra = c.extra || "", pulls = "";
    const m = extra.match(/\(Pulls together ([^)]+)\)\s*$/);
    if (m) { pulls = m[1]; extra = extra.slice(0, m.index).trim(); }
    return `<article class="essay">
      <div class="badge">${esc(c.section)}</div>
      <h3>${linkify(esc(c.front))}</h3>
      <p class="body">${linkify(esc(c.back))}</p>
      ${extra ? `<p class="ctx">${linkify(esc(extra))}</p>` : ""}
      ${pulls ? `<div class="pulls">↳ Pulls together ${linkify(esc(pulls))}</div>` : ""}
      ${seeAlso(c, i)}
    </article>`;
  }

  function render() {
    const term = q.value.trim().toLowerCase();
    const rows = field.cards.map((c, i) => ({ c, i })).filter(({ c }) => {
      if (sec && c.section !== sec) return false;
      if (!term) return true;
      return (c.front + " " + c.back + " " + c.extra).toLowerCase().includes(term);
    });
    count.textContent = `${rows.length} of ${field.count}`;
    if (!rows.length) { wrap.className = "cards"; wrap.innerHTML = `<div class="empty">No matches.</div>`; return; }
    const style = meta.style;
    wrap.className = "cards style-" + style;
    if (style === "people") {
      wrap.innerHTML = rows.map(({ c, i }) => renderPerson(c, i)).join("");
      return;
    }
    // Inline section headers only when sections are contiguous — event decks
    // are ordered chronologically, so their sections interleave (headers would
    // repeat and mislead; the chips carry the section UI there).
    let changes = 0, prev = null;
    for (const { c } of rows) { if (c.section !== prev) { changes++; prev = c.section; } }
    const useHeaders = changes <= new Set(rows.map(r => r.c.section)).size;
    let html = "", cur = null;
    for (const { c, i } of rows) {
      if (useHeaders && c.section !== cur) { cur = c.section; html += `<h2 class="sec-h">${esc(cur)}</h2>`; }
      html += c.viz ? renderCard(c)
        : style === "essays" ? renderEssay(c, i)
        : renderEntry(c, i);
    }
    wrap.innerHTML = html;
  }
  q.addEventListener("input", render);
  wrap.addEventListener("click", (e) => {   // portrait grid: tap to open the "why"
    if (e.target.closest("a")) return;
    const p = e.target.closest(".pcard"); if (p) p.classList.toggle("open");
  });
  render();

  /* ---- timeline view (History only) ---- */
  const timelineEl = document.getElementById("timeline");
  let timelineBuilt = false;

  function buildTimeline(withPeople = false) {
    const events = field.cards.filter(c => c.time);
    const maxYear = Math.ceil((Math.max(...events.map(e => e.time.year_end)) + 4) / 10) * 10;
    const minYear = Math.min(...events.map(e => e.time.year_start));
    // Piecewise time scale — 5,000 years on one axis: sparse deep antiquity,
    // denser classical world, a compressed band for the eras not yet built
    // (500–1900), then the modern world at full resolution. With the People
    // layer on, the 500–1900 band opens to real scale (that's where the
    // Renaissance lives) instead of the compressed gap.
    const SEGS = minYear < 550 ? [
      { a: Math.min(-3300, minYear), b: -1000, ppy: 0.16, tick: 500 },
      { a: -1000, b: 550, ppy: 0.85, tick: 250 },
      { a: 550, b: 1500, ppy: 0.58, tick: 100 },   // the medieval millennium, real scale
      withPeople ? { a: 1500, b: 1900, ppy: 0.75, tick: 50 }
                 : { a: 1500, b: 1900, px: 120, gap: true },
      { a: 1900, b: maxYear, ppy: 26, tick: 10 },
    ] : [{ a: Math.floor(minYear / 10) * 10, b: maxYear, ppy: 26, tick: 10 }];
    let accX = 0;
    SEGS.forEach(s => { s.x0 = accX; s.w = s.gap ? s.px : (s.b - s.a) * s.ppy; accX += s.w; });
    const innerW = accX;
    const x = (y) => {
      const yy = Math.max(SEGS[0].a, Math.min(y, SEGS[SEGS.length - 1].b));
      const s = SEGS.find(g => yy <= g.b);
      return s.x0 + (yy - s.a) * (s.w / (s.b - s.a));
    };
    const fmtYear = (y) => y < 0 ? `${-y} BCE` : `${y}`;
    const lanes = TL_LANES.filter(L => events.some(e => e.time.region_group === L));
    const ROW = 28, PADTOP = 9, PADBOT = 7;
    const estW = (title) => Math.min(168, title.length * 6.6 + 32);

    // pack each lane's events into sub-rows so labelled chips never overlap
    const laneData = lanes.map(L => {
      const evs = events.map((e, i) => ({ e, i }))
        .filter(o => o.e.time.region_group === L)
        .sort((a, b) => a.e.time.year_start - b.e.time.year_start);
      const rowRight = [];
      evs.forEach(o => {
        const t = o.e.time, left = x(t.year_start);
        const w = estW(t.title);
        let row = 0;
        while (row < rowRight.length && rowRight[row] > left - 6) row++;
        rowRight[row] = left + w;
        o.left = left; o.spanW = x(t.year_end) - x(t.year_start); o.row = row;
      });
      return { L, evs, height: PADTOP + Math.max(1, rowRight.length) * ROW + PADBOT };
    });

    // Period bands: the canonical periodisation, NOT the decks' sections —
    // sections are thematic (Byzantium / The East / Wider Worlds all span the
    // same centuries), so deriving bands from them stamps overlapping labels.
    // Fixed periods are non-overlapping by construction.
    const PERIODS = [
      { n: "Antiquity", a: -3300, b: 500 },
      { n: "The Middle Ages", a: 500, b: 1500 },
      { n: "Early Modern", a: 1500, b: 1789 },
      { n: "The Long 19th Century", a: 1789, b: 1914 },
      { n: "20th Century", a: 1914, b: 2000 },
      { n: "21st Century", a: 2000, b: 9999 },
    ].filter(p => p.a < maxYear && p.b > SEGS[0].a);
    const inGap = (p) => SEGS.some(s => s.gap && p.a >= s.a && p.b <= s.b);
    const eraTints = PERIODS.map((p, i) => i % 2 === 0 ? "" :
      `<div class="tl-era" style="left:${x(p.a).toFixed(1)}px;width:${(x(Math.min(p.b, maxYear)) - x(p.a)).toFixed(1)}px"></div>`).join("");
    const lblRight = [0, 0];  // two-row packing for the tight joints
    const eraLabels = PERIODS.filter(p => !inGap(p)).map(p => {
      // if the period *starts* inside a compressed gap, label it from the gap's end
      const gapSeg = SEGS.find(s => s.gap && p.a >= s.a && p.a < s.b);
      const left = x(gapSeg ? gapSeg.b : p.a) + 6, w = p.n.length * 6.6 + 14;
      const r = left >= lblRight[0] - 2 ? 0
        : left >= lblRight[1] - 2 ? 1
        : (lblRight[0] <= lblRight[1] ? 0 : 1);
      lblRight[r] = left + w;
      return `<span class="tl-era-lbl" style="left:${left.toFixed(1)}px;top:${4 + r * 14}px">${esc(p.n)}</span>`;
    }).join("");

    let ticks = "";
    const seen = new Set();  // segment joints share a year — emit once
    for (const s of SEGS) {
      if (s.gap) continue;
      for (let y = Math.ceil(s.a / s.tick) * s.tick; y <= s.b; y += s.tick) {
        if (seen.has(y)) continue;
        seen.add(y);
        ticks += `<div class="tl-tick" style="left:${x(y)}px"><span>${fmtYear(y)}</span></div>`;
      }
    }
    const gapHtml = SEGS.filter(s => s.gap).map(s =>
      `<div class="tl-gapband" style="left:${s.x0}px;width:${s.w}px"><span>1500 – 1900<br>eras to come</span></div>`).join("");

    const laneHtml = laneData.map(ld => {
      const inner = ld.evs.map(o => {
        const t = o.e.time, color = TL_COLORS[ld.L], top = PADTOP + o.row * ROW;
        const span = t.year_end > t.year_start
          ? `<div class="tl-span" style="left:${o.left}px;top:${top + 9}px;width:${o.spanW}px;background:${color}"></div>` : "";
        return `${span}<div class="tl-event" data-i="${o.i}" style="left:${o.left}px;top:${top}px" title="${esc(t.title)} · ${esc(t.when)}"><span class="dot" style="background:${color}"></span><span class="ttl">${esc(t.title)}</span></div>`;
      }).join("");
      return `<div class="tl-lane" data-region="${esc(ld.L)}" style="height:${ld.height}px">${inner}</div>`;
    }).join("");

    // People layer — every dated figure as a lifespan bar, packed into rows
    let peopleHtml = "", peopleLabel = "";
    if (withPeople) {
      const ppl = ((CARDSDATA && CARDSDATA.fields.find(f => f.name === "People")) || { cards: [] })
        .cards.filter(p => p.time)
        .sort((a, b) => a.time.year_start - b.time.year_start);
      const rowRight = [];
      const items = ppl.map(p => {
        const t = p.time, name = p.front.split(" — ")[0];
        const left = x(t.year_start), w = Math.max(5, x(t.year_end) - x(t.year_start));
        const lw = Math.max(w, estW(name));
        let row = 0;
        while (row < rowRight.length && rowRight[row] > left - 6) row++;
        rowRight[row] = left + lw;
        const color = PEOPLE_COLORS[p.section] || "#888";
        return `<a class="tl-person" href="person.html?n=${encodeURIComponent(name)}"
          style="left:${left.toFixed(1)}px;top:${PADTOP + row * 21}px"
          title="${esc(name)} · ${esc(p.dates || "")}">
          <span class="pbar" style="width:${w.toFixed(1)}px;background:${color}"></span>
          <span class="pn">${esc(name)}</span></a>`;
      }).join("");
      const h = PADTOP + Math.max(1, rowRight.length) * 21 + PADBOT;
      peopleHtml = `<div class="tl-lane tl-peoplelane" style="height:${h}px">${items}</div>`;
      peopleLabel = `<div class="lane-label" style="height:${h}px"><span class="sw" style="background:#A23B72"></span>People</div>`;
    }

    const chips = `<button class="tl-ppl${withPeople ? " active" : ""}" data-people="1">◉ People: ${withPeople ? "on" : "off"}</button>`
      + lanes.map(L =>
      `<button data-region="${esc(L)}"><span class="sw" style="background:${TL_COLORS[L]}"></span>${esc(L)}</button>`).join("");
    const labels = laneData.map(ld =>
      `<div class="lane-label" data-region="${esc(ld.L)}" style="height:${ld.height}px"><span class="sw" style="background:${TL_COLORS[ld.L]}"></span>${esc(ld.L)}</div>`).join("")
      + peopleLabel;

    timelineEl.innerHTML = `
      <div class="tl-chips" id="tlChips">${chips}</div>
      <div class="timeline-grid">
        <div class="tl-labels"><div class="tl-axis-spacer"></div><div class="tl-eralabels-spacer"></div>${labels}</div>
        <div class="tl-scroll"><div class="tl-inner" style="width:${innerW}px">
          <div class="tl-axis">${ticks}</div>
          <div class="tl-era-row">${eraLabels}</div>
          <div class="tl-eras">${eraTints}</div>
          ${gapHtml}
          <div class="tl-lanes">${laneHtml}${peopleHtml}</div>
        </div></div>
      </div>
      <div class="tl-panel" id="tlPanel"><div class="tl-empty">Click an event to read what happened and why it mattered.</div></div>`;

    const panel = document.getElementById("tlPanel");
    timelineEl.querySelector(".tl-lanes").addEventListener("click", (ev) => {
      const node = ev.target.closest(".tl-event"); if (!node) return;
      timelineEl.querySelectorAll(".tl-event.sel").forEach(n => n.classList.remove("sel"));
      node.classList.add("sel");
      const e = events[+node.dataset.i], t = e.time, why = (e.extra || "").split(/\n\nRegion:/)[0];
      panel.innerHTML = `<div class="tp-when">${esc(t.when)} · ${esc(t.region)} · ${esc(t.era)}</div>
        <div class="tp-title">${esc(t.title)}</div><div class="tp-what">${esc(e.back)}</div>
        ${why ? `<div class="tp-why">${esc(why)}</div>` : ""}`;
    });

    let selRegion = "";
    document.getElementById("tlChips").addEventListener("click", (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.people) {  // rebuild with the layer toggled; remember the choice
        localStorage.setItem("wl-tl-people", withPeople ? "off" : "on");
        buildTimeline(!withPeople); return;
      }
      selRegion = selRegion === b.dataset.region ? "" : b.dataset.region;
      timelineEl.querySelectorAll(".tl-lane, .lane-label").forEach(l =>
        l.classList.toggle("dim", selRegion && l.dataset.region !== selRegion));
      timelineEl.querySelectorAll("#tlChips button").forEach(x =>
        x.classList.toggle("active", x.dataset.region === selRegion));
    });
  }

  // The timeline is always on for event fields — the map of time above,
  // the entries below (same pattern as the atlas: map above, countries below).
  // The People layer defaults ON (it's the point of the view); the toggle
  // remembers the last choice.
  if (!timelineBuilt && field.cards.some(c => c.time)) {
    buildTimeline(localStorage.getItem("wl-tl-people") !== "off");
    timelineBuilt = true;
    timelineEl.hidden = false;
  }
}

/* ---------- link layer (all pages) ----------
   Build-time entity graph (data/links.json): country mentions found in every
   card, people placed by region. The client uses it to cross-link the fields —
   clickable card text, country dossiers — and to power the omnisearch. */
let LINKS = null, CARDSDATA = null, NAME_RE = null;
async function getLinks() {
  if (!LINKS) {
    try { LINKS = await (await fetch("data/links.json")).json(); }
    catch { LINKS = { names: {}, countries: {} }; }
    const names = Object.keys(LINKS.names).sort((a, b) => b.length - a.length)
      .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (names.length) NAME_RE = new RegExp("\\b(" + names.join("|") + ")\\b", "g");
  }
  return LINKS;
}
async function getCards() {
  if (!CARDSDATA) {
    try { CARDSDATA = await (await fetch("data/cards.json")).json(); }
    catch { CARDSDATA = { fields: [] }; }
  }
  return CARDSDATA;
}
let PORTRAITS = null;  // name -> {img, url} from Wikipedia (enrich_portraits.py)
async function getPortraits() {
  if (!PORTRAITS) {
    try {
      PORTRAITS = await (await fetch("data/portraits.json")).json();
      for (const k in PORTRAITS)  // tolerate v1 entries (bare image-URL strings)
        if (typeof PORTRAITS[k] === "string") PORTRAITS[k] = { img: PORTRAITS[k], url: "" };
    } catch { PORTRAITS = {}; }
  }
  return PORTRAITS;
}
// Wrap country mentions in (already-escaped) text with links to their pages.
function linkify(escaped) {
  if (!NAME_RE) return escaped;
  return escaped.replace(NAME_RE, m => `<a class="cl" href="country.html?iso=${LINKS.names[m]}">${m}</a>`);
}

/* ---------- omnisearch (Ctrl+K, all pages) ---------- */
function initSearch() {
  const nav = document.querySelector("nav.fields");
  if (!nav) return;
  const btn = document.createElement("a");
  btn.href = "#"; btn.id = "osbtn";
  btn.innerHTML = `Search <kbd>Ctrl K</kbd>`;
  nav.appendChild(btn);

  const ov = document.createElement("div");
  ov.id = "osov"; ov.hidden = true;
  ov.innerHTML = `<div class="os-box">
    <input id="osq" placeholder="Search countries, people, events, cards…" autocomplete="off" spellcheck="false">
    <div class="os-list" id="oslist"><div class="os-hint">One search over the whole system — 196 countries, 174 people, 62 events, every card.</div></div>
  </div>`;
  document.body.appendChild(ov);
  const input = ov.querySelector("#osq"), list = ov.querySelector("#oslist");
  let entries = null, shown = [], sel = 0;

  async function ensureIndex() {
    if (entries) return;
    let countries = [];
    try { countries = await (await fetch("data/search.json")).json(); } catch {}
    entries = countries.map(c => ({ t: "Country", n: c.n, s: c.s, h: c.h,
                                    x: (c.n + " " + c.s).toLowerCase() }));
    const cd = await getCards();
    for (const f of cd.fields) f.cards.forEach(c => {
      const t = f.name === "People" ? "Person" : c.kind === "event" ? "Event" : "Card";
      const n = t === "Person" ? c.front.split(" — ")[0] : c.front;
      entries.push({ t, n,
        s: t === "Person" ? (c.front.split(" — ")[1] || f.name) : `${f.name} · ${c.section}`,
        h: t === "Person" ? `person.html?n=${encodeURIComponent(n)}`
          : `fields.html?f=${encodeURIComponent(f.name)}&q=${encodeURIComponent(c.front.slice(0, 40))}`,
        x: (c.front + " " + c.back + " " + (c.extra || "")).toLowerCase() });
    });
  }

  const ORDER = { Country: 0, Person: 1, Event: 2, Card: 3 };
  function run() {
    const qv = input.value.trim().toLowerCase();
    sel = 0;
    if (!qv) { shown = []; list.innerHTML = `<div class="os-hint">One search over the whole system.</div>`; return; }
    const toks = qv.split(/\s+/);
    shown = entries.filter(e => toks.every(t => e.x.includes(t)))
      .map(e => ({ ...e, score: (e.n.toLowerCase().startsWith(qv) ? 0 : e.n.toLowerCase().includes(qv) ? 1 : 2) * 10 + ORDER[e.t] }))
      .sort((a, b) => a.score - b.score).slice(0, 30);
    list.innerHTML = shown.length ? shown.map((e, i) => `
      <a class="os-item${i === sel ? " sel" : ""}" data-i="${i}" href="${e.h}">
        <span class="os-t">${e.t}</span><span class="os-n">${esc(e.n)}</span><span class="os-s">${esc(e.s)}</span>
      </a>`).join("") : `<div class="os-hint">No matches.</div>`;
  }

  const open = () => { ov.hidden = false; input.value = ""; input.focus(); ensureIndex().then(run); };
  const close = () => { ov.hidden = true; };
  btn.addEventListener("click", (e) => { e.preventDefault(); open(); });
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  input.addEventListener("input", run);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ov.hidden ? open() : close(); return; }
    if (e.key === "/" && ov.hidden && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); open(); return; }
    if (ov.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      sel = Math.max(0, Math.min(shown.length - 1, sel + (e.key === "ArrowDown" ? 1 : -1)));
      list.querySelectorAll(".os-item").forEach((n, i) => n.classList.toggle("sel", i === sel));
      const s = list.querySelector(".os-item.sel"); if (s) s.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && shown[sel]) location.href = shown[sel].h;
  });
}

/* ---------- app feel: mobile tab bar, prefetch, theme toggle ---------- */
function initMobileNav() {
  const bar = document.createElement("nav");
  bar.id = "tabbar";
  const items = [
    ["index.html", "◍", "Atlas"], ["fields.html?f=History", "⌛", "History"],
    ["fields.html?f=People", "☺", "People"], ["fields.html?f=Threads", "☰", "Threads"],
    ["explore.html", "◫", "Explore"],
  ];
  const here = location.pathname.split("/").pop() + location.search;
  bar.innerHTML = items.map(([h, ic, l]) =>
    `<a href="${h}"${here.startsWith(h.split("?")[0]) && (h.indexOf("?") < 0 || here.includes(h.split("?")[1])) ? ' class="active"' : ""}><span class="ti">${ic}</span><span>${l}</span></a>`).join("")
    + `<a href="#" id="tabsearch"><span class="ti">⌕</span><span>Search</span></a>`;
  document.body.append(bar);
  bar.querySelector("#tabsearch").addEventListener("click", (e) => {
    e.preventDefault();
    const b = document.getElementById("osbtn"); if (b) b.click();
  });
}

function initPrefetch() {
  // Speculation Rules where supported (Chrome), hover <link rel=prefetch> elsewhere
  try {
    const s = document.createElement("script");
    s.type = "speculationrules";
    s.textContent = JSON.stringify({ prefetch: [{ where: { href_matches: "/*" }, eagerness: "moderate" }] });
    document.head.append(s);
  } catch {}
  const seen = new Set();
  document.addEventListener("mouseover", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || a.origin !== location.origin || a.href === location.href || seen.has(a.href)) return;
    seen.add(a.href);
    const l = document.createElement("link");
    l.rel = "prefetch"; l.href = a.href;
    document.head.append(l);
  });
}

function initThemeToggle() {
  const nav = document.querySelector("nav.fields");
  if (!nav) return;
  const btn = document.createElement("a");
  btn.href = "#"; btn.id = "themeBtn";
  const icons = { auto: "◐", light: "☀", dark: "☾" };
  let mode = localStorage.getItem(THEME_KEY) || "auto";
  const paint = () => { btn.textContent = icons[mode]; btn.title = `Theme: ${mode}`; };
  paint();
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    mode = mode === "auto" ? "dark" : mode === "dark" ? "light" : "auto";
    localStorage.setItem(THEME_KEY, mode);
    applyTheme(mode); paint();
  });
  nav.appendChild(btn);
}

if (document.getElementById("grid")) initIndex();
else if (document.getElementById("detail")) initCountry();
else if (document.getElementById("person")) initPerson();
else if (document.getElementById("dtable")) initExplore();
else if (document.getElementById("cards")) initFields();
initSearch();
initThemeToggle();
initMobileNav();
initPrefetch();
