// Mapa de calor año × atributo (data_by_year.csv). Brush en X = filtro temporal global.
import { S, bus, setFilter, showTip, hideTip, labelOf } from "../state.js";
const d3 = window.d3;

let brush, brushG, x, years, playing = null;

export function renderHeatmap() {
  const root = d3.select("#heat");
  root.selectAll("*").remove();
  const W = root.node().clientWidth;
  const rows = [...S.feats.map(f => f.key), "popularity"];
  const m = { t: 4, r: 8, b: 26, l: 118 };
  const rowH = 20;
  const H = m.t + rows.length * rowH + m.b;
  years = S.years.map(d => d.year);

  const svg = root.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
  const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
  x = d3.scaleBand().domain(years).range([0, W - m.l - m.r]).paddingInner(0.06);
  const y = d3.scaleBand().domain(rows).range([0, rows.length * rowH]).paddingInner(0.12);

  rows.forEach(key => {
    const ext = d3.extent(S.years, d => d[key]);
    const c = d3.scaleSequential(t => d3.interpolateYlGnBu(0.08 + 0.9 * t)).domain(ext);
    g.append("g").selectAll("rect").data(S.years).join("rect")
      .attr("x", d => x(d.year)).attr("y", y(key))
      .attr("width", x.bandwidth()).attr("height", y.bandwidth())
      .attr("fill", d => c(d[key]))
      .on("mousemove", (e, d) => {
        const unit = key === "loudness" ? " dB" : key === "tempo" ? " BPM" : "";
        showTip(e, `<b>${d.year}</b><br>${key === "popularity" ? "Popularidad" : labelOf(key)} promedio: ${d3.format(".3~f")(d[key])}${unit}`);
      })
      .on("mouseleave", hideTip);
  });

  g.append("g").selectAll("text").data(rows).join("text")
    .attr("class", "axis-title").style("cursor", "default")
    .attr("x", -8).attr("y", k => y(k) + y.bandwidth() / 2).attr("dy", "0.35em")
    .attr("text-anchor", "end").text(k => (k === "popularity" ? "Popularidad" : labelOf(k)));

  g.append("g").attr("class", "axis")
    .attr("transform", `translate(0,${rows.length * rowH + 2})`)
    .call(d3.axisBottom(x).tickValues(years.filter(yr => yr % 10 === 0)).tickSizeOuter(0));

  // Marca del año de la canción en hover / fijada
  const mark = g.append("g");
  const markYear = (cls, d) => {
    mark.selectAll(`.${cls}`).remove();
    if (!d) return;
    mark.append("line").attr("class", `year-mark ${cls}`)
      .attr("x1", x(d.year) + x.bandwidth() / 2).attr("x2", x(d.year) + x.bandwidth() / 2)
      .attr("y1", -2).attr("y2", rows.length * rowH + 2)
      .attr("stroke-dasharray", cls === "pinned" ? "4 3" : null);
  };
  bus.on("hover.heat", d => markYear("hov", d));
  bus.on("pin.heat", d => markYear("pinned", d));

  // Brush temporal
  brush = d3.brushX().extent([[0, -2], [W - m.l - m.r, rows.length * rowH + 2]])
    .on("brush end", ({ selection, sourceEvent }) => {
      if (!selection) { setFilter("years", null); return; }
      const [a, b] = selection.map(px => pxToYear(px));
      setFilter("years", [a, b]);
      if (sourceEvent && playing) stopPlay();
    });
  brushG = g.append("g").attr("class", "brush").call(brush);
  if (S.filters.years) brushG.call(brush.move, yearsToPx(S.filters.years));

  bus.on("clear.heat", () => { stopPlay(); brushG.call(brush.move, null); });
}

function pxToYear(px) {
  const i = Math.max(0, Math.min(years.length - 1, Math.floor(px / x.step())));
  return years[i];
}
function yearsToPx([a, b]) { return [x(a), x(b) + x.bandwidth()]; }

// Animación: ventana de 10 años que recorre el siglo
export function togglePlay(btn) {
  if (playing) { stopPlay(); return; }
  let start = 1921;
  btn.attr("aria-pressed", "true").text("Pausar");
  const step = () => {
    const end = Math.min(start + 9, 2020);
    brushG.call(brush.move, yearsToPx([start, end]));
    start += 3;
    if (start > 2011) stopPlay();
  };
  step();
  playing = d3.interval(step, 420);
  playing.btn = btn;
}
function stopPlay() {
  if (!playing) return;
  playing.stop();
  playing.btn.attr("aria-pressed", "false").text("Reproducir década a década");
  playing = null;
}
