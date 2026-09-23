// Estado compartido entre todas las vistas (vistas coordinadas / linked views).
// Cada vista escucha el bus y se actualiza; ninguna vista habla directamente con otra.
const d3 = window.d3;

export const bus = d3.dispatch("filter", "hover", "pin", "color", "clear", "pair");

export const S = {
  tracks: [],
  meta: null,
  years: [],
  feats: [],            // [{key,label,unit,domain}]
  colorBy: "cluster",   // cluster | year | genre | pop
  filters: {
    years: null,        // [y0, y1]
    proj: null,         // Set de ids seleccionados en la proyección
    pc: new Map(),      // clave → [lo, hi] en unidades originales
    cats: null,         // Set de categorías visibles (desde la leyenda)
  },
  hovered: null,
  pinned: null,
  nActive: 0,
};

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const dur = ms => (reduce ? 0 : ms);

// ---------- Acceso a valores -------------------------------------------------
export function value(d, key) {
  if (key === "year") return d.year;
  if (key === "pop") return d.pop;
  if (key === "dur") return d.dur;
  const i = S.featIndex[key];
  return d.raw[i];
}

export const EXTRA = {
  year: { key: "year", label: "Año", unit: "" },
  pop: { key: "pop", label: "Popularidad", unit: "0–100" },
  dur: { key: "dur", label: "Duración", unit: "min" },
};
export function labelOf(key) {
  if (EXTRA[key]) return EXTRA[key].label;
  const f = S.feats.find(f => f.key === key);
  return f ? f.label : key;
}

// ---------- Color --------------------------------------------------------------
const CLUSTER_COLORS = ["#E0662B", "#3F76B4", "#2F9E6B", "#8E5BB0", "#C9A227", "#5AA8B0", "#B5485D"];
const GENRE_COLORS = {
  "Rock/Metal": "#B5485D", "Pop/Vocal": "#E08AB0", "Hip hop": "#E0662B", "Latina": "#C9A227",
  "Electrónica": "#5AA8B0", "R&B/Soul": "#8E5BB0", "Country/Folk": "#8B6A3E", "Jazz": "#2F9E6B",
  "Clásica": "#3F76B4", "Hablado": "#17202E", "Otros": "#9AA3AD", "Sin género": "#CBD1D8",
};
export const yearScale = d3.scaleSequential(t => d3.interpolateViridis(0.08 + 0.84 * t)).domain([1921, 2020]);
export const popScale = d3.scaleSequential(t => d3.interpolateMagma(0.15 + 0.72 * t)).domain([0, 90]);

export const COLOR_MODES = [
  { key: "cluster", label: "Cluster" },
  { key: "year", label: "Año" },
  { key: "genre", label: "Género" },
  { key: "pop", label: "Popularidad" },
];

export function colorOf(d) {
  switch (S.colorBy) {
    case "cluster": return CLUSTER_COLORS[d.cl % CLUSTER_COLORS.length];
    case "year": return yearScale(d.year);
    case "genre": return GENRE_COLORS[d.genre] || "#9AA3AD";
    default: return popScale(d.pop);
  }
}

// Categoría discreta usada por la leyenda para filtrar
export function catOf(d) {
  switch (S.colorBy) {
    case "cluster": return d.cl;
    case "year": return Math.floor(d.year / 10) * 10;
    case "genre": return d.genre;
    default: return Math.min(4, Math.floor(d.pop / 20));
  }
}

export function legendItems() {
  const count = d3.rollup(S.tracks, v => v.length, catOf);
  switch (S.colorBy) {
    case "cluster":
      return S.meta.clusters.map(c => ({ cat: c.id, label: c.name, color: CLUSTER_COLORS[c.id], n: count.get(c.id) || 0 }));
    case "year":
      return d3.range(1920, 2030, 10).map(y => ({ cat: y, label: y === 2020 ? "2020" : `${y}s`, color: yearScale(Math.max(1921, y + 5)), n: count.get(y) || 0 }));
    case "genre":
      return Object.keys(GENRE_COLORS).filter(g => count.get(g)).map(g => ({ cat: g, label: g, color: GENRE_COLORS[g], n: count.get(g) }));
    default:
      return d3.range(5).map(b => ({ cat: b, label: b === 4 ? "80–100" : `${b * 20}–${b * 20 + 19}`, color: popScale(b * 20 + 10), n: count.get(b) || 0 }));
  }
}

// ---------- Filtros ---------------------------------------------------------------
export function setFilter(key, val) {
  S.filters[key] = val;
  recompute();
  bus.call("filter");
}

export function recompute() {
  const f = S.filters;
  let n = 0;
  for (const d of S.tracks) {
    let a = true;
    if (f.years && (d.year < f.years[0] || d.year > f.years[1])) a = false;
    if (a && f.proj && !f.proj.has(d.id)) a = false;
    if (a && f.cats && !f.cats.has(catOf(d))) a = false;
    if (a) for (const [k, [lo, hi]] of f.pc) {
      const v = value(d, k);
      if (v < lo || v > hi) { a = false; break; }
    }
    d._a = a;
    if (a) n++;
  }
  S.nActive = n;
}

export function clearAll() {
  S.filters.years = null;
  S.filters.proj = null;
  S.filters.pc = new Map();
  S.filters.cats = null;
  recompute();
  bus.call("clear");
  bus.call("filter");
}

export function setColor(mode) {
  S.colorBy = mode;
  S.filters.cats = null;
  recompute();
  bus.call("color");
  bus.call("filter");
}

// ---------- Hover / fijar -------------------------------------------------------------
export function hover(d) { S.hovered = d; bus.call("hover", null, d); }
export function pin(d) { S.pinned = S.pinned === d ? null : d; bus.call("pin", null, S.pinned); }

// ---------- Tooltip compartido ------------------------------------------------------------
const tip = d3.select("#tooltip");
const fmt = d3.format(".2f");
export function showTip(event, html) {
  tip.html(html).style("opacity", 1);
  const pad = 14, w = tip.node().offsetWidth, h = tip.node().offsetHeight;
  let x = event.clientX + pad, y = event.clientY + pad;
  if (x + w > window.innerWidth - 8) x = event.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = event.clientY - h - pad;
  tip.style("left", `${x}px`).style("top", `${y}px`);
}
export function hideTip() { tip.style("opacity", 0); }
export function trackTip(d) {
  const cl = S.meta.clusters[d.cl];
  return `<b>${esc(d.name)}</b><br>${esc(d.artist)} <span class="m">· ${d.year}</span><br>
    <span class="m">Género:</span> ${d.genre} &nbsp;<span class="m">Pop.:</span> ${d.pop}<br>
    <span class="m">Cluster:</span> ${cl.name}<br>
    <span class="m">Energía ${fmt(d.raw[S.featIndex.energy])} · Acústica ${fmt(d.raw[S.featIndex.acousticness])} · Valencia ${fmt(d.raw[S.featIndex.valence])}</span>`;
}
export function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Interacción estándar de un punto: hover → tooltip + resaltado enlazado; clic → fijar
export function bindPointEvents(sel) {
  sel.on("mouseenter", (e, d) => { hover(d); showTip(e, trackTip(d)); })
    .on("mousemove", (e, d) => showTip(e, trackTip(d)))
    .on("mouseleave", () => { hover(null); hideTip(); })
    .on("click", (e, d) => { e.stopPropagation(); pin(d); });
}
