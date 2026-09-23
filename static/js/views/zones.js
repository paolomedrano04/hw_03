// P4: perfil de zonas de frecuencia cardíaca por tipo de actividad (dataset completo).
// Barras apiladas al 100 %; clic en una actividad filtra las demás vistas de la P4.
import { dur, fmtV, showTip, hideTip, ACT_COLORS } from "../store.js";
const d3 = window.d3;
const ZONES = ["z1", "z2", "z3", "z4", "z5"];
export const ZONE_COLORS = ["#6E8FA8", "#509BF5", "#FFC864", "#FF6437", "#E8115B"];

export function zones(el, store, { activities }) {
  const picked = new Set();
  function render() {
    const root = d3.select(el);
    root.selectAll("*").remove();
    const W = el.clientWidth, rowH = 30;
    const m = { t: 30, r: 92, b: 8, l: 122 };
    const H = m.t + activities.length * rowH + m.b;
    const svg = root.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const x = d3.scaleLinear().domain([0, 1]).range([m.l, W - m.r]);
    const y = d3.scaleBand().domain(activities.map(a => a.act)).range([m.t, H - m.b]).padding(0.22);

    // leyenda de zonas
    const lg = svg.append("g").attr("transform", `translate(${m.l},10)`);
    ZONES.forEach((z, i) => {
      const g = lg.append("g").attr("transform", `translate(${i * 74},0)`);
      g.append("rect").attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", ZONE_COLORS[i]);
      g.append("text").attr("class", "caption").attr("x", 16).attr("y", 10).text(`Zona ${i + 1}`);
    });
    svg.append("text").attr("class", "caption").attr("x", W - m.r + 10).attr("y", m.t - 8).text("% FC máx");

    const rows = svg.selectAll("g.act").data(activities).join("g").attr("class", "act")
      .attr("transform", d => `translate(0,${y(d.act)})`).style("cursor", "pointer")
      .on("click", (e, d) => {
        picked.has(d.act) ? picked.delete(d.act) : picked.add(d.act);
        store.setFilter("act", picked.size ? s => picked.has(s.act) : null);
        paint();
      });
    rows.append("rect").attr("x", 4).attr("y", y.bandwidth() / 2 - 5).attr("width", 10).attr("height", 10).attr("rx", 2)
      .attr("fill", d => ACT_COLORS[d.act]);
    rows.append("text").attr("class", "axis-title").attr("x", 20).attr("y", y.bandwidth() / 2).attr("dy", "0.35em").text(d => d.act);
    rows.each(function (d) {
      let acc = 0;
      const segs = ZONES.map((z, i) => { const s = { z, i, x0: acc, x1: acc + d[z] }; acc += d[z]; return s; });
      d3.select(this).selectAll("rect.seg").data(segs).join("rect").attr("class", "seg")
        .attr("x", x(0)).attr("width", 0).attr("height", y.bandwidth()).attr("fill", s => ZONE_COLORS[s.i])
        .on("mousemove", (e, s) => showTip(e, `<b>${d.act}</b><br>Zona ${s.i + 1}: ${fmtV("z1", d[s.z])} del tiempo de sesión<br><span class="m">${d3.format(",")(d.n)} sesiones en el dataset</span>`))
        .on("mouseleave", hideTip)
        .transition().duration(dur(700)).delay((s, i) => dur(i * 60))
        .attr("x", s => x(s.x0)).attr("width", s => Math.max(0, x(s.x1) - x(s.x0) - 1));
    });
    rows.append("text").attr("class", "caption").attr("x", W - m.r + 10).attr("y", y.bandwidth() / 2).attr("dy", "0.35em")
      .text(d => `${fmtV("pmax", d.pmax)}, strain ${d.strain.toFixed(1)}`);

    function paint() { rows.attr("opacity", d => (picked.size && !picked.has(d.act) ? 0.3 : 1)); }
    paint();
    store.bus.on(`clear.zn${el.id}`, () => { picked.clear(); paint(); });
  }
  return { render };
}
