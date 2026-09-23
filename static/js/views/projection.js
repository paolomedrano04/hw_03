// Proyección 2D precalculada (PCA / t-SNE / UMAP) con transición animada y brush rectangular.
import { dur, mineLabels } from "../store.js";
const d3 = window.d3;
const NAMES = { pca: "PCA", tsne: "t-SNE", umap: "UMAP" };

export function projection(el, store, { methods, buttons, caption, labels, height = 460 }) {
  let method = methods.includes("umap") ? "umap" : methods[0];

  function render() {
    const root = d3.select(el);
    root.selectAll("*").remove();
    const W = el.clientWidth, H = height, pad = 16;
    const x = d3.scaleLinear().domain([-1.05, 1.05]).range([pad, W - pad]);
    const y = d3.scaleLinear().domain([-1.05, 1.05]).range([H - pad, pad]);
    const svg = root.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const X = d => x(d.p[method][0]), Y = d => y(d.p[method][1]);

    const brush = d3.brush().extent([[0, 0], [W, H]]).on("end", ({ selection }) => {
      if (!selection) { store.setFilter("proj", null); return; }
      const [[x0, y0], [x1, y1]] = selection;
      const ids = new Set(store.items.filter(d => { const a = X(d), b = Y(d); return a >= x0 && a <= x1 && b >= y0 && b <= y1; }).map(d => d.id));
      store.setFilter("proj", d => ids.has(d.id));
    });
    const brushG = svg.append("g").attr("class", "brush").call(brush);

    const dots = svg.append("g").selectAll("circle").data(store.items).join("circle")
      .attr("class", "dot").attr("r", 3).attr("cx", X).attr("cy", Y).call(s => store.bind(s));

    const lab = svg.append("g");
    const drawLabels = t => {
      if (!labels) return;
      const cent = labels.map(c => {
        const pts = store.items.filter(d => d.cl === c.id);
        return { ...c, x: d3.median(pts, d => d.p[method][0]), y: d3.median(pts, d => d.p[method][1]) };
      });
      const s = lab.selectAll("text").data(cent, d => d.id).join("text").attr("class", "cl-label").attr("text-anchor", "middle").text(d => d.name);
      (t ? s.transition(t) : s).attr("x", d => Math.max(70, Math.min(W - 70, x(d.x)))).attr("y", d => y(d.y) - 12);
    };
    drawLabels();

    const labG = svg.append("g");
    const mineLab = () => mineLabels(labG, store.items, d => [X(d), Y(d)]);
    mineLab();
    const overlay = svg.append("g");
    const ring = (cls, d) => {
      overlay.selectAll(`.${cls}`).remove();
      if (d) overlay.append("circle").attr("class", `ring ${cls}`).attr("r", 7).attr("cx", X(d)).attr("cy", Y(d));
    };

    const seg = d3.select(buttons);
    seg.selectAll("button").data(methods).join("button").attr("type", "button").text(k => NAMES[k])
      .attr("aria-pressed", k => String(k === method))
      .on("click", (e, k) => {
        if (k === method) return;
        method = k;
        seg.selectAll("button").attr("aria-pressed", b => String(b === method));
        brushG.call(brush.move, null);
        const t = svg.transition().duration(dur(1100)).ease(d3.easeCubicInOut);
        dots.transition(t).delay((d, i) => dur(i % 40) * 4).attr("cx", X).attr("cy", Y);
        drawLabels(t);
        labG.attr("opacity", 0);
        t.on("end.mine", () => { mineLab(); labG.attr("opacity", 1); });
        overlay.selectAll("*").remove();
        if (store.pinned) t.on("end", () => ring("pinned", store.pinned));
        caption?.(method);
      });
    caption?.(method);

    const paint = () => dots.classed("off", d => !d._a).classed("mine", d => d.mine).attr("fill", d => store.color(d));
    paint();
    const ns = `.proj${el.id}`;
    store.bus.on(`filter${ns}`, paint).on(`color${ns}`, paint)
      .on(`hover${ns}`, d => ring("hov", d)).on(`pin${ns}`, d => ring("pinned", d))
      .on(`clear${ns}`, () => brushG.call(brush.move, null));
    if (store.pinned) ring("pinned", store.pinned);
  }
  return { render };
}
