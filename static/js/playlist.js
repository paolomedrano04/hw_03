// "Mi playlist": el usuario busca las canciones que quiere escuchar entre las 151 mil del
// dataset, las agrega y las ve marcadas en todas las vistas (P1 canciones, P2 sus artistas,
// P3 sus años). También compara su playlist con el catálogo y pide canciones parecidas.
import { esc, fmtV, LABEL, showTip, hideTip, dur } from "./store.js";
import { play, playButton } from "./player.js";
const d3 = window.d3;
const KEY = "ds5343-mi-playlist";
const COMPARE = ["danceability", "energy", "tempo", "liveness", "popularity"];

export function initPlaylist({ T, A, meta, onChange }) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { list = []; }
  const artistCache = new Map();
  let onlyMine = false;

  const root = d3.select("#playlist");
  root.html(`
    <h3>Mi playlist</h3>
    <p class="hint">Busca, agrega y escucha tus canciones. Aparecen marcadas en verde en todas las vistas.</p>
    <div class="search">
      <input id="pl-q" type="search" placeholder="Canción o artista…" autocomplete="off" aria-label="Buscar canción o artista">
      <div id="pl-results" class="results" role="listbox"></div>
    </div>
    <ol id="pl-list" class="pl-list"></ol>
    <label class="check"><input type="checkbox" id="pl-only"> Ver solo mi playlist</label>
    <div id="pl-compare" class="view"></div>
    <div class="pl-actions">
      <button class="btn" id="pl-play" type="button">▶ Reproducir</button>
      <button class="btn" id="pl-rec" type="button">Recomendar parecidas</button>
      <button class="btn ghost" id="pl-empty" type="button">Vaciar</button>
    </div>
    <div id="pl-recs"></div>`);

  // ---------- Buscador --------------------------------------------------------------
  let timer, ctrl;
  d3.select("#pl-q").on("input", function () {
    const q = this.value.trim();
    clearTimeout(timer);
    if (q.length < 2) { d3.select("#pl-results").html(""); return; }
    timer = setTimeout(async () => {
      ctrl?.abort(); ctrl = new AbortController();
      try {
        const res = await d3.json(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        renderResults(res, q);
      } catch (e) { if (e.name !== "AbortError") d3.select("#pl-results").html(`<p class="hint">No se pudo buscar. ¿Está corriendo app.py?</p>`); }
    }, 250);
  }).on("keydown", e => { if (e.key === "Escape") { e.target.value = ""; d3.select("#pl-results").html(""); } });

  function renderResults(res, q) {
    const box = d3.select("#pl-results");
    if (!res.length) { box.html(`<p class="hint">No hay canciones con «${esc(q)}» en el dataset (llega hasta 2020).</p>`); return; }
    box.html("");
    box.selectAll("button").data(res).join("button").attr("type", "button").attr("class", "res")
      .classed("added", d => has(d.id))
      .html(d => `<b>${esc(d.name)}</b><span>${esc(d.artist)}, ${d.year}</span>`)
      .on("click", (e, d) => { add(d); d3.select("#pl-q").property("value", ""); box.html(""); });
  }

  // ---------- Operaciones ---------------------------------------------------------------
  const has = id => list.some(t => t.id === id);
  function add(t) { if (!has(t.id)) { list.push({ id: t.id, name: t.name, artist: t.artist, year: t.year, v: t.v }); save(); } }
  function remove(id) { list = list.filter(t => t.id !== id); save(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* sin almacenamiento: la lista vive en memoria */ } apply(); }

  async function apply() {
    // P1: marca las canciones de la muestra y agrega las que no están
    T.items = T.items.filter(d => !d._added);
    T.items.forEach(d => (d.mine = false));
    const byId = new Map(T.items.map(d => [d.id, d]));
    for (const t of list) {
      const d = byId.get(t.id);
      if (d) d.mine = true;
      else T.items.push({ ...t, v: { ...t.v }, mine: true, _added: true, _a: true });
    }
    T.items.sort((a, b) => (a.mine === b.mine ? 0 : a.mine ? 1 : -1));   // las mías se dibujan encima

    // P2: sus artistas (ubicados junto a su vecino más parecido de la muestra)
    const names = [...new Set(list.map(t => t.artist))];
    await Promise.all(names.filter(n => !artistCache.has(n)).map(async n => {
      try { artistCache.set(n, await d3.json(`/api/artist?name=${encodeURIComponent(n)}`)); } catch (e) { artistCache.set(n, null); }
    }));
    A.items = A.items.filter(d => !d._added);
    A.items.forEach(d => (d.mine = false));
    const aByName = new Map(A.items.map(d => [d.name.toLowerCase(), d]));
    for (const n of names) {
      const a = artistCache.get(n);
      if (!a) continue;
      const inSample = aByName.get(a.name.toLowerCase());
      if (inSample) { inSample.mine = true; continue; }
      const jitter = () => (Math.random() - 0.5) * 0.03;
      A.items.push({ ...a, p: Object.fromEntries(Object.entries(a.p).map(([m, xy]) => [m, [xy[0] + jitter(), xy[1] + jitter()]])), mine: true, _added: true, _a: true });
    }
    A.items.sort((a, b) => (a.mine === b.mine ? 0 : a.mine ? 1 : -1));

    setOnly(onlyMine && list.length > 0);
    renderList();
    renderCompare();
    onChange(list);
  }

  function setOnly(on) {
    onlyMine = on;
    d3.select("#pl-only").property("checked", on).property("disabled", !list.length);
    T.setFilter("mine", on ? d => d.mine : null);
    A.setFilter("mine", on ? d => d.mine : null);
  }
  d3.select("#pl-only").on("change", function () { setOnly(this.checked); });
  d3.select("#pl-play").on("click", () => { if (list.length) play(list[0], list); });
  d3.select("#pl-empty").on("click", () => { list = []; d3.select("#pl-recs").html(""); save(); });

  // ---------- Lista ----------------------------------------------------------------------
  function renderList() {
    const ol = d3.select("#pl-list");
    if (!list.length) { ol.html(`<li class="hint">Todavía no agregaste canciones.</li>`); return; }
    ol.html("");
    const li = ol.selectAll("li").data(list, d => d.id).join("li");
    li.append("button").attr("type", "button").attr("class", "pl-name")
      .attr("title", "Fijar y ver en las vistas")
      .html(d => `<b>${esc(d.name)}</b><span>${esc(d.artist)}, ${d.year}</span>`)
      .on("click", (e, d) => { const t = T.items.find(x => x.id === d.id); if (t) { T.pinned = null; T.pin(t); document.getElementById("q1").scrollIntoView({ behavior: "smooth" }); } })
      .on("mouseenter", (e, d) => { const t = T.items.find(x => x.id === d.id); if (t) T.hover(t); })
      .on("mouseleave", () => T.hover(null));
    li.each(function (d) { playButton(d3.select(this), d, () => list); });
    li.append("button").attr("type", "button").attr("class", "icon").attr("title", "Quitar").attr("aria-label", "Quitar de la playlist")
      .text("×").on("click", (e, d) => remove(d.id));
  }

  // ---------- Mi playlist frente al catálogo (percentiles) ----------------------------------
  const pct = (k, v) => {
    const p = meta.q1.percentiles[k];
    return d3.bisectLeft(p, v);   // 0–100
  };
  function renderCompare() {
    const box = d3.select("#pl-compare");
    box.selectAll("*").remove();
    if (!list.length) return;
    const W = box.node().clientWidth || 290, rowH = 30, m = { l: 86, r: 12, t: 22 };
    const H = m.t + COMPARE.length * rowH + 6;
    const svg = box.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const x = d3.scaleLinear().domain([0, 100]).range([m.l, W - m.r]);
    svg.append("text").attr("class", "caption").attr("x", 0).attr("y", 10).text("Percentil frente a las 151 mil canciones");
    svg.append("line").attr("x1", x(50)).attr("x2", x(50)).attr("y1", m.t - 4).attr("y2", H - 4).attr("stroke", "var(--rule)").attr("stroke-dasharray", "3 3");
    COMPARE.forEach((k, i) => {
      const y = m.t + i * rowH + rowH / 2;
      const g = svg.append("g");
      g.append("text").attr("class", "axis-title").style("cursor", "default").attr("x", m.l - 8).attr("y", y).attr("dy", "0.35em").attr("text-anchor", "end").text(LABEL[k]);
      g.append("line").attr("x1", x(0)).attr("x2", x(100)).attr("y1", y).attr("y2", y).attr("stroke", "var(--rule)").attr("stroke-width", 6).attr("stroke-linecap", "round");
      g.selectAll("circle.s").data(list).join("circle").attr("class", "s").attr("r", 3)
        .attr("cx", x(50)).attr("cy", y).attr("fill", "var(--muted)").attr("opacity", 0.6)
        .on("mouseenter", (e, d) => showTip(e, `<b>${esc(d.name)}</b><br>${LABEL[k]} ${fmtV(k, d.v[k])}, percentil ${pct(k, d.v[k])}`))
        .on("mouseleave", hideTip)
        .transition().duration(dur(600)).attr("cx", d => x(pct(k, d.v[k])));
      const mean = d3.mean(list, d => d.v[k]);
      const pm = pct(k, mean);
      g.append("circle").attr("r", 6.5).attr("cy", y).attr("cx", x(50)).attr("fill", "var(--ink)").attr("stroke", "#fff").attr("stroke-width", 2)
        .on("mouseenter", e => showTip(e, `<b>Promedio de tu playlist</b><br>${LABEL[k]} ${fmtV(k, mean)}: más que el ${pm} % de las canciones del dataset (media general ${fmtV(k, meta.q1.means[k])})`))
        .on("mouseleave", hideTip)
        .transition().duration(dur(600)).attr("cx", x(pm));
    });
    const dm = d3.mean(list, d => d.v.danceability);
    box.append("p").attr("class", "pl-sum").html(`Tu playlist es más bailable que el <b>${pct("danceability", dm)} %</b> de las canciones; su tempo medio es ${fmtV("tempo", d3.mean(list, d => d.v.tempo))} BPM.`);
  }

  // ---------- Recomendaciones --------------------------------------------------------------
  d3.select("#pl-rec").on("click", async function () {
    const box = d3.select("#pl-recs");
    if (!list.length) { box.html(`<p class="hint">Agrega al menos una canción para recibir recomendaciones.</p>`); return; }
    box.html(`<p class="hint">Buscando…</p>`);
    try {
      const recs = await d3.json(`/api/similar?ids=${list.map(t => t.id).join(",")}`);
      box.html(`<p class="hint">Las 10 canciones (popularidad ≥ 30) más cercanas al promedio de tu playlist en tempo, energy, liveness y danceability:</p>`);
      box.append("ol").attr("class", "pl-list recs").selectAll("li").data(recs).join("li").each(function (d) {
        const li = d3.select(this);
        li.append("span").attr("class", "pl-name").html(`<b>${esc(d.name)}</b><span>${esc(d.artist)}, ${d.year}</span>`);
        playButton(li, d, recs);
        li.append("button").attr("type", "button").attr("class", "icon").attr("title", "Agregar a mi playlist").text("+")
          .on("click", function () { add(d); d3.select(this).text("✓").attr("disabled", true); });
      });
    } catch (e) { box.html(`<p class="hint">No se pudieron calcular recomendaciones.</p>`); }
  });

  apply();
  return { add, has, list: () => list };
}
