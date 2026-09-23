// Coordenadas paralelas: brushing por eje (se combinan con AND), reordenar arrastrando
// el título, doble clic invierte el eje, y tres modos de escalado animados.
import { dur, LABEL, UNIT, showTip, hideTip } from "../store.js";
const d3 = window.d3;

export function parallel(el, store, { dims, height = 380, scaleSelect }) {
  const cfg = { dims: [...dims], inverted: new Set(), mode: "minmax" };
  let cleanup = () => {};

  function render() {
    cleanup();
    const root = d3.select(el);
    root.selectAll("*").remove();
    const W = el.clientWidth;
    const m = { t: 34, r: 40, b: 12, l: 40 }, H = height, h = H - m.t - m.b;
    const svg = root.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    const dimsNow = cfg.dims;
    const x = d3.scalePoint().domain(dimsNow).range([0, W - m.l - m.r]);
    const pos = {};
    const X = k => pos[k] ?? x(k);

    const stats = {};
    for (const k of dimsNow) {
      const v = store.items.map(d => store.get(d, k)).sort(d3.ascending);
      stats[k] = { ext: d3.extent(v), q: [d3.quantileSorted(v, 0.02), d3.quantileSorted(v, 0.98)], mean: d3.mean(v), sd: d3.deviation(v) };
    }
    const axis = {};
    function build() {
      for (const k of dimsNow) {
        const st = stats[k], range = cfg.inverted.has(k) ? [0, h] : [h, 0];
        if (cfg.mode === "z") {
          const sc = d3.scaleLinear().domain([-3, 3]).range(range).clamp(true);
          axis[k] = { sc, to: v => sc((v - st.mean) / st.sd),
            from: px => { const z = sc.invert(px); return Math.abs(z) >= 2.99 ? Math.sign(z) * Infinity : z * st.sd + st.mean; },
            fmt: v => (v === 0 ? "0" : d3.format("+.0f")(v)) };
        } else {
          const dom = cfg.mode === "robust" ? st.q : st.ext;
          const sc = d3.scaleLinear().domain(dom).range(range).clamp(true);
          axis[k] = { sc, to: v => sc(v),
            from: px => { const v = sc.invert(px);
              if (cfg.mode === "robust" && v <= dom[0] + 1e-9) return -Infinity;
              if (cfg.mode === "robust" && v >= dom[1] - 1e-9) return Infinity;
              return v; },
            fmt: d3.format("~g") };
        }
      }
    }
    build();
    const line = d => d3.line()(dimsNow.map(k => [X(k), axis[k].to(store.get(d, k))]));

    const paths = g.append("g").selectAll("path").data(store.items).join("path")
      .attr("class", "line").attr("d", line).call(s => store.bind(s));
    const overlay = g.append("g");
    const drawOver = (cls, d) => {
      overlay.selectAll(`.${cls}`).remove();
      if (d) overlay.append("path").attr("class", cls === "hov" ? "hover-line hov" : "pinned-line pinned").attr("d", line(d));
    };

    const axG = g.selectAll("g.pc-axis").data(dimsNow, k => k).join("g")
      .attr("class", "pc-axis").attr("transform", k => `translate(${X(k)},0)`);
    axG.append("g").attr("class", "axis");
    const drawAxes = t => axG.each(function (k) {
      const a = d3.select(this).select(".axis");
      (t ? a.transition(t) : a).call(d3.axisLeft(axis[k].sc).ticks(5).tickFormat(axis[k].fmt).tickSizeOuter(0));
    });
    drawAxes();

    const titles = axG.append("text").attr("class", "axis-title").attr("y", -14).attr("text-anchor", "middle")
      .text(k => LABEL[k] + (UNIT[k] && k !== "popularity" ? ` (${UNIT[k]})` : ""))
      .classed("inverted", k => cfg.inverted.has(k))
      .on("dblclick", (e, k) => { cfg.inverted.has(k) ? cfg.inverted.delete(k) : cfg.inverted.add(k); rescale(); })
      .on("mousemove", e => showTip(e, "Arrastra para reordenar. Doble clic para invertir."))
      .on("mouseleave", hideTip);

    titles.call(d3.drag()
      .on("start", (e, k) => { pos[k] = x(k); hideTip(); })
      .on("drag", (e, k) => {
        pos[k] = Math.max(0, Math.min(W - m.l - m.r, e.x));
        dimsNow.sort((a, b) => X(a) - X(b));
        x.domain(dimsNow);
        paths.attr("d", line);
        axG.attr("transform", kk => `translate(${X(kk)},0)`);
        overlay.selectAll("*").remove();
      })
      .on("end", (e, k) => {
        delete pos[k];
        const t = svg.transition().duration(dur(450));
        axG.transition(t).attr("transform", kk => `translate(${x(kk)},0)`);
        paths.transition(t).attr("d", line);
        if (store.pinned) t.on("end", () => drawOver("pinned", store.pinned));
      }));

    const brushes = {};
    axG.append("g").attr("class", "brush").each(function (k) {
      brushes[k] = d3.brushY().extent([[-11, 0], [11, h]]).on("brush end", ({ selection }) => {
        if (!selection) { store.setFilter(`pc-${k}`, null); return; }
        const [a, b] = selection.map(px => axis[k].from(px));
        const lo = Math.min(a, b), hi = Math.max(a, b);
        store.setFilter(`pc-${k}`, d => { const v = store.get(d, k); return v >= lo && v <= hi; });
      });
      d3.select(this).call(brushes[k]);
    });
    const clearBrushes = () => axG.select(".brush").each(function (k) { d3.select(this).call(brushes[k].move, null); });

    function rescale() {
      build(); clearBrushes();
      const t = svg.transition().duration(dur(700));
      titles.classed("inverted", k => cfg.inverted.has(k));
      drawAxes(t);
      paths.transition(t).attr("d", line);
      overlay.selectAll("*").remove();
      if (store.pinned) t.on("end", () => drawOver("pinned", store.pinned));
    }
    if (scaleSelect) d3.select(scaleSelect).property("value", cfg.mode).on("change", function () { cfg.mode = this.value; rescale(); });

    const paint = () => paths.classed("off", d => !d._a).classed("mine", d => d.mine).attr("stroke", d => (d._a ? store.color(d) : null));
    paint();
    const ns = `.pc${el.id}`;
    store.bus.on(`filter${ns}`, paint).on(`color${ns}`, paint)
      .on(`hover${ns}`, d => drawOver("hov", d)).on(`pin${ns}`, d => drawOver("pinned", d))
      .on(`clear${ns}`, clearBrushes);
    if (store.pinned) drawOver("pinned", store.pinned);
    cleanup = () => { for (const [k] of store.filters) if (k.startsWith("pc-")) store.filters.delete(k); };
  }
  return { render };
}
