// Star Coordinates (Kandogan): posición = suma de v_j * a_j con v_j ∈ [0,1].
// Cada eje se arrastra: dirección = orientación del atributo, longitud = peso (0 = ignorado).
import { dur, LABEL, showTip, hideTip, mineLabels } from "../store.js";
const d3 = window.d3;

export function star(el, store, { keys, height = 480 }) {
  const uniform = () => keys.map((k, i) => {
    const t = Math.PI / 2 - (2 * Math.PI * i) / keys.length;
    return { key: k, vx: Math.cos(t), vy: Math.sin(t) };
  });
  let axes = uniform();

  function render() {
    const root = d3.select(el);
    root.selectAll("*").remove();
    const W = el.clientWidth, H = height;
    const svg = root.append("svg").attr("viewBox", `0 0 ${W} ${H}`).style("overflow", "hidden");
    const OX = W / 2, OY = H / 2, half = Math.min(W, H) / 2 - 46;
    let k = 1, ka = 1, c0 = [0, 0];
    const raw = d => { let x = 0, y = 0; for (const a of axes) { const v = store.norm(d, a.key); x += v * a.vx; y += v * a.vy; } return [x, y]; };
    function fit() {
      const pts = store.items.map(raw);
      c0 = [d3.mean(pts, p => p[0]), d3.mean(pts, p => p[1])];
      const r = d3.quantile(pts.map(p => Math.hypot(p[0] - c0[0], p[1] - c0[1])).sort(d3.ascending), 0.99);
      k = half / Math.max(r, 1e-6);
      ka = half / Math.max(d3.max(axes, a => Math.hypot(a.vx, a.vy)), 1e-6);
    }
    fit();
    const P = d => { const [x, y] = raw(d); return [OX + (x - c0[0]) * k, OY - (y - c0[1]) * k]; };

    const dots = svg.append("g").selectAll("circle").data(store.items).join("circle")
      .attr("class", "dot").attr("r", 2.7)
      .each(function (d) { const [x, y] = P(d); this.setAttribute("cx", x); this.setAttribute("cy", y); })
      .call(s => store.bind(s));
    const labG = svg.append("g");
    const labels = () => mineLabels(labG, store.items, P);
    labels();
    const overlay = svg.append("g");
    const ring = (cls, d) => {
      overlay.selectAll(`.${cls}`).remove();
      if (!d) return;
      const [x, y] = P(d);
      overlay.append("circle").attr("class", `ring ${cls}`).attr("r", 7).attr("cx", x).attr("cy", y);
    };

    const axG = svg.append("g");
    function drawAxes(t) {
      const sel = axG.selectAll("g.ax").data(axes, a => a.key).join(e => {
        const g = e.append("g").attr("class", "ax");
        g.append("line").attr("stroke", "var(--ink)").attr("stroke-width", 1.3);
        g.append("text").attr("class", "anchor-label").attr("dy", "0.35em");
        g.append("circle").attr("class", "anchor").attr("r", 7);
        return g;
      });
      const tr = t ? sel.transition(t) : sel;
      tr.select("line").attr("x1", OX).attr("y1", OY).attr("x2", a => OX + a.vx * ka).attr("y2", a => OY - a.vy * ka);
      tr.select("circle").attr("cx", a => OX + a.vx * ka).attr("cy", a => OY - a.vy * ka);
      tr.select("text").attr("x", a => OX + a.vx * ka + (a.vx >= 0 ? 11 : -11)).attr("y", a => OY - a.vy * ka)
        .attr("text-anchor", a => (a.vx >= 0 ? "start" : "end")).text(a => LABEL[a.key]);
      sel.select("line").attr("opacity", a => (Math.hypot(a.vx, a.vy) < 0.05 ? 0.2 : 0.85));
      return sel;
    }
    const sel = drawAxes();

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
    sel.select("circle").call(d3.drag()
      .on("drag", (e, a) => {
        a.vx = (e.x - OX) / ka; a.vy = -(e.y - OY) / ka;
        if (Math.hypot(a.vx, a.vy) < 0.05) { a.vx = 0; a.vy = 0; }
        drawAxes(); redraw();
        showTip(e.sourceEvent, `<b>${LABEL[a.key]}</b><br>peso ${d3.format(".2f")(Math.hypot(a.vx, a.vy))}, ángulo ${d3.format(".0f")((Math.atan2(a.vy, a.vx) * 180) / Math.PI)}°`);
      })
      .on("end", hideTip));

    function animateTo(next) {
      axes.forEach((a, i) => { a.vx = next[i].vx; a.vy = next[i].vy; });
      fit();
      const t = svg.transition().duration(dur(900)).ease(d3.easeCubicInOut);
      drawAxes(t);
      dots.transition(t).attr("cx", d => P(d)[0]).attr("cy", d => P(d)[1]);
      overlay.selectAll("*").remove();
      labG.attr("opacity", 0);
      t.on("end", () => { labels(); labG.attr("opacity", 1); if (store.pinned) ring("pinned", store.pinned); });
    }

    const paint = () => dots.classed("off", d => !d._a).classed("mine", d => d.mine).attr("fill", d => store.color(d));
    paint();
    const ns = `.star${el.id}`;
    store.bus.on(`filter${ns}`, paint).on(`color${ns}`, paint)
      .on(`hover${ns}`, d => ring("hov", d)).on(`pin${ns}`, d => ring("pinned", d));
    if (store.pinned) ring("pinned", store.pinned);

    api.reset = () => animateTo(uniform());
    api.fit = () => animateTo(axes.map(a => ({ ...a })));
    // Preset «aislar»: un eje horizontal y el resto verticales (vx = 0), así la posición
    // horizontal depende solo del atributo aislado y el color muestra cómo varía la danceability con él.
    api.isolate = key => {
      const others = axes.filter(b => b.key !== key);
      animateTo(axes.map(a => {
        if (a.key === key) return { vx: 1, vy: 0 };
        const j = others.findIndex(b => b.key === a.key);
        return { vx: 0, vy: (j % 2 ? -1 : 1) * (0.45 + 0.25 * Math.floor(j / 2)) };
      }));
    };
  }
  const api = { render };
  return api;
}
