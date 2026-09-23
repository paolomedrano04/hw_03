import { Store, rampLegend, CLUSTER_COLORS, ACT_COLORS, LEVEL_COLORS, esc, fmtV, LABEL } from "./store.js";
import { parallel } from "./views/parallel.js";
import { star } from "./views/star.js";
import { radviz } from "./views/radviz.js";
import { projection } from "./views/projection.js";
import { profile } from "./views/profile.js";
import { bands } from "./views/bands.js";
import { timeseries, connected } from "./views/temporal.js";
import { initPlaylist } from "./playlist.js";
import { play, initPlayer } from "./player.js";
import { lab } from "./lab.js";
import { zones } from "./views/zones.js";
import { musicmap } from "./views/musicmap.js";
const d3 = window.d3;
const $ = id => document.getElementById(id);
const fN = d3.format(",");
const fR = r => d3.format("+.2f")(r).replace("-", "−");

async function init() {
  initPlayer();
  let tracks, artists, years, meta, sessions, pool;
  try {
    [tracks, artists, years, meta, sessions, pool] = await Promise.all(["tracks", "artists", "years", "meta", "sessions", "pool"].map(n => d3.json(`/api/${n}`)));
  } catch (e) {
    d3.select("#lede").text("No se pudieron cargar los datos. Ejecuta «python preprocess.py» y reinicia «python app.py».");
    return;
  }

  // ---------- Stores ---------------------------------------------------------------------
  const clusterName = c => (c.liveness > 0.35 ? "Sonido en vivo" : c.loudness > -10 && c.danceability > 0.55 ? "Fuerte y bailable" : "Suave y tranquilo");
  meta.q2.clusters.forEach(c => (c.name = clusterName(c)));

  const T = new Store({
    name: "tracks", items: tracks, keys: ["tempo", "liveness", "energy", "danceability", "popularity"],
    domains: meta.q1.domains, colorKey: "danceability",
    tip: d => `<b>${esc(d.name)}</b><br>${esc(d.artist)}, ${d.year}<br>
      Danceability <b>${fmtV("danceability", d.v.danceability)}</b><br>
      <span class="m">Tempo ${fmtV("tempo", d.v.tempo)} BPM, Energy ${fmtV("energy", d.v.energy)}, Liveness ${fmtV("liveness", d.v.liveness)}, Pop. ${d.v.popularity}</span>`,
  });
  const A = new Store({
    name: "artists", items: artists, keys: ["loudness", "danceability", "liveness", "popularity"],
    domains: meta.q2.domains, colorKey: "popularity",
    tip: d => `<b>${esc(d.name)}</b> <span class="m">(${d.count} canciones)</span><br>
      Popularity <b>${d.v.popularity.toFixed(0)}</b>, ${meta.q2.clusters[d.cl].name}<br>
      <span class="m">Loudness ${fmtV("loudness", d.v.loudness)} dB, Danceability ${fmtV("danceability", d.v.danceability)}, Liveness ${fmtV("liveness", d.v.liveness)}</span>`,
  });
  const Y = new Store({
    name: "years", items: years.map(d => ({ id: d.year, year: d.year, v: { liveness: d.liveness, popularity: d.popularity } })),
    keys: ["liveness", "popularity"], domains: { liveness: [0, 1], popularity: [0, 100] }, colorKey: "year",
    tip: d => `${d.year}`,
  });

  const hasW = !!(meta.q4 && sessions.length);
  const W = new Store({
    name: "sessions", items: sessions, keys: ["recovery", "strain", "pmax", "avg_hr", "dur", "z1", "z2", "z3", "z4", "z5"],
    domains: hasW ? { ...meta.q4.domains, z1: [0, 1], z2: [0, 1], z3: [0, 1], z4: [0, 1], z5: [0, 1] } : {}, colorKey: "act",
    tip: d => `<b>${d.act}</b>, intensidad ${d.level}<br>${d.date}, ${d.user} (${d.fitness}, ${d.age} años)<br>
      ${fmtV("pmax", d.v.pmax)} de FC máx, FC media ${fmtV("avg_hr", d.v.avg_hr)} lpm, ${d.v.dur} min<br>
      <span class="m">Strain ${fmtV("strain", d.v.strain)}, Recovery ${fmtV("recovery", d.v.recovery)} %<br>
      Zonas 1–5: ${["z1", "z2", "z3", "z4", "z5"].map(z => fmtV(z, d.v[z])).join(", ")}</span>`,
  });
  if (!hasW) d3.select("#q4").style("display", "none");

  d3.select("#lede").html(`Cuatro preguntas sobre ${fN(meta.q1.n_clean)} canciones de Spotify (1921–2020) y ${fN(meta.q4 ? meta.q4.n_sessions : 0)} sesiones de entrenamiento WHOOP. Agrega tus canciones en <b>Mi playlist</b> y escúchalas aquí mismo.`);

  // ---------- Vistas ---------------------------------------------------------------------
  const v1 = {
    profile: profile($("q1-profile"), T, { xs: ["tempo", "liveness", "energy"], y: "danceability", bins: meta.q1.bins, corr: meta.q1.corr }),
    pc: parallel($("q1-pc"), T, { dims: ["tempo", "energy", "danceability", "liveness", "popularity"], scaleSelect: "#q1-scale" }),
    star: star($("q1-star"), T, { keys: ["tempo", "liveness", "energy", "popularity"] }),
    rv: radviz($("q1-rv"), T, { keys: ["tempo", "energy", "liveness", "popularity"] }),
  };
  const ev = meta.q2.pca_explained;
  const v2 = {
    proj: projection($("q2-proj"), A, {
      methods: meta.q2.projections, buttons: "#q2-method", labels: meta.q2.clusters,
      caption: m => d3.select("#q2-caption").text({
        pca: `PCA: los dos ejes explican el ${d3.format(".0%")(ev[0] + ev[1])} de la varianza.`,
        tsne: "t-SNE: agrupa vecinos; la distancia entre grupos no se interpreta.",
        umap: "UMAP: agrupa vecinos y conserva algo más de la forma global.",
      }[m] + " Arrastra para seleccionar artistas."),
    }),
    rv: radviz($("q2-rv"), A, { keys: ["loudness", "danceability", "liveness", "popularity"], off: ["popularity"] }),
    bands: bands($("q2-bands"), A, { keys: ["loudness", "danceability", "liveness"], bands: meta.q2.bands }),
    pc: parallel($("q2-pc"), A, { dims: ["loudness", "danceability", "popularity", "liveness"], scaleSelect: "#q2-scale", height: 340 }),
  };
  const v3 = {
    ts: timeseries($("q3-ts"), Y, { corrEl: $("q3-corr"), controls: { mode: "#q3-mode", smooth: "#q3-smooth", win: "#q3-win" } }),
    cs: connected($("q3-cs"), Y, { playBtn: "#q3-play" }),
  };
  const v4 = hasW ? {
    zones: zones($("q4-zones"), W, { activities: meta.q4.activities }),
    rv: radviz($("q4-rv"), W, { keys: ["z1", "z2", "z3", "z4", "z5"] }),
    music: musicmap($("q4-music"), W, { q4: meta.q4, listEl: "#q4-recs", levelEl: "#q4-level", summaryEl: "#q4-summary", onAdd: d => playlist.add(d) }),
    pc: parallel($("q4-pc"), W, { dims: ["recovery", "strain", "pmax", "avg_hr", "dur", "z5", "z4", "z3", "z2", "z1"], scaleSelect: "#q4-scale", height: 360 }),
  } : {};
  const LAB = lab($("lab-map"), {
    rows: pool, meta: meta.lab, domains: meta.q1.domains, onAdd: d => playlist.add(d),
    sideEls: { status: "#lab-status", profiles: "#lab-profiles", inertia: "#lab-inertia", list: "#lab-list", steps: "#lab-steps", controls: "#lab-controls", stop: "#lab-stop" },
  });
  const all = [...Object.values(v1), ...Object.values(v2), ...Object.values(v3), ...Object.values(v4), LAB];
  all.forEach(v => v.render());

  // ---------- Mi playlist: al cambiar, se redibujan P1 y P2 con las canciones/artistas marcados
  let firstRun = true;
  const playlist = initPlaylist({
    T, A, meta,
    onChange: list => {
      if (!firstRun || list.length) {
        // al redibujar se pierden los brushes: se limpian sus filtros (se conservan año y "solo mi playlist")
        for (const S of [T, A]) {
          for (const k of [...S.filters.keys()]) if (k !== "year" && k !== "mine") S.filters.delete(k);
          S.setFilter("_", null);
        }
        [...Object.values(v1), ...Object.values(v2)].forEach(v => v.render());
      }
      firstRun = false;
      v3.ts.markYears(list);
      v4.music?.setPlaylist(list);
      LAB.setPlaylist(list);
      T.bus.call("filter"); A.bus.call("filter");
    },
  });

  // ---------- Controles ---------------------------------------------------------------
  d3.select("#q1-iso").selectAll("button").data(["tempo", "liveness", "energy"]).join("button")
    .attr("type", "button").text(k => `Aislar ${LABEL[k]}`).on("click", (e, k) => v1.star.isolate(k));
  d3.select("#q1-star-reset").on("click", () => v1.star.reset());
  d3.select("#q1-rv-reset").on("click", () => v1.rv.reset());
  d3.select("#q4-rv-reset").on("click", () => v4.rv?.reset());
  d3.select("#lab-k").on("input", function () { d3.select("#lab-k-out").text(this.value); LAB.setK(+this.value); });
  d3.select("#lab-speed").on("change", function () { LAB.setSpeed(+this.value); });
  d3.select("#lab-run").on("click", () => LAB.runKmeans());
  d3.select("#lab-reco").on("click", () => LAB.recommend());
  d3.select("#lab-stop").on("click", () => LAB.stop());
  // "Recomendar parecidas" de la biblioteca lleva al laboratorio y corre la animación
  d3.select("#pl-rec").on("click", () => { $("lab").scrollIntoView({ behavior: "smooth" }); setTimeout(() => LAB.recommend(), 600); });
  d3.select("#q2-rv-reset").on("click", () => { v2.rv.reset(); d3.select("#q2-rv-pop").attr("aria-pressed", "false").text("Añadir ancla Popularity"); });
  d3.select("#q2-rv-pop").on("click", function () {
    const on = v2.rv.toggle("popularity");
    d3.select(this).attr("aria-pressed", String(on)).text(on ? "Quitar ancla Popularity" : "Añadir ancla Popularity");
  });

  const legend = (el, store) => {
    const cats = { act: ACT_COLORS, level: LEVEL_COLORS }[store.colorKey];
    if (cats) {
      d3.select(el).html(`<div class="cl">${Object.entries(cats).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join("")}</div>`);
    } else if (store.colorKey === "cluster") {
      d3.select(el).html(`<div class="cl">${meta.q2.clusters.map(c => `<span><i style="background:${CLUSTER_COLORS[c.id]}"></i>${c.name} (pop. ${c.pop})</span>`).join("")}</div>`);
    } else rampLegend(el, store);
  };
  [["q1", T], ["q2", A], ...(hasW ? [["q4", W]] : [])].forEach(([q, S]) => {
    d3.select(`#${q}-color`).on("change", function () { S.setColor(this.value); legend(`#${q}-legend`, S); });
    legend(`#${q}-legend`, S);
    d3.select(`#${q}-clear`).on("click", () => S.clear());
    const count = () => d3.select(`#${q}-count`).html(`<b>${fN(S.nActive)}</b> de ${fN(S.items.length)} ${{ q1: "canciones", q2: "artistas", q4: "sesiones" }[q]}`);
    count();
    S.bus.on("filter.count", count);
  });

  // P3 a P1: el rango de años filtra las canciones
  Y.bus.on("filter.link", () => {
    const f = Y.filters.get("ts");
    const act = Y.items.filter(d => d._a);
    if (!f || !act.length) { T.setFilter("year", null); d3.select("#q1-link").text(""); return; }
    const a = act[0].year, b = act[act.length - 1].year;
    T.setFilter("year", d => d.year >= a && d.year <= b);
    d3.select("#q1-link").text(`Solo ${a}–${b} (filtro desde la Pregunta 3)`);
  });

  // ---------- Tarjeta del elemento fijado --------------------------------------------------
  const bars = (S, d, keys) => `<div class="bars">${keys.map(k => `<span>${LABEL[k]}</span><span class="bar"><i style="width:${S.norm(d, k) * 100}%"></i></span><span>${fmtV(k, S.get(d, k))}</span>`).join("")}</div>`;
  const card = (html) => d3.select("#card").html(`<h3>Elemento fijado</h3>${html ?? `<p class="hint">Haz clic en un punto, línea o año para fijarlo aquí.</p>`}`);
  T.bus.on("pin.card", d => {
    card(d && `<p class="title">${esc(d.name)}</p><p class="sub">${esc(d.artist)}, ${d.year}${d.mine ? ". En tu playlist" : ""}</p>${bars(T, d, T.keys)}
      <div class="card-actions"><button class="btn" id="card-play" type="button">▶ Escuchar aquí</button>
      ${d.mine ? "" : `<button class="btn ghost" id="card-add" type="button">Agregar a mi playlist</button>`}</div>`);
    d3.select("#card-play").on("click", () => d && play(d));
    d3.select("#card-add").on("click", function () { playlist.add(d); d3.select(this).text("Agregada").attr("disabled", true); });
  });
  A.bus.on("pin.card", d => card(d && `<p class="title">${esc(d.name)}</p><p class="sub">Artista con ${d.count} canciones. Perfil: ${meta.q2.clusters[d.cl].name}</p>${bars(A, d, A.keys)}`));
  W.bus.on("pin.card", d => card(d && `<p class="title">${d.act}</p><p class="sub">Sesión WHOOP del ${d.date}, ${d.user}. Intensidad ${d.level}</p>${bars(W, d, ["pmax", "avg_hr", "strain", "dur", "recovery", "z1", "z2", "z3", "z4", "z5"])}`));
  Y.bus.on("pin.card", d => card(d && `<p class="title">${d.year}</p><p class="sub">Promedio anual</p><div class="kv"><span>Liveness</span><span>${fmtV("liveness", d.v.liveness)}</span><span>Popularity</span><span>${fmtV("popularity", d.v.popularity)}</span></div>`));

  // ---------- Navegación y hallazgos --------------------------------------------------------
  const c1 = meta.q1.corr, c2 = meta.q2.corr, bnd = meta.q2.bands;
  const peak = arr => arr.reduce((a, b) => (b.mean > a.mean ? b : a));
  const tp = peak(meta.q1.bins.tempo), ep = peak(meta.q1.bins.energy);
  const cl = meta.q2.clusters;
  const FIND = [
    { id: "q1", label: "Danceability",
      text: `El tempo no se correlaciona con la danceability (r = ${fR(c1.tempo)}), pero la relación existe: tiene forma de <b>U invertida</b>, con un máximo de ${tp.mean.toFixed(2)} entre ${tp.x0} y ${tp.x1} BPM. Energy sigue el mismo patrón y liveness es la única relación negativa (r = ${fR(c1.liveness)}).`,
      try: "Pasa el cursor por la curva de tempo y luego usa «Aislar Tempo»." },
    { id: "q2", label: "Artistas",
      text: `El volumen es lo que más acompaña a la popularidad (r = ${fR(c2.loudness)}), seguido de la danceability (${fR(c2.danceability)}). Liveness va en contra (${fR(c2.liveness)}). Parte del efecto es época: los artistas recientes graban más fuerte y hoy son los más escuchados.`,
      try: "Colorea por cluster y selecciona el grupo «Sonido en vivo» en la proyección." },
    { id: "q3", label: "En el tiempo",
      text: `En el siglo, liveness y popularidad van en sentidos opuestos (r = ${fR(meta.q3.corr)}). La correlación móvil revela dos períodos en que se mueven juntas: <b>1956–1966</b> y <b>1991–2000</b>.`,
      try: "Cambia a «Puntaje z» y pulsa «Reproducir trayectoria»." },
    ...(hasW ? [(() => {
      const q = meta.q4, acts = q.activities, hi = acts[0], lo = acts[acts.length - 1], dd = q.day;
      return { id: "q4", label: "WHOOP",
        text: `<b>${hi.act}</b> es la actividad más intensa (${fmtV("pmax", hi.pmax)} de FC máxima) y <b>${lo.act}</b> la más suave (${fmtV("pmax", lo.pmax)}). Solo el ${d3.format(".1%")(q.music["Muy alta"].share)} del catálogo sirve para una sesión de intensidad muy alta. El recovery casi no depende del sueño (r = ${fR(dd.corr_recovery.sleep_hours)}), algo raro en datos reales: el dataset parece sintético.`,
        try: "Haz clic en HIIT y luego en Yoga: el mapa musical cambia solo." };
    })()] : []),
    { id: "lab", label: "Laboratorio", badge: "L",
      text: `Cada canción es un punto en 4 dimensiones. K-means las agrupa y tu playlist se resume en un centro; las 10 canciones más cercanas a ese centro son la recomendación. El mapa conserva el ${d3.format(".0%")(meta.lab.explained[0] + meta.lab.explained[1])} de la información, por eso la distancia se mide en 4D.`,
      try: "Pulsa «Agrupar en vivo», luego «Recomendar» y arrastra la estrella." },
  ];
  let current = "q1";
  const renderNav = () => {
    d3.select("#nav").selectAll("button").data(FIND).join("button").attr("type", "button").attr("role", "tab")
      .attr("aria-selected", d => String(d.id === current))
      .html((d, i) => `<b>${d.badge || `P${i + 1}`}</b><span>${d.label}</span>`)
      .on("click", (e, d) => { current = d.id; renderNav(); $(d.id).scrollIntoView({ behavior: "smooth", block: "start" }); });
    const f = FIND.find(d => d.id === current);
    d3.select("#finding").html(`<p class="finding">${f.text}</p><p class="views">${f.try}</p>`);
  };
  renderNav();
  // la pestaña sigue a la sección visible
  const io = new IntersectionObserver(ents => {
    ents.forEach(en => { if (en.isIntersecting && en.target.id !== current) { current = en.target.id; renderNav(); } });
  }, { rootMargin: "-40% 0px -55% 0px" });
  ["q1", "q2", "q3", ...(hasW ? ["q4"] : []), "lab"].forEach(id => io.observe($(id)));

  // ---------- Redimensionar ------------------------------------------------------------------
  let lastW = window.innerWidth, timer;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (Math.abs(window.innerWidth - lastW) < 40) return;
      lastW = window.innerWidth;
      [T, A, Y, W].forEach(S => S.clear());
      all.forEach(v => v.render());
    }, 250);
  });
}

init();
