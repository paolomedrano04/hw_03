// RadViz (dimensional anchoring): posición = suma(v_j * A_j) / suma(v_j), v_j ∈ [0,1].
// Anclas arrastrables por el perímetro; doble clic activa o desactiva un ancla.
import { dur, LABEL, mineLabels } from "../store.js";
const d3 = window.d3;

export function radviz(el, store, { keys, off = [], height = 460 }) {
  // Las anclas activas se reparten uniformemente; las apagadas quedan en el punto medio de un hueco
  const initial = () => {
    const on = keys.filter(k => !off.includes(k));
    const step = (2 * Math.PI) / on.length;
    return keys.map(k => {
      const i = on.indexOf(k);
      const angle = i >= 0 ? -Math.PI / 2 + step * i : -Math.PI / 2 + step * (on.length - 1) + step / 2 - off.indexOf(k) * 0.3;
      return { key: k, on: i >= 0, angle };
    });
  };
  let anchors = initial();

  function render() {
    const root = d3.select(el);
    root.selectAll("*").remove();
    const W = el.clientWidth, H = height;
    const R = Math.min(W, H) / 2 - 58;
    const svg = root.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g").attr("transform", `translate(${W / 2},${H / 2})`);
    g.append("circle").attr("r", R).attr("fill", "none").attr("stroke", "var(--rule)");

    const P = d => {
      let sx = 0, sy = 0, s = 0;
      for (const a of anchors) if (a.on) { const v = store.norm(d, a.key); sx += v * Math.cos(a.angle); sy += v * Math.sin(a.angle); s += v; }
      return s > 0 ? [(sx / s) * R, (sy / s) * R] : [0, 0];
    };
    const dots = g.append("g").selectAll("circle").data(store.items).join("circle")
      .attr("class", "dot").attr("r", 2.8)
      .each(function (d) { const [x, y] = P(d); this.setAttribute("cx", x); this.setAttribute("cy", y); })
      .call(s => store.bind(s));
    const labG = g.append("g");
    const labels = () => mineLabels(labG, store.items, P);
    labels();
    const overlay = g.append("g");
    const ring = (cls, d) => {
      overlay.selectAll(`.${cls}`).remove();
      if (!d) return;
      const [x, y] = P(d);
      overlay.append("circle").attr("class", `ring ${cls}`).attr("r", 7).attr("cx", x).attr("cy", y);
    };

    const aG = g.append("g");
    function drawAnchors(t) {
      const sel = aG.selectAll("g.anc").data(anchors, a => a.key).join(e => {
        const x = e.append("g").attr("class", "anc");
        x.append("line").attr("stroke", "var(--rule)").attr("stroke-dasharray", "2 3");
        x.append("text").attr("class", "anchor-label").attr("dy", "0.35em");
        x.append("circle").attr("class", "anchor").attr("r", 8);
        return x;
      });
      const tr = t ? sel.transition(t) : sel;
      tr.select("line").attr("x2", a => R * Math.cos(a.angle)).attr("y2", a => R * Math.sin(a.angle));
      tr.select("circle").attr("cx", a => R * Math.cos(a.angle)).attr("cy", a => R * Math.sin(a.angle));
      tr.select("text").attr("x", a => (R + 15) * Math.cos(a.angle)).attr("y", a => (R + 15) * Math.sin(a.angle))
        .attr("text-anchor", a => (Math.cos(a.angle) > 0.3 ? "start" : Math.cos(a.angle) < -0.3 ? "end" : "middle"))
        .text(a => LABEL[a.key] + (a.on ? "" : " (apagada)"));
      sel.select("circle").classed("off", a => !a.on);
      sel.select("text").classed("off", a => !a.on);
      return sel;
    }
    const sel = drawAnchors();

    let raf = null;
    const redraw = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        dots.each(function (d) { const [x, y] = P(d); this.setAttribute("cx", x); this.setAttribute("cy", y); });
        labels();
        ring("hov", null); if (store.pinned) ring("pinned", store.pinned);
      });
    };
    function animate() {
      const t = svg.transition().duration(dur(800)).ease(d3.easeCubicInOut);
      drawAnchors(t);
      dots.transition(t).attr("cx", d => P(d)[0]).attr("cy", d => P(d)[1]);
      overlay.selectAll("*").remove();
      labG.attr("opacity", 0);
      t.on("end", () => { labels(); labG.attr("opacity", 1); if (store.pinned) ring("pinned", store.pinned); });
    }
    sel.select("circle")
      .call(d3.drag().on("drag", (e, a) => { a.angle = Math.atan2(e.y, e.x); drawAnchors(); redraw(); }))
      .on("dblclick", (e, a) => { a.on = !a.on; animate(); });

    const paint = () => dots.classed("off", d => !d._a).classed("mine", d => d.mine).attr("fill", d => store.color(d));
    paint();
    const ns = `.rv${el.id}`;
    store.bus.on(`filter${ns}`, paint).on(`color${ns}`, paint)
      .on(`hover${ns}`, d => ring("hov", d)).on(`pin${ns}`, d => ring("pinned", d));
    if (store.pinned) ring("pinned", store.pinned);

    api.reset = () => { const d = initial(); anchors.forEach((a, i) => { a.angle = d[i].angle; a.on = d[i].on; }); animate(); };
    api.toggle = key => { const a = anchors.find(a => a.key === key); a.on = !a.on; animate(); return a.on; };
  }
  const api = { render };
  return api;
}
