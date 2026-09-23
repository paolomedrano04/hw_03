// Laboratorio de recomendación: todo ocurre EN VIVO en el navegador con D3:
//  1) Las canciones viven en un espacio 4D (tempo, liveness, energy, danceability normalizados).
//  2) K-means agrupa ese espacio iteración a iteración: los centroides se mueven, las canciones
//     cambian de cluster, los contornos (convex hull) se deforman y la inercia baja.
//  3) La recomendación: el centro de tu playlist (promedio 4D) busca a sus vecinos más cercanos;
//     el radio de búsqueda crece y cada vecino se conecta en orden de distancia.
//  4) La estrella se puede arrastrar: el punto 2D se lleva de vuelta a 4D (PCA inversa) y las
//     recomendaciones se recalculan en tiempo real.
import { esc, fmtV, showTip, hideTip, dur } from "./store.js";
import { play, playButton } from "./player.js";
const d3 = window.d3;

const KEYS = ["tempo", "liveness", "energy", "danceability"];
const NAMES = { tempo: "Tempo", liveness: "Liveness", energy: "Energy", danceability: "Danceability" };
const ADJ = {
  tempo: ["rápidas", "lentas"], energy: ["enérgicas", "suaves"],
  danceability: ["bailables", "poco bailables"], liveness: ["en vivo", "de estudio"],
};
export const LAB_COLORS = ["#1ED760", "#509BF5", "#F573A0", "#FFC864", "#FF6437", "#B49BC8", "#2EC4B6", "#E8115B"];
const TOP = 10;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function lab(el, { rows, meta, domains, onAdd, sideEls }) {
  const L = meta;                                     // mean, components (2×4), explained
  const pool = rows.map(r => ({ id: r[0], name: r[1], artist: r[2], year: r[3], pop: r[4], x: r.slice(5, 9), p: [r[9], r[10]], cl: -1 }));
  const means = KEYS.map((_, j) => d3.mean(pool, d => d.x[j]));
  const sds = KEYS.map((_, j) => d3.deviation(pool, d => d.x[j]));
  const project = v => [0, 1].map(c => L.components[c].reduce((s, w, j) => s + w * (v[j] - L.mean[j]), 0));
  const unproject = p => KEYS.map((_, j) => Math.max(0, Math.min(1, L.mean[j] + p[0] * L.components[0][j] + p[1] * L.components[1][j])));
  const norm = t => KEYS.map(k => { const [lo, hi] = domains[k]; return Math.max(0, Math.min(1, (t.v[k] - lo) / (hi - lo))); });
  const dist = (a, b) => Math.sqrt(a.reduce((s, v, j) => s + (v - b[j]) ** 2, 0));
  const denorm = (k, v) => { const [lo, hi] = domains[k]; return lo + v * (hi - lo); };

  const state = { k: 5, speed: 1, centroids: null, running: false, playlist: [], star: null, recs: [], inertia: [], iter: 0, token: 0 };
  let ui = null;

  // ---------------------------------------------------------------------------------------
  function render() {
    const root = d3.select(el);
    root.selectAll("*").remove();
    const W = el.clientWidth, H = Math.max(520, Math.min(680, W * 0.95));
    const svg = root.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("class", "lab-svg");
    const pad = 24;
    const ex = d3.extent(pool, d => d.p[0]), ey = d3.extent(pool, d => d.p[1]);
    const x = d3.scaleLinear().domain([ex[0] - 0.05, ex[1] + 0.05]).range([pad, W - pad]);
    const y = d3.scaleLinear().domain([ey[0] - 0.05, ey[1] + 0.05]).range([H - pad, pad]);
    const P = p => [x(p[0]), y(p[1])];

    // ejes de interpretación: dirección de cada atributo en el plano (cargas del PCA)
    const axG = svg.append("g").attr("class", "lab-axes");
    const c0 = P([0, 0]);
    KEYS.forEach((k, j) => {
      const tip = P([L.components[0][j] * 0.9, L.components[1][j] * 0.9]);
      axG.append("line").attr("x1", c0[0]).attr("y1", c0[1]).attr("x2", tip[0]).attr("y2", tip[1]);
      axG.append("text").attr("x", tip[0]).attr("y", tip[1]).attr("dy", tip[1] < c0[1] ? -6 : 14)
        .attr("text-anchor", tip[0] < c0[0] ? "end" : "start").text(`${NAMES[k]} ↑`);
    });

    const hullG = svg.append("g");
    const ring = svg.append("circle").attr("class", "lab-ring").attr("r", 0).attr("opacity", 0);
    const dots = svg.append("g").selectAll("circle").data(pool).join("circle").attr("class", "lab-dot")
      .attr("cx", d => P(d.p)[0]).attr("cy", d => P(d.p)[1]).attr("r", 2.6)
      .attr("fill", d => (d.cl >= 0 ? LAB_COLORS[d.cl] : "#535353"))
      .on("mouseenter", (e, d) => showTip(e, `<b>${esc(d.name)}</b><br>${esc(d.artist)}, ${d.year}<br><span class="m">${KEYS.map(k => `${NAMES[k]} ${fmtV(k, denorm(k, d.x[KEYS.indexOf(k)]))}`).join(", ")}<br>Clic: escuchar, Mayús+clic: usar como semilla</span>`))
      .on("mouseleave", hideTip)
      .on("click", (e, d) => { if (e.shiftKey) seedFrom([d]); else play(d); });
    const linkG = svg.append("g"), centG = svg.append("g"), mineG = svg.append("g"), starG = svg.append("g");

    const star = starG.append("g").attr("class", "lab-star").attr("opacity", 0).style("cursor", "grab");
    star.append("circle").attr("r", 16).attr("class", "lab-star-halo");
    star.append("path").attr("d", d3.symbol(d3.symbolStar, 260)());
    star.append("text").attr("y", -20).attr("text-anchor", "middle").text("Tu centro");
    star.call(d3.drag()
      .on("start", () => { if (state.running) return; star.style("cursor", "grabbing"); })
      .on("drag", e => {
        if (state.running || !state.star) return;
        const p2 = [x.invert(e.x), y.invert(e.y)];
        state.star = unproject(p2);
        star.attr("transform", `translate(${e.x},${e.y})`);
        liveRecs();
      })
      .on("end", () => star.style("cursor", "grab")));

    const status = d3.select(sideEls.status);
    ui = { svg, x, y, P, dots, hullG, ring, linkG, centG, mineG, star, status, W, H };
    paintClusters(false);
    drawPlaylist();
    if (state.star) { placeStar(false); liveRecs(); }
    drawInertia(); drawProfiles();
  }

  // ---------------------------------------------------------------------------------------
  // K-means en vivo
  function kmeansInit(k) {
    const rnd = d3.randomLcg(42 + k);
    const cents = [pool[Math.floor(rnd() * pool.length)].x.slice()];
    while (cents.length < k) {                       // k-means++
      const d2 = pool.map(d => d3.min(cents, c => dist(d.x, c)) ** 2);
      let r = rnd() * d3.sum(d2), i = 0;
      while ((r -= d2[i]) > 0) i++;
      cents.push(pool[Math.min(i, pool.length - 1)].x.slice());
    }
    return cents;
  }
  async function runKmeans() {
    if (state.running) return;
    const my = ++state.token;
    state.running = true; setButtons();
    state.centroids = kmeansInit(state.k);
    state.inertia = []; state.iter = 0;
    pool.forEach(d => (d.cl = -1));
    step("kmeans");
    say(`Inicializando ${state.k} centroides con k-means++ (el primero al azar, los demás lejos de los anteriores)…`);
    drawCentroids(true);
    await sleep(dur(900 / state.speed));
    for (let it = 1; it <= 30; it++) {
      if (my !== state.token) return;
      // asignación
      let changed = 0, inertia = 0;
      for (const d of pool) {
        let best = 0, bd = Infinity;
        state.centroids.forEach((c, j) => { const dd = dist(d.x, c); if (dd < bd) { bd = dd; best = j; } });
        if (best !== d.cl) changed++;
        d.cl = best; inertia += bd * bd;
      }
      state.iter = it; state.inertia.push(inertia);
      paintClusters(true);
      drawInertia(); drawProfiles();
      say(`Iteración ${it}: ${fN(changed)} canciones cambiaron de cluster, inercia ${inertia.toFixed(1)}`);
      await sleep(dur(700 / state.speed));
      // actualización de centroides
      state.centroids = state.centroids.map((c, j) => {
        const mem = pool.filter(d => d.cl === j);
        return mem.length ? KEYS.map((_, q) => d3.mean(mem, d => d.x[q])) : c;
      });
      drawCentroids(true);
      await sleep(dur(650 / state.speed));
      if (changed <= Math.ceil(pool.length * 0.002)) { say(`Convergió en ${it} iteraciones: ${changed ? `solo ${changed} canciones cambiaron (< 0,2 %)` : "ninguna canción cambió de cluster"}. Inercia final ${inertia.toFixed(1)}.`); break; }
    }
    state.running = false; setButtons();
    if (state.star) highlightStarCluster();
  }
  const fN = d3.format(",");

  function paintClusters(animate) {
    if (!ui) return;
    const t = ui.svg.transition().duration(dur(animate ? 450 / state.speed : 0));
    ui.dots.transition(t).attr("fill", d => (d.cl >= 0 ? LAB_COLORS[d.cl % LAB_COLORS.length] : "#535353"));
    const hulls = state.centroids ? state.centroids.map((c, j) => {
      const pts = pool.filter(d => d.cl === j).map(d => ui.P(d.p));
      return { j, hull: pts.length > 2 ? d3.polygonHull(pts) : null };
    }).filter(h => h.hull) : [];
    ui.hullG.selectAll("path").data(hulls, h => h.j).join(
      enter => enter.append("path").attr("class", "lab-hull").attr("opacity", 0),
      update => update, exit => exit.remove())
      .attr("fill", h => LAB_COLORS[h.j % LAB_COLORS.length]).attr("stroke", h => LAB_COLORS[h.j % LAB_COLORS.length])
      .transition(t).attr("opacity", 1).attr("d", h => `M${h.hull.join("L")}Z`);
  }
  function drawCentroids(animate) {
    if (!ui || !state.centroids) return;
    const data = state.centroids.map((c, j) => ({ j, p: ui.P(project(c)) }));
    const g = ui.centG.selectAll("g").data(data, d => d.j).join(enter => {
      const k = enter.append("g").attr("class", "lab-cent").attr("transform", d => `translate(${d.p})`).attr("opacity", 0);
      k.append("circle").attr("r", 11);
      k.append("text").attr("dy", "0.35em").attr("text-anchor", "middle").text(d => d.j + 1);
      return k;
    }, u => u, exit => exit.remove());
    g.select("circle").attr("stroke", d => LAB_COLORS[d.j % LAB_COLORS.length]);
    g.transition().duration(dur(animate ? 600 / state.speed : 0)).ease(d3.easeCubicInOut)
      .attr("opacity", 1).attr("transform", d => `translate(${d.p})`);
  }

  // perfiles de cluster: barras que se actualizan en cada iteración
  function clusterName(c) {
    const z = KEYS.map((k, j) => ({ k, z: (c[j] - means[j]) / sds[j] })).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    const a = z.slice(0, 2).map(t => ADJ[t.k][t.z > 0 ? 0 : 1]);
    return a[0][0].toUpperCase() + a[0].slice(1) + " y " + a[1];
  }
  function drawProfiles() {
    const box = d3.select(sideEls.profiles);
    box.selectAll("*").remove();
    if (!state.centroids || !pool.some(d => d.cl >= 0)) { box.append("p").attr("class", "hint").text("Pulsa «Agrupar en vivo» para ver cómo se forman los clusters."); return; }
    const sizes = d3.rollup(pool, v => v.length, d => d.cl);
    const rows = box.selectAll("div.cp").data(state.centroids.map((c, j) => ({ c, j, n: sizes.get(j) || 0 }))).join("div").attr("class", "cp")
      .classed("hot", d => state.starCluster === d.j);
    rows.append("div").attr("class", "cp-head").html(d => `<i style="background:${LAB_COLORS[d.j % LAB_COLORS.length]}"></i><b>${d.j + 1}. ${clusterName(d.c)}</b><span>${fN(d.n)}</span>`);
    const bars = rows.append("div").attr("class", "cp-bars");
    KEYS.forEach((k, q) => {
      const b = bars.append("div").attr("class", "cp-bar").attr("title", d => `${NAMES[k]} medio ${fmtV(k, denorm(k, d.c[q]))}`);
      b.append("span").text(NAMES[k]);
      b.append("u").append("em").style("width", d => `${d.c[q] * 100}%`).style("background", d => LAB_COLORS[d.j % LAB_COLORS.length]);
    });
  }
  function drawInertia() {
    const box = d3.select(sideEls.inertia);
    box.selectAll("*").remove();
    const Wd = box.node().clientWidth || 280, Hd = 70, m = { l: 8, r: 8, t: 16, b: 14 };
    const svg = box.append("svg").attr("viewBox", `0 0 ${Wd} ${Hd}`);
    svg.append("text").attr("class", "caption").attr("x", m.l).attr("y", 10).text(state.inertia.length ? `Inercia (suma de distancias²): ${state.inertia.at(-1).toFixed(1)}` : "Inercia: esperando iteraciones");
    if (state.inertia.length < 1) return;
    const xs = d3.scaleLinear().domain([1, Math.max(5, state.inertia.length)]).range([m.l, Wd - m.r]);
    const ys = d3.scaleLinear().domain(d3.extent([...state.inertia, state.inertia[0] * 1.02])).range([Hd - m.b, m.t]);
    svg.append("path").attr("class", "spark").attr("d", d3.line().x((v, i) => xs(i + 1)).y(ys)(state.inertia));
    svg.selectAll("circle").data(state.inertia).join("circle").attr("r", 2.6).attr("class", "spark-pt").attr("cx", (v, i) => xs(i + 1)).attr("cy", ys);
    svg.append("text").attr("class", "caption").attr("x", Wd - m.r).attr("y", Hd - 2).attr("text-anchor", "end").text(`iteración ${state.iter}`);
  }

  // ---------------------------------------------------------------------------------------
  // Recomendación animada
  function drawPlaylist() {
    if (!ui) return;
    const data = state.playlist.map(t => ({ t, p: ui.P(project(norm(t))) }));
    const g = ui.mineG.selectAll("g").data(data, d => d.t.id).join(enter => {
      const k = enter.append("g").attr("class", "lab-mine");
      k.append("circle").attr("r", 6);
      k.append("text").attr("x", 9).attr("y", -8);
      return k;
    });
    g.attr("transform", d => `translate(${d.p})`).on("click", (e, d) => play(d.t, state.playlist))
      .on("mouseenter", (e, d) => showTip(e, `<b>${esc(d.t.name)}</b> (tu playlist)<br>Clic para escuchar`)).on("mouseleave", hideTip);
    g.select("text").text(d => (d.t.name.length > 20 ? d.t.name.slice(0, 19) + "…" : d.t.name));
  }
  function placeStar(animate) {
    const p = ui.P(project(state.star));
    (animate ? ui.star.transition().duration(dur(900 / state.speed)).ease(d3.easeCubicInOut) : ui.star)
      .attr("opacity", 1).attr("transform", `translate(${p})`);
    return p;
  }
  function highlightStarCluster() {
    if (!state.centroids || !state.star) return;
    let best = 0, bd = Infinity;
    state.centroids.forEach((c, j) => { const d = dist(state.star, c); if (d < bd) { bd = d; best = j; } });
    state.starCluster = best;
    ui.hullG.selectAll("path").classed("hot", h => h.j === best).classed("cold", h => h.j !== best);
    drawProfiles();
    return best;
  }
  function ranked(exclude) {
    return pool.filter(d => !exclude.has(d.id)).map(d => ({ d, dist: dist(d.x, state.star) })).sort((a, b) => a.dist - b.dist);
  }

  async function recommend() {
    if (state.running) return;
    if (!state.playlist.length) { say("Agrega canciones a tu playlist (panel izquierdo) o haz Mayús+clic en cualquier punto para usarlo como semilla."); return; }
    await seedFrom(state.playlist);
  }
  async function seedFrom(seeds) {
    if (state.running || !ui) return;
    const my = ++state.token;
    state.running = true; setButtons();
    const V = seeds.map(norm_or_x);
    step("centro");
    // 1) las canciones semilla convergen al centro
    ui.linkG.selectAll("*").remove();
    const startP = ui.P(project(V[0]));
    ui.star.attr("opacity", 0).attr("transform", `translate(${startP})`);
    state.star = KEYS.map((_, j) => d3.mean(V, v => v[j]));
    const centerP = ui.P(project(state.star));
    const conv = ui.linkG.selectAll("line.conv").data(V).join("line").attr("class", "lab-conv")
      .attr("x1", v => ui.P(project(v))[0]).attr("y1", v => ui.P(project(v))[1])
      .attr("x2", v => ui.P(project(v))[0]).attr("y2", v => ui.P(project(v))[1]);
    conv.transition().duration(dur(900 / state.speed)).attr("x2", centerP[0]).attr("y2", centerP[1]);
    say(`Paso 1. El centro de tu playlist es el promedio de ${seeds.length} canción(es) en 4D: ${KEYS.map((k, j) => `${NAMES[k]} ${fmtV(k, denorm(k, state.star[j]))}`).join(", ")}.`);
    ui.star.attr("opacity", 1);
    placeStar(true);
    await sleep(dur(1300 / state.speed));
    if (my !== state.token) return;

    // 2) cluster de la playlist
    if (state.centroids && pool.some(d => d.cl >= 0)) {
      const c = highlightStarCluster();
      step("cluster");
      say(`Paso 2. Tu centro cae en el cluster ${c + 1} («${clusterName(state.centroids[c])}»). Ahí empieza la búsqueda, pero se revisan las ${fN(pool.length)} canciones.`);
      await sleep(dur(1300 / state.speed));
    }
    if (my !== state.token) return;

    // 3) radio de búsqueda que crece y vecinos que se conectan en orden de distancia
    step("vecinos");
    const exclude = new Set([...state.playlist.map(t => t.id), ...seeds.map(t => t.id)]);
    state.seedIds = exclude;
    const R = ranked(exclude);
    const top = R.slice(0, TOP);
    const maxR2 = d3.max(top, r => Math.hypot(ui.P(r.d.p)[0] - centerP[0], ui.P(r.d.p)[1] - centerP[1]));
    ui.ring.attr("cx", centerP[0]).attr("cy", centerP[1]).attr("r", 0).attr("opacity", 1);
    ui.dots.classed("lab-dim", true).classed("lab-cand", false).classed("lab-pick", false);
    state.recs = [];
    renderList();
    for (let i = 0; i < top.length; i++) {
      if (my !== state.token) return;
      const r = top[i];
      const p = ui.P(r.d.p);
      const r2 = Math.hypot(p[0] - centerP[0], p[1] - centerP[1]);
      ui.ring.transition().duration(dur(380 / state.speed)).attr("r", Math.max(ui.ring.attr("r"), r2 + 8));
      // candidatos cercanos en 4D (los 60 primeros) parpadean
      const cand = new Set(R.slice(0, 6 * (i + 1)).map(q => q.d.id));
      ui.dots.classed("lab-cand", d => cand.has(d.id));
      ui.linkG.append("line").datum(r).attr("class", "lab-link").attr("x1", centerP[0]).attr("y1", centerP[1]).attr("x2", centerP[0]).attr("y2", centerP[1])
        .transition().duration(dur(380 / state.speed)).attr("x2", p[0]).attr("y2", p[1]);
      ui.dots.filter(d => d.id === r.d.id).classed("lab-pick", true).raise();
      state.recs.push(r);
      renderList(true);
      say(`Paso 3. Vecino ${i + 1} de ${TOP}: «${r.d.name}» a distancia 4D ${r.dist.toFixed(3)}.`);
      await sleep(dur(420 / state.speed));
    }
    ui.dots.classed("lab-cand", false);
    ui.ring.transition().duration(dur(600)).attr("opacity", 0.35);
    const fid = d3.format(".0%")(L.explained[0] + L.explained[1]);
    step("listo");
    say(`Listo. Se midieron ${fN(R.length)} distancias. El mapa conserva el ${fid} de la varianza: algún punto que se ve cerca puede estar lejos en 4D y por eso no se elige. Arrastra la estrella para explorar.`);
    state.running = false; setButtons();
  }
  const norm_or_x = t => (t.x ? t.x : norm(t));

  // recomendaciones en tiempo real al arrastrar la estrella
  let raf = null;
  function liveRecs() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      const exclude = state.seedIds || new Set(state.playlist.map(t => t.id));
      state.recs = ranked(exclude).slice(0, TOP);
      const c = ui.P(project(state.star));
      const ids = new Set(state.recs.map(r => r.d.id));
      ui.dots.classed("lab-dim", true).classed("lab-pick", d => ids.has(d.id));
      ui.linkG.selectAll("line.lab-conv").remove();
      ui.linkG.selectAll("line.lab-link").data(state.recs, r => r.d.id).join("line").attr("class", "lab-link")
        .attr("x1", c[0]).attr("y1", c[1]).attr("x2", r => ui.P(r.d.p)[0]).attr("y2", r => ui.P(r.d.p)[1]);
      ui.ring.attr("opacity", 0);
      if (state.centroids && pool.some(d => d.cl >= 0)) highlightStarCluster();
      renderList();
      say(`Explorando. Centro en ${KEYS.map((k, j) => `${NAMES[k]} ${fmtV(k, denorm(k, state.star[j]))}`).join(", ")}`);
    });
  }

  function renderList(appendOnly) {
    const box = d3.select(sideEls.list);
    if (!state.recs.length) { box.html(`<p class="hint">Las recomendaciones aparecerán aquí, en orden de cercanía.</p>`); return; }
    if (!appendOnly) box.html("");
    if (box.select("ol").empty()) box.html("").append("ol").attr("class", "reco-list");
    const maxD = d3.max(state.recs, r => r.dist) || 1;
    const li = box.select("ol").selectAll("li").data(state.recs, r => r.d.id).join(enter => {
      const l = enter.append("li").attr("class", "reco");
      l.append("span").attr("class", "reco-rank");
      l.append("div").attr("class", "reco-main");
      l.append("div").attr("class", "reco-feat");
      l.each(function (r) {
        const s = d3.select(this);
        playButton(s, r.d, () => state.recs.map(q => q.d));
        s.append("button").attr("type", "button").attr("class", "icon").attr("title", "Agregar a mi playlist").text("+")
          .on("click", function () { onAdd(toTrack(r.d)); d3.select(this).text("✓").attr("disabled", true); });
      });
      l.style("opacity", 0).transition().duration(dur(300)).style("opacity", 1);
      return l;
    });
    li.select(".reco-rank").text((r, i) => i + 1);
    li.select(".reco-main").html(r => `<b>${esc(r.d.name)}</b><span>${esc(r.d.artist)}, ${r.d.year}</span><u><em style="width:${(1 - r.dist / (maxD * 1.15)) * 100}%"></em></u><small>distancia ${r.dist.toFixed(3)}</small>`);
    // diferencia por atributo frente al centro (barra divergente)
    li.select(".reco-feat").html(r => KEYS.map((k, j) => {
      const dv = r.d.x[j] - state.star[j];
      const w = Math.min(50, Math.abs(dv) * 100);
      return `<div title="${NAMES[k]}: ${dv >= 0 ? "+" : "−"}${Math.abs(dv).toFixed(2)} frente a tu centro"><span>${NAMES[k].slice(0, 5)}</span><u><em style="${dv >= 0 ? "left:50%" : `left:${50 - w}%`};width:${w}%"></em></u></div>`;
    }).join(""));
  }
  const toTrack = d => ({ id: d.id, name: d.name, artist: d.artist, year: d.year,
    v: { ...Object.fromEntries(KEYS.map((k, j) => [k, denorm(k, d.x[j])])), popularity: d.pop } });

  // ---------------------------------------------------------------------------------------
  function say(t) { ui?.status.html(t); }
  function step(name) {
    d3.select(sideEls.steps).selectAll("li").classed("on", function () { return this.dataset.step === name; })
      .classed("done", function () { return ["kmeans", "centro", "cluster", "vecinos", "listo"].indexOf(this.dataset.step) < ["kmeans", "centro", "cluster", "vecinos", "listo"].indexOf(name); });
  }
  function setButtons() {
    d3.selectAll(`${sideEls.controls} button, ${sideEls.controls} input`).property("disabled", state.running);
    d3.select(sideEls.stop).property("disabled", !state.running);
  }
  function stop() { state.token++; state.running = false; setButtons(); say("Animación detenida."); ui?.dots.classed("lab-cand", false); }

  return {
    render,
    runKmeans, recommend, stop,
    setK: k => { state.k = k; },
    setSpeed: s => { state.speed = s; },
    setPlaylist: list => { state.playlist = list; if (ui) drawPlaylist(); },
  };
}
