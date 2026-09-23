// Perfil por banda de popularidad: media de cada atributo en el dataset completo (línea sólida)
// frente a la media de los artistas actualmente seleccionados (línea discontinua).
import { dur, LABEL, UNIT, fmtV, showTip, hideTip } from "../store.js";
const d3 = window.d3;
const BAND = p => (p <= 20 ? 0 : p <= 40 ? 1 : p <= 60 ? 2 : p <= 80 ? 3 : 4);

export function bands(el, store, { keys, bands, height = 220 }) {
  function render() {
    const root = d3.select(el);
    root.selectAll("*").remove();
    const W = el.clientWidth, cols = W < 640 ? 1 : keys.length, cw = W / cols;
    const m = { t: 22, r: 14, b: 40, l: 44 }, w = cw - m.l - m.r, h = height - m.t - m.b;
    const svg = root.append("svg").attr("viewBox", `0 0 ${W} ${height * Math.ceil(keys.length / cols)}`);
    const x = d3.scalePoint().domain(bands.map(b => b.band)).range([0, w]).padding(0.3);

    const panels = keys.map((k, i) => {
      const g = svg.append("g").attr("transform", `translate(${(i % cols) * cw + m.l},${Math.floor(i / cols) * height + m.t})`);
      const ext = d3.extent(bands, b => b[k]);
      const padV = (ext[1] - ext[0]) * 0.6 || 0.05;
      const y = d3.scaleLinear().domain([ext[0] - padV, ext[1] + padV]).range([h, 0]).nice();
      g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).tickSizeOuter(0));
      const gy = g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(4).tickFormat(d3.format("~g")));
      g.append("text").attr("class", "axis-title").style("cursor", "default").attr("x", 0).attr("y", -8)
        .text(LABEL[k] + (UNIT[k] ? ` (${UNIT[k]})` : "") + " media");
      g.append("text").attr("class", "caption").attr("x", w).attr("y", h + 32).attr("text-anchor", "end").text("Banda de popularidad");
      const line = d3.line().x(d => x(d.band)).y(d => y(d.v)).defined(d => d.v != null);
      const full = bands.map(b => ({ band: b.band, v: b[k], n: b.n }));
      const p = g.append("path").attr("class", "trend").attr("d", line(full));
      const len = p.node().getTotalLength();
      p.attr("stroke-dasharray", `${len} ${len}`).attr("stroke-dashoffset", len).transition().duration(dur(1000)).attr("stroke-dashoffset", 0);
      const fullPts = g.selectAll("circle.trend-pt").data(full).join("circle").attr("class", "trend-pt").attr("r", 4.5)
        .attr("cx", d => x(d.band)).attr("cy", d => y(d.v))
        .on("mouseenter", (e, d) => showTip(e, `<b>Popularidad ${d.band}</b><br>${LABEL[k]} media: ${fmtV(k, d.v)}<br><span class="m">${d3.format(",")(d.n)} artistas (dataset completo)</span>`))
        .on("mouseleave", hideTip);
      const sel = g.append("path").attr("class", "sel-line");
      const selPts = g.append("g");
      return { k, y, base: y.domain(), gy, p, fullPts, full, line, sel, selPts };
    });

    function update() {
      const act = store.items.filter(d => d._a);
      const filtered = act.length < store.items.length;
      panels.forEach(({ k, y, base, gy, p, fullPts, full, line, sel, selPts }) => {
        const by = d3.rollup(act, v => ({ v: d3.mean(v, d => store.get(d, k)), n: v.length }), d => BAND(store.get(d, "popularity")));
        const data = bands.map((b, i) => ({ band: b.band, v: by.get(i)?.n >= 3 ? by.get(i).v : null, n: by.get(i)?.n || 0 }));
        // el eje se amplía si la selección cae fuera del rango base
        const vals = filtered ? data.filter(d => d.v != null).map(d => d.v) : [];
        y.domain(d3.extent([...base, ...vals])).nice();
        const t = d3.transition().duration(dur(300));
        gy.transition(t).call(d3.axisLeft(y).ticks(4).tickFormat(d3.format("~g")));
        p.attr("stroke-dasharray", null).transition(t).attr("d", line(full));
        fullPts.transition(t).attr("cy", d => y(d.v));
        sel.attr("opacity", filtered ? 1 : 0).transition(t).attr("d", line(data));
        selPts.selectAll("circle").data(filtered ? data.filter(d => d.v != null) : []).join("circle")
          .attr("class", "sel-pt").attr("r", 3.5).attr("cx", d => x(d.band)).attr("cy", d => y(d.v))
          .on("mouseenter", (e, d) => showTip(e, `<b>Selección, popularidad ${d.band}</b><br>${LABEL[k]} media: ${fmtV(k, d.v)} (${d.n} artistas)`))
          .on("mouseleave", hideTip);
      });
    }
    update();
    store.bus.on(`filter.bd${el.id}`, update);
  }
  return { render };
}
