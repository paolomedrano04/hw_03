// Un Store por dataset (canciones, artistas, años). Las vistas de un mismo Store están
// coordinadas: comparten filtros (AND), color, elemento señalado (hover) y fijado (pin).
const d3 = window.d3;

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const dur = ms => (reduce ? 0 : ms);

export const LABEL = {
  tempo: "Tempo", liveness: "Liveness", energy: "Energy", danceability: "Danceability",
  popularity: "Popularity", loudness: "Loudness", year: "Año",
  recovery: "Recovery", strain: "Strain", pmax: "% FC máx", avg_hr: "FC media", dur: "Duración",
  z1: "Zona 1", z2: "Zona 2", z3: "Zona 3", z4: "Zona 4", z5: "Zona 5",
};
export const UNIT = { tempo: "BPM", loudness: "dB", popularity: "0–100", avg_hr: "lpm", dur: "min" };
export const fmtV = (k, v) => (["tempo", "popularity", "year", "avg_hr", "dur", "recovery"].includes(k) ? d3.format(".0f")(v)
  : k === "pmax" || /^z\d$/.test(k) ? d3.format(".0%")(v)
  : k === "loudness" || k === "strain" ? d3.format(".1f")(v) : d3.format(".2f")(v));

export const SCALES = {
  danceability: d3.scaleSequential(t => d3.interpolateViridis(0.18 + 0.82 * t)).domain([0.15, 0.9]),
  popularity: d3.scaleSequential(t => d3.interpolateMagma(0.3 + 0.68 * t)).domain([0, 80]),
  energy: d3.scaleSequential(t => d3.interpolateYlOrRd(0.15 + 0.85 * t)).domain([0, 1]),
  year: d3.scaleSequential(t => d3.interpolatePlasma(0.15 + 0.8 * t)).domain([1921, 2020]),
  loudness: d3.scaleSequential(t => d3.interpolatePuBuGn(0.2 + 0.8 * t)).domain([-25, -3]),
  recovery: d3.scaleSequential(t => d3.interpolateRdYlGn(0.05 + 0.9 * t)).domain([0, 100]),
  strain: d3.scaleSequential(t => d3.interpolateBlues(0.25 + 0.75 * t)).domain([0, 21]),
  pmax: d3.scaleSequential(t => d3.interpolateYlOrRd(0.2 + 0.8 * t)).domain([0.65, 0.9]),
};
export const ACT_COLORS = {
  HIIT: "#E8115B", CrossFit: "#FF6437", Running: "#FFC864", Swimming: "#509BF5",
  Cycling: "#2EC4B6", "Weight Training": "#B49BC8", Yoga: "#1ED760", Walking: "#8D8D8D",
};
export const LEVEL_COLORS = { Moderada: "#FFC864", Alta: "#FF6437", "Muy alta": "#E8115B" };
export const CLUSTER_COLORS = ["#1ED760", "#509BF5", "#F573A0", "#FFC864", "#B49BC8", "#2EC4B6"];

export class Store {
  constructor({ name, items, keys, domains, colorKey, tip, title }) {
    Object.assign(this, { name, items, keys, domains, colorKey, tipFn: tip, titleFn: title });
    this.bus = d3.dispatch("filter", "hover", "pin", "color", "clear");
    this.filters = new Map();
    this.pinned = null;
    this.nActive = items.length;
    items.forEach(d => (d._a = true));
  }
  get(d, k) { return k === "year" ? d.year : d.v[k]; }
  norm(d, k) {
    const [lo, hi] = this.domains[k];
    return Math.max(0, Math.min(1, (this.get(d, k) - lo) / (hi - lo)));
  }
  color(d) {
    if (this.colorKey === "act") return ACT_COLORS[d.act] || "#9AA3AD";
    if (this.colorKey === "level") return LEVEL_COLORS[d.level] || "#9AA3AD";
    if (this.colorKey === "cluster") return CLUSTER_COLORS[d.cl % CLUSTER_COLORS.length];
    return SCALES[this.colorKey](this.get(d, this.colorKey));
  }
  setColor(k) { this.colorKey = k; this.bus.call("color"); }
  setFilter(source, pred) {
    if (pred) this.filters.set(source, pred); else this.filters.delete(source);
    let n = 0;
    const preds = [...this.filters.values()];
    for (const d of this.items) { d._a = preds.every(p => p(d)); if (d._a) n++; }
    this.nActive = n;
    this.bus.call("filter");
  }
  clear() { this.filters.clear(); this.setFilter("_", null); this.bus.call("clear"); }
  hover(d) { this.bus.call("hover", null, d); }
  pin(d) { this.pinned = this.pinned === d ? null : d; this.bus.call("pin", null, this.pinned); }

  // Hover estándar para puntos o líneas de este Store
  bind(sel) {
    sel.on("mouseenter", (e, d) => { this.hover(d); showTip(e, this.tipFn(d)); })
      .on("mousemove", (e, d) => showTip(e, this.tipFn(d)))
      .on("mouseleave", () => { this.hover(null); hideTip(); })
      .on("click", (e, d) => { e.stopPropagation(); this.pin(d); });
  }
}

const tip = d3.select("#tooltip");
export function showTip(event, html) {
  tip.html(html).style("opacity", 1);
  const pad = 14, w = tip.node().offsetWidth, h = tip.node().offsetHeight;
  let x = event.clientX + pad, y = event.clientY + pad;
  if (x + w > window.innerWidth - 8) x = event.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = event.clientY - h - pad;
  tip.style("left", `${x}px`).style("top", `${y}px`);
}
export function hideTip() { tip.style("opacity", 0); }
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Leyenda continua (rampa) para un Store
export function rampLegend(el, store) {
  const root = d3.select(el);
  root.selectAll("*").remove();
  if (["cluster", "act", "level"].includes(store.colorKey)) return;
  const sc = SCALES[store.colorKey];
  const [a, b] = sc.domain();
  const stops = d3.range(0, 1.01, 0.1).map(t => sc(a + t * (b - a)));
  root.append("div").attr("class", "ramp").style("background", `linear-gradient(90deg, ${stops.join(",")})`);
  root.append("div").attr("class", "ramp-labels").html(`<span>${fmtV(store.colorKey, a)}</span><span>${LABEL[store.colorKey]}</span><span>${fmtV(store.colorKey, b)}</span>`);
}

// Etiquetas para las canciones/artistas de "Mi playlist" en vistas de puntos
export function mineLabels(layer, items, P) {
  const mine = items.filter(d => d.mine);
  layer.selectAll("text").data(mine, d => d.id).join("text").attr("class", "mine-label")
    .attr("x", d => P(d)[0] + 8).attr("y", d => P(d)[1] - 7)
    .text(d => (d.name.length > 26 ? d.name.slice(0, 25) + "…" : d.name));
}
