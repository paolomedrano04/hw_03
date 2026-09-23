// Star Coordinates (Kandogan). Posición = Σ v_j · a_j, con a_j vector 2D arrastrable.
// La dirección del eje orienta el atributo; su longitud es el peso (0 = atributo ignorado).
import { S, bus, colorOf, bindPointEvents, dur, showTip, hideTip } from "../state.js";
const d3 = window.d3;

let axes = null;   // [{key,label,idx,vx,vy}] en unidades de datos (y hacia arriba)
let k = 1;         // escala datos → píxeles para los puntos (se fija al reencuadrar)
let ka = 1;        // escala de dibujo de los ejes (los ejes llegan al borde del marco)

function uniformAxes() {
  return S.feats.map((f, i) => {
    const t = Math.PI / 2 - (2 * Math.PI * i) / S.feats.length;
    return { key: f.key, label: f.label, idx: i, vx: Math.cos(t), vy: Math.sin(t) };
  });
}
function pcaAxes() {
  return S.feats.map((f, i) => ({ key: f.key, label: f.label, idx: i, vx: S.meta.pca.star_axes[i][0], vy: S.meta.pca.star_axes[i][1] }));
}
function raw(d) {
  let x = 0, y = 0;
  for (const a of axes) { const v = d.n[a.idx]; x += v * a.vx; y += v * a.vy; }
  return [x, y];
}

export function renderStar() {
  if (!axes) axes = uniformAxes();
  const root = d3.select("#star");
  root.selectAll("*").remove();
  const W = root.node().clientWidth, H = Math.round(Math.min(W * 0.95, 560));
  const svg = root.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
  svg.append("defs").append("clipPath").attr("id", "star-clip")
    .append("rect").attr("width", W).attr("height", H);
  const g = svg.append("g").attr("clip-path", "url(#star-clip)");

  // centro = media de las posiciones (se recalcula al reencuadrar)
  let c0 = [0, 0];
  const half = Math.min(W, H) / 2 - 40;
  function fit() {
    const pts = S.tracks.map(raw);
    c0 = [d3.mean(pts, p => p[0]), d3.mean(pts, p => p[1])];
    // radio al percentil 99: unos pocos extremos no deben comprimir toda la nube
    const r = d3.quantile(pts.map(p => Math.hypot(p[0] - c0[0], p[1] - c0[1])).sort(d3.ascending), 0.99);
    const al = d3.max(axes, a => Math.hypot(a.vx, a.vy));
    k = half / Math.max(r, 1e-6);
    ka = half / Math.max(al, 1e-6);
  }
  fit();
  const OX = W / 2, OY = H / 2;
  const P = d => { const [x, y] = raw(d); return [OX + (x - c0[0]) * k, OY - (y - c0[1]) * k]; };
  // Los ejes nacen en el centro del marco; su escala (ka) solo difiere de la de los
  // puntos (k) por un factor uniforme, así que las direcciones y pesos relativos se conservan.
  const origin = () => [OX, OY];

  const dots = g.append("g").selectAll("circle").data(S.tracks, d => d.id).join("circle")
    .attr("class", "dot").attr("r", 2.8).attr("fill", colorOf)
    .each(function (d) { const [x, y] = P(d); this.setAttribute("cx", x); this.setAttribute("cy", y); })
    .call(bindPointEvents);

  const overlay = g.append("g");
  const ring = (cls, d) => {
    overlay.selectAll(`.${cls}`).remove();
    if (!d) return;
    const [x, y] = P(d);
    overlay.append("circle").attr("class", `ring ${cls}`).attr("r", 7).attr("cx", x).attr("cy", y);
  };

  const axG = svg.append("g");
  function drawAxes(t) {
    const [ox, oy] = origin();
    const sel = axG.selectAll("g.ax").data(axes, a => a.key).join(enter => {
      const e = enter.append("g").attr("class", "ax");
      e.append("line").attr("stroke", "var(--ink)").attr("stroke-width", 1.2);
      e.append("text").attr("class", "anchor-label").attr("dy", "0.35em");
      e.append("circle").attr("class", "anchor").attr("r", 6.5).attr("tabindex", 0).attr("aria-label", a => `Eje ${a.label}`);
      return e;
    });
    const tr = t ? sel.transition(t) : sel;
    tr.select("line").attr("x1", ox).attr("y1", oy)
      .attr("x2", a => ox + a.vx * ka).attr("y2", a => oy - a.vy * ka);
    tr.select("circle.anchor").attr("cx", a => ox + a.vx * ka).attr("cy", a => oy - a.vy * ka);
    tr.select("text")
      .attr("x", a => ox + a.vx * ka + (a.vx >= 0 ? 10 : -10))
      .attr("y", a => oy - a.vy * ka)
      .attr("text-anchor", a => (a.vx >= 0 ? "start" : "end"))
      .text(a => a.label);
    sel.select("line").attr("opacity", a => (Math.hypot(a.vx, a.vy) < 0.05 ? 0.25 : 0.8));
    return sel;
  }
  const sel = drawAxes();

  let raf = null;
  const redraw = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      dots.each(function (d) { const [x, y] = P(d); this.setAttribute("cx", x); this.setAttribute("cy", y); });
      ring("hov", null); if (S.pinned) ring("pinned", S.pinned);
    });
  };

  sel.select("circle.anchor").call(d3.drag()
    .on("drag", (e, a) => {
      const [ox, oy] = origin();
      a.vx = (e.x - ox) / ka; a.vy = -(e.y - oy) / ka;
      if (Math.hypot(a.vx, a.vy) < 0.04) { a.vx = 0; a.vy = 0; }
      drawAxes(); redraw();
      showTip(e.sourceEvent, `<b>${a.label}</b><br>peso ${d3.format(".2f")(Math.hypot(a.vx, a.vy))} · ángulo ${d3.format(".0f")((Math.atan2(a.vy, a.vx) * 180) / Math.PI)}°`);
    })
    .on("end", hideTip));

  function animateTo(newAxes, refit = true) {
    axes.forEach((a, i) => { a.vx = newAxes[i].vx; a.vy = newAxes[i].vy; });
    if (refit) fit();
    const t = svg.transition().duration(dur(900)).ease(d3.easeCubicInOut);
    drawAxes(t);
    dots.transition(t).attr("cx", d => P(d)[0]).attr("cy", d => P(d)[1]);
    overlay.selectAll("*").remove();
    t.on("end", () => { if (S.pinned) ring("pinned", S.pinned); });
  }

  d3.select("#sc-pca").on("click", () => animateTo(pcaAxes()));
  d3.select("#sc-reset").on("click", () => animateTo(uniformAxes()));
  d3.select("#sc-fit").on("click", () => animateTo(axes.map(a => ({ ...a }))));

  const filter = () => { dots.classed("off", d => !d._a); };
  filter();
  bus.on("filter.star", filter);
  bus.on("color.star", () => dots.attr("fill", colorOf));
  bus.on("hover.star", d => ring("hov", d));
  bus.on("pin.star", d => ring("pinned", d));
  if (S.pinned) ring("pinned", S.pinned);
}
