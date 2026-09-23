// P4 puente WHOOP a música. Mapa tempo × energy de canciones con las zonas de la regla
// de diseño (intensidad de la sesión a rango de tempo y energy). El nivel activo se elige
// con los botones o sale de la selección de sesiones; se marcan las canciones de "Mi playlist".
import { dur, esc, fmtV, showTip, hideTip, LEVEL_COLORS } from "../store.js";
import { play, playButton } from "../player.js";
const d3 = window.d3;

export function musicmap(el, store, { q4, listEl, levelEl, summaryEl, onAdd }) {
  const rule = q4.rule;
  const sample = q4.music_sample.map(r => ({ id: r[0], name: r[1], artist: r[2], year: r[3], tempo: r[4], energy: r[5], pop: r[6] }));
  let level = null, auto = true, playlist = [];
  const fits = (r, s) => s.tempo >= r.tempo[0] && s.tempo <= r.tempo[1] && s.energy >= r.energy[0] && s.energy <= r.energy[1];
  const levelOfSong = s => rule.find(r => fits(r, s))?.level || null;

  let draw = () => {};
  function render() {
    const root = d3.select(el);
    root.selectAll("*").remove();
    const W = el.clientWidth, H = 420;
    const m = { t: 16, r: 16, b: 40, l: 46 }, w = W - m.l - m.r, h = H - m.t - m.b;
    const svg = root.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    const x = d3.scaleLinear().domain([60, 200]).range([0, w]);
    const y = d3.scaleLinear().domain([0, 1]).range([h, 0]);
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(8));
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5));
    g.append("text").attr("class", "axis-title").style("cursor", "default").attr("x", w).attr("y", h + 34).attr("text-anchor", "end").text("Tempo (BPM)");
    g.append("text").attr("class", "axis-title").style("cursor", "default").attr("x", 4).attr("y", 2).text("Energy");

    const zonesG = g.append("g");
    const zr = zonesG.selectAll("g").data(rule).join("g").style("cursor", "pointer")
      .on("click", (e, r) => { auto = false; level = r.level; update(); });
    zr.append("rect").attr("class", "rule-zone")
      .attr("x", r => x(Math.max(60, r.tempo[0]))).attr("width", r => x(Math.min(200, r.tempo[1])) - x(Math.max(60, r.tempo[0])))
      .attr("y", r => y(r.energy[1])).attr("height", r => y(r.energy[0]) - y(r.energy[1]))
      .attr("fill", r => LEVEL_COLORS[r.level]).attr("stroke", r => LEVEL_COLORS[r.level]);
    zr.append("text").attr("class", "rule-label").attr("x", r => x(Math.max(60, r.tempo[0])) + 6).attr("y", r => y(r.energy[1]) + 15)
      .attr("fill", r => LEVEL_COLORS[r.level]).text(r => r.level);

    const dots = g.append("g").selectAll("circle").data(sample).join("circle").attr("class", "song-dot")
      .attr("cx", d => x(Math.max(60, Math.min(200, d.tempo)))).attr("cy", d => y(d.energy)).attr("r", 2)
      .style("cursor", "pointer").on("click", (e, d) => play(d))
      .on("mouseenter", (e, d) => showTip(e, `<b>${esc(d.name)}</b><br>${esc(d.artist)}, ${d.year}<br><span class="m">${fmtV("tempo", d.tempo)} BPM, energy ${fmtV("energy", d.energy)}<br>Clic para escuchar</span>`))
      .on("mouseleave", hideTip);
    const recG = g.append("g"), mineG = g.append("g");

    draw = () => {
      const r = rule.find(r => r.level === level);
      zr.select("rect").transition().duration(dur(300))
        .attr("fill-opacity", q => (q.level === level ? 0.2 : 0.06)).attr("stroke-width", q => (q.level === level ? 2 : 1));
      dots.attr("fill", d => (r && fits(r, d) ? LEVEL_COLORS[level] : "#5a5a5a")).attr("opacity", d => (r && fits(r, d) ? 0.85 : 0.5));
      const top = level ? q4.music[level].top.slice(0, 6) : [];
      recG.selectAll("circle").data(top, d => d.id).join("circle").attr("class", "rec-dot")
        .attr("cx", d => x(d.v.tempo)).attr("cy", d => y(d.v.energy)).attr("r", 5).attr("fill", LEVEL_COLORS[level] || "#999")
        .style("cursor", "pointer").on("click", (e, d) => play(d, top))
        .on("mouseenter", (e, d) => showTip(e, `<b>${esc(d.name)}</b><br>${esc(d.artist)}<br>Recomendada para intensidad ${level}<br><span class="m">Clic para escuchar</span>`))
        .on("mouseleave", hideTip);
      const mine = mineG.selectAll("g").data(playlist, d => d.id).join(enter => {
        const k = enter.append("g");
        k.append("circle").attr("r", 6.5).attr("class", "mine-dot");
        k.append("text").attr("class", "mine-label").attr("x", 9).attr("y", -8);
        return k;
      });
      mine.attr("transform", d => `translate(${x(Math.max(60, Math.min(200, d.v.tempo)))},${y(d.v.energy)})`)
        .style("cursor", "pointer").on("click", (e, d) => play(d, playlist))
        .on("mouseenter", (e, d) => showTip(e, `<b>${esc(d.name)}</b> (tu playlist)<br>${fmtV("tempo", d.v.tempo)} BPM, energy ${fmtV("energy", d.v.energy)}<br>Intensidad: ${levelOfSong(d.v) || "fuera de la regla"}`))
        .on("mouseleave", hideTip);
      mine.select("text").text(d => (d.name.length > 22 ? d.name.slice(0, 21) + "…" : d.name));
    };
    update();
  }

  function selectionSummary() {
    const act = store.items.filter(d => d._a);
    const counts = d3.rollup(act, v => v.length, d => d.level);
    const top = [...counts].sort((a, b) => b[1] - a[1])[0];
    return { n: act.length, counts, top: top ? top[0] : null, share: top ? top[1] / act.length : 0 };
  }

  function update() {
    const sel = selectionSummary();
    if (auto) level = sel.top;
    d3.select(levelEl).selectAll("button").data(rule.map(r => r.level)).join("button").attr("type", "button")
      .text(l => l).attr("aria-pressed", l => String(l === level))
      .on("click", (e, l) => { auto = false; level = l; update(); });
    const filtered = sel.n < store.items.length;
    const r = rule.find(r => r.level === level);
    const pl = d3.rollup(playlist, v => v.length, d => levelOfSong(d.v) || "fuera");
    d3.select(summaryEl).html(
      `${filtered ? `En tu selección (${sel.n} sesiones) predomina la intensidad <b>${sel.top}</b> (${d3.format(".0%")(sel.share)}).` : `Selecciona sesiones en las otras vistas o elige un nivel.`}
       ${r ? ` Para <b>${level}</b> la regla sugiere ${r.tempo[0]}–${r.tempo[1]} BPM y energy ${r.energy[0]}–${r.energy[1]}: ${d3.format(",")(q4.music[level].n)} canciones del catálogo (${d3.format(".1%")(q4.music[level].share)}).` : ""}
       ${playlist.length ? `<br>Tu playlist: ${rule.map(q => `${pl.get(q.level) || 0} para ${q.level.toLowerCase()}`).join(", ")}${pl.get("fuera") ? `, ${pl.get("fuera")} fuera de la regla` : ""}.` : ""}`);
    const list = d3.select(listEl);
    list.selectAll("*").remove();
    if (level) {
      const ol = list.append("ol").attr("class", "pl-list recs");
      ol.selectAll("li").data(q4.music[level].top.slice(0, 6)).join("li").each(function (d) {
        const li = d3.select(this);
        li.append("span").attr("class", "pl-name").html(`<b>${esc(d.name)}</b><span>${esc(d.artist)}, ${fmtV("tempo", d.v.tempo)} BPM, energy ${fmtV("energy", d.v.energy)}</span>`);
        playButton(li, d, q4.music[level].top.slice(0, 6));
        li.append("button").attr("type", "button").attr("class", "icon").attr("title", "Agregar a mi playlist").text("+")
          .on("click", function () { onAdd({ ...d, v: { ...d.v } }); d3.select(this).text("✓").attr("disabled", true); });
      });
    }
    draw();
  }

  store.bus.on(`filter.mm${el.id}`, () => { auto = true; update(); });
  return { render, setPlaylist: list => { playlist = list; update(); } };
}
