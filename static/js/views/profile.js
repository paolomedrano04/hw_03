// Small multiples: y (p. ej. danceability) contra cada atributo x.
// Puntos = muestra; línea gruesa = media de y por intervalo de x en el dataset COMPLETO.
// La línea revela relaciones no lineales que el coeficiente de Pearson no ve.
import { dur, LABEL, UNIT, fmtV, showTip, hideTip } from "../store.js";
const d3 = window.d3;

export function profile(el, store, { xs, y, bins, corr, height = 250 }) {
  function render() {
    const root = d3.select(el);
    root.selectAll("*").remove();
    const W = el.clientWidth;
    const cols = W < 700 ? 1 : xs.length;
    const cw = W / cols;
    const m = { t: 24, r: 12, b: 34, l: 40 };
    const w = cw - m.l - m.r, h = height - m.t - m.b;
    const rowsN = Math.ceil(xs.length / cols);
    const svg = root.append("svg").attr("viewBox", `0 0 ${W} ${height * rowsN}`);
    const yS = d3.scaleLinear().domain(store.domains[y]).range([h, 0]).nice();

    const panels = xs.map((xk, i) => {
      const g = svg.append("g").attr("transform", `translate(${(i % cols) * cw + m.l},${Math.floor(i / cols) * height + m.t})`);
      const xS = d3.scaleLinear().domain(store.domains[xk]).range([0, w]).nice();
      g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`).call(d3.axisBottom(xS).ticks(5).tickFormat(d3.format("~g")));
      g.append("g").attr("class", "axis").call(d3.axisLeft(yS).ticks(4).tickFormat(d3.format("~g")));
      g.append("text").attr("class", "axis-title").attr("x", w).attr("y", h + 30).attr("text-anchor", "end").style("cursor", "default")
        .text(LABEL[xk] + (UNIT[xk] && xk !== "popularity" ? ` (${UNIT[xk]})` : ""));
      g.append("text").attr("class", "caption").attr("x", 0).attr("y", -8)
        .text(`${LABEL[y]}, r = ${d3.format("+.2f")(corr[xk])}`);

      const brush = d3.brushX().extent([[0, 0], [w, h]]).on("end", ({ selection }) => {
        if (!selection) { store.setFilter(`pf-${xk}`, null); return; }
        const [a, b] = selection.map(xS.invert);
        store.setFilter(`pf-${xk}`, d => { const v = store.get(d, xk); return v >= a && v <= b; });
      });
      const bg = g.append("g").attr("class", "brush").call(brush);

      const dots = g.append("g").selectAll("circle").data(store.items).join("circle")
        .attr("class", "dot").attr("r", 2)
        .attr("cx", d => xS(Math.max(xS.domain()[0], Math.min(xS.domain()[1], store.get(d, xk)))))
        .attr("cy", d => yS(store.get(d, y))).call(s => store.bind(s));

      const b = bins[xk].filter(d => d.x0 >= xS.domain()[0] - 1e-9 && d.x1 <= xS.domain()[1] + 1e-9);
      const pts = b.map(d => ({ ...d, cx: xS((d.x0 + d.x1) / 2), cy: yS(d.mean) }));
      const path = g.append("path").attr("class", "trend").attr("d", d3.line().curve(d3.curveMonotoneX).x(d => d.cx).y(d => d.cy)(pts));
      const len = path.node().getTotalLength();
      path.attr("stroke-dasharray", `${len} ${len}`).attr("stroke-dashoffset", len)
        .transition().duration(dur(1200)).delay(dur(i * 200)).attr("stroke-dashoffset", 0);
      g.append("g").selectAll("circle").data(pts).join("circle").attr("class", "trend-pt")
        .attr("cx", d => d.cx).attr("cy", d => d.cy).attr("r", 3.5)
        .on("mouseenter", function (e, d) {
          d3.select(this).attr("r", 6);
          showTip(e, `<b>${LABEL[xk]} ${fmtV(xk, d.x0)}–${fmtV(xk, d.x1)}</b><br>${LABEL[y]} media: ${d3.format(".3f")(d.mean)}<br><span class="m">${d3.format(",")(d.n)} en el dataset completo</span>`);
        })
        .on("mouseleave", function () { d3.select(this).attr("r", 3.5); hideTip(); });

      const overlay = g.append("g");
      const ring = (cls, d) => {
        overlay.selectAll(`.${cls}`).remove();
        if (d) overlay.append("circle").attr("class", `ring ${cls}`).attr("r", 6)
          .attr("cx", xS(store.get(d, xk))).attr("cy", yS(store.get(d, y)));
      };
      return { dots, ring, bg, brush };
    });

    const paint = () => panels.forEach(p => p.dots.classed("off", d => !d._a).classed("mine", d => d.mine).attr("fill", d => store.color(d)));
    paint();
    const ns = `.pf${el.id}`;
    store.bus.on(`filter${ns}`, paint).on(`color${ns}`, paint)
      .on(`hover${ns}`, d => panels.forEach(p => p.ring("hov", d)))
      .on(`pin${ns}`, d => panels.forEach(p => p.ring("pinned", d)))
      .on(`clear${ns}`, () => panels.forEach(p => p.bg.call(p.brush.move, null)));
    if (store.pinned) panels.forEach(p => p.ring("pinned", store.pinned));
  }
  return { render };
}
