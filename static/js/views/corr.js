// Matriz de correlación (dataset completo) + dispersión del par seleccionado (muestra).
import { S, bus, colorOf, value, labelOf, bindPointEvents, showTip, hideTip, dur } from "../state.js";
const d3 = window.d3;

const KEY = { popularity: "pop", duration_min: "dur" };   // nombres en meta → claves internas
const toKey = v => KEY[v] || v;
let pair = ["acousticness", "energy"];
export function setPair(p) { pair = p; bus.call("pair"); }

export function renderCorr() {
  const root = d3.select("#corr");
  root.selectAll("*").remove();
  const { vars, matrix } = S.meta.corr;
  const n = vars.length;
  const W = root.node().clientWidth;
  const m = { t: 6, l: 104, r: 6, b: 92 };
  const cell = Math.floor(Math.min((W - m.l - m.r) / n, 30));
  const H = m.t + cell * n + m.b;
  const svg = root.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
  const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
  const color = d3.scaleDiverging(t => d3.interpolateRdBu(1 - t)).domain([-1, 0, 1]);
  const lab = v => labelOf(toKey(v));

  const cells = [];
  vars.forEach((a, i) => vars.forEach((b, j) => cells.push({ a, b, i, j, r: matrix[i][j] })));
  g.selectAll("rect").data(cells).join("rect")
    .attr("x", d => d.j * cell).attr("y", d => d.i * cell)
    .attr("width", cell - 1).attr("height", cell - 1).attr("rx", 1.5)
    .attr("fill", d => color(d.r)).style("cursor", d => (d.i === d.j ? "default" : "pointer"))
    .on("mousemove", (e, d) => showTip(e, `<b>${lab(d.a)} × ${lab(d.b)}</b><br>r = ${d3.format("+.2f")(d.r)}`))
    .on("mouseleave", hideTip)
    .on("click", (e, d) => { if (d.i !== d.j) { pair = [toKey(d.b), toKey(d.a)]; bus.call("pair"); } });

  if (cell >= 24) {
    g.selectAll("text.r").data(cells.filter(d => d.i !== d.j)).join("text")
      .attr("class", "r").attr("x", d => d.j * cell + cell / 2).attr("y", d => d.i * cell + cell / 2)
      .attr("dy", "0.35em").attr("text-anchor", "middle").attr("pointer-events", "none")
      .attr("font-size", 9.5).attr("fill", d => (Math.abs(d.r) > 0.55 ? "#fff" : "#17202E"))
      .text(d => d3.format(".1f")(d.r).replace("0.", ".").replace("-.", "−."));
  }
  g.selectAll("text.rl").data(vars).join("text").attr("class", "axis-title").style("cursor", "default")
    .attr("x", -6).attr("y", (v, i) => i * cell + cell / 2).attr("dy", "0.35em").attr("text-anchor", "end").text(lab);
  g.selectAll("text.cl").data(vars).join("text").attr("class", "axis-title").style("cursor", "default")
    .attr("transform", (v, i) => `translate(${i * cell + cell / 2},${n * cell + 6}) rotate(-50)`)
    .attr("text-anchor", "end").attr("dy", "0.35em").text(lab);

  const sel = g.append("rect").attr("class", "cell-sel").attr("width", cell - 1).attr("height", cell - 1);
  const mark = () => {
    const i = vars.findIndex(v => toKey(v) === pair[1]), j = vars.findIndex(v => toKey(v) === pair[0]);
    sel.attr("x", j * cell).attr("y", i * cell);
  };
  mark();
  bus.on("pair.corrmark", mark);
  renderScatter();
}

function renderScatter() {
  const root = d3.select("#scatter");
  root.selectAll("*").remove();
  const W = root.node().clientWidth, H = 250;
  const m = { t: 14, r: 12, b: 36, l: 46 };
  const svg = root.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
  const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
  const w = W - m.l - m.r, h = H - m.t - m.b;
  const x = d3.scaleLinear().range([0, w]), y = d3.scaleLinear().range([h, 0]);
  const gx = g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`);
  const gy = g.append("g").attr("class", "axis");
  const tx = g.append("text").attr("class", "axis-title").attr("x", w).attr("y", h + 30).attr("text-anchor", "end").style("cursor", "default");
  const ty = g.append("text").attr("class", "axis-title").attr("x", 4).attr("y", -2).style("cursor", "default");
  const rtxt = g.append("text").attr("class", "caption").attr("x", w).attr("y", -2).attr("text-anchor", "end");

  const dots = g.append("g").selectAll("circle").data(S.tracks, d => d.id).join("circle")
    .attr("class", "dot").attr("r", 2.4).attr("fill", colorOf).call(bindPointEvents);
  const overlay = g.append("g");
  const ring = (cls, d) => {
    overlay.selectAll(`.${cls}`).remove();
    if (!d) return;
    overlay.append("circle").attr("class", `ring ${cls}`).attr("r", 6)
      .attr("cx", x(value(d, pair[0]))).attr("cy", y(value(d, pair[1])));
  };

  function update(animate) {
    const [a, b] = pair;
    x.domain(d3.extent(S.tracks, d => value(d, a))).nice();
    y.domain(d3.extent(S.tracks, d => value(d, b))).nice();
    const t = svg.transition().duration(dur(animate ? 700 : 0));
    gx.transition(t).call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("~g")));
    gy.transition(t).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("~g")));
    dots.transition(t).attr("cx", d => x(value(d, a))).attr("cy", d => y(value(d, b)));
    tx.text(labelOf(a)); ty.text(labelOf(b));
    updateR();
    overlay.selectAll("*").remove();
    if (S.pinned) t.on("end", () => ring("pinned", S.pinned));
  }
  function updateR() {
    const [a, b] = pair;
    const act = S.tracks.filter(d => d._a);
    const r = act.length > 2 ? pearson(act.map(d => value(d, a)), act.map(d => value(d, b))) : NaN;
    rtxt.text(`r en la selección (${act.length}) = ${isNaN(r) ? "—" : d3.format("+.2f")(r)}`);
  }
  update(false);

  bus.on("pair.scatter", () => update(true));
  bus.on("filter.scatter", () => { dots.classed("off", d => !d._a); updateR(); });
  bus.on("color.scatter", () => dots.attr("fill", colorOf));
  bus.on("hover.scatter", d => ring("hov", d));
  bus.on("pin.scatter", d => ring("pinned", d));
  dots.classed("off", d => !d._a);
}

function pearson(a, b) {
  const ma = d3.mean(a), mb = d3.mean(b);
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) { const da = a[i] - ma, db = b[i] - mb; s += da * db; sa += da * da; sb += db * db; }
  return s / Math.sqrt(sa * sb);
}
