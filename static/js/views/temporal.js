// P3: series de tiempo de liveness y popularidad + correlación móvil + dispersión conectada.
import { dur, fmtV, showTip, hideTip, SCALES } from "../store.js";
const d3 = window.d3;
const C = { liveness: "#509BF5", popularity: "#1ED760" };

export function timeseries(el, store, { corrEl, controls }) {
  const cfg = { mode: "dual", smooth: 1, win: 10 };
  let myTracks = [];
  let brushRange = null;

  const smoothed = (k, n) => store.items.map((d, i) => {
    const a = Math.max(0, i - Math.floor(n / 2)), b = Math.min(store.items.length, i + Math.ceil(n / 2));
    return d3.mean(store.items.slice(a, b), e => e.v[k]);
  });
  function rollingCorr(win) {
    const L = store.items.map(d => d.v.liveness), P = store.items.map(d => d.v.popularity);
    return store.items.map((d, i) => {
      if (i < win - 1) return { year: d.year, r: null };
      const l = L.slice(i - win + 1, i + 1), p = P.slice(i - win + 1, i + 1);
      const ml = d3.mean(l), mp = d3.mean(p);
      let s = 0, sl = 0, sp = 0;
      for (let j = 0; j < win; j++) { s += (l[j] - ml) * (p[j] - mp); sl += (l[j] - ml) ** 2; sp += (p[j] - mp) ** 2; }
      return { year: d.year, c: d.year - (win - 1) / 2, r: s / Math.sqrt(sl * sp) };
    });
  }

  function render() {
    const root = d3.select(el);
    root.selectAll("*").remove();
    const W = el.clientWidth, H = 300;
    const m = { t: 16, r: 56, b: 28, l: 52 }, w = W - m.l - m.r, h = H - m.t - m.b;
    const svg = root.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    const x = d3.scaleLinear().domain(d3.extent(store.items, d => d.year)).range([0, w]);
    const gx = g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`);
    gx.call(d3.axisBottom(x).ticks(10).tickFormat(d3.format("d")));
    const gyL = g.append("g").attr("class", "axis");
    const gyR = g.append("g").attr("class", "axis").attr("transform", `translate(${w},0)`);
    const tL = g.append("text").attr("class", "axis-title").style("cursor", "default").attr("x", -40).attr("y", -4);
    const tR = g.append("text").attr("class", "axis-title").style("cursor", "default").attr("x", w + 40).attr("y", -4).attr("text-anchor", "end");

    // bandas de co-movimiento (correlación móvil ≥ 0.5)
    const comove = g.append("g");
    const brushG = g.append("g").attr("class", "brush");
    const paths = { liveness: g.append("path").attr("class", "ts-line").attr("stroke", C.liveness),
      popularity: g.append("path").attr("class", "ts-line").attr("stroke", C.popularity) };
    const cross = g.append("g").style("pointer-events", "none");
    const pinG = g.append("g").style("pointer-events", "none");

    let yL, yR, series;
    function draw(animate) {
      const t = svg.transition().duration(dur(animate ? 800 : 0));
      series = { liveness: smoothed("liveness", cfg.smooth), popularity: smoothed("popularity", cfg.smooth) };
      if (cfg.mode === "dual") {
        yL = d3.scaleLinear().domain(d3.extent(series.liveness)).nice().range([h, 0]);
        yR = d3.scaleLinear().domain([0, d3.max(series.popularity)]).nice().range([h, 0]);
        gyL.transition(t).call(d3.axisLeft(yL).ticks(6).tickFormat(d3.format(".2f")));
        gyR.transition(t).attr("opacity", 1).call(d3.axisRight(yR).ticks(6));
        tL.text("Liveness").attr("fill", C.liveness); tR.text("Popularity").attr("fill", C.popularity);
      } else {
        const z = k => { const mu = d3.mean(series[k]), sd = d3.deviation(series[k]); series[k] = series[k].map(v => (v - mu) / sd); };
        z("liveness"); z("popularity");
        yL = yR = d3.scaleLinear().domain(d3.extent([...series.liveness, ...series.popularity])).nice().range([h, 0]);
        gyL.transition(t).call(d3.axisLeft(yL).ticks(6).tickFormat(v => (v === 0 ? "0" : d3.format("+.1f")(v))));
        gyR.transition(t).attr("opacity", 0);
        tL.text("Puntaje z (ambas series)").attr("fill", "var(--ink)"); tR.text("");
      }
      const line = (k, ys) => d3.line().x((d, i) => x(store.items[i].year)).y(v => ys(v))(series[k]);
      paths.liveness.transition(t).attr("d", line("liveness", yL));
      paths.popularity.transition(t).attr("d", line("popularity", yR));

      const rc = rollingCorr(cfg.win);
      const runs = [];
      let cur = null;
      rc.forEach(d => {
        if (d.r != null && d.r >= 0.5) { if (!cur) { cur = { a: d.year - cfg.win + 1, b: d.year }; runs.push(cur); } else cur.b = d.year; }
        else cur = null;
      });
      comove.selectAll("rect").data(runs).join("rect").attr("class", "comove")
        .attr("x", d => x(d.a)).attr("width", d => Math.max(2, x(d.b) - x(d.a))).attr("y", 0).attr("height", h)
        .on("mousemove", (e, d) => showTip(e, `<b>${d.a}–${d.b}</b><br>Liveness y popularidad se mueven juntas (r móvil ≥ 0.5)`))
        .on("mouseleave", hideTip);
      drawCorr(rc);
      markPin(store.pinned);
    }

    const brush = d3.brushX().extent([[0, 0], [w, h]])
      .on("brush end", ({ selection, type }) => {
        if (!selection) { brushRange = null; store.setFilter("ts", null); return; }
        const [a, b] = selection.map(v => Math.round(x.invert(v)));
        brushRange = [a, b];
        store.setFilter("ts", d => d.year >= a && d.year <= b);
      });
    brushG.call(brush);
    brushG.select(".overlay")
      .on("mousemove.hover", e => {
        const yr = Math.round(x.invert(d3.pointer(e, g.node())[0]));
        const d = store.items.find(d => d.year === yr);
        if (d) { store.hover(d); showTip(e, tipYear(d)); }
      })
      .on("mouseleave.hover", () => { store.hover(null); hideTip(); })
      .on("click.pin", e => {
        const yr = Math.round(x.invert(d3.pointer(e, g.node())[0]));
        const d = store.items.find(d => d.year === yr);
        if (d && !brushRange) store.pin(d);
      });

    function crossAt(sel, d, cls) {
      sel.selectAll("*").remove();
      if (!d) return;
      const i = store.items.indexOf(d);
      sel.append("line").attr("class", cls).attr("x1", x(d.year)).attr("x2", x(d.year)).attr("y1", 0).attr("y2", h);
      sel.append("circle").attr("class", "ts-dot").attr("fill", C.liveness).attr("cx", x(d.year)).attr("cy", yL(series.liveness[i])).attr("r", 4.5);
      sel.append("circle").attr("class", "ts-dot").attr("fill", C.popularity).attr("cx", x(d.year)).attr("cy", yR(series.popularity[i])).attr("r", 4.5);
    }
    const markPin = d => crossAt(pinG, d, "year-mark pinned");

    // ---- correlación móvil -----------------------------------------------------------
    const croot = d3.select(corrEl);
    croot.selectAll("*").remove();
    const CH = 120, cm = { t: 18, b: 22 };
    const csvg = croot.append("svg").attr("viewBox", `0 0 ${W} ${CH}`);
    const cg = csvg.append("g").attr("transform", `translate(${m.l},${cm.t})`);
    const ch = CH - cm.t - cm.b;
    const cy = d3.scaleLinear().domain([-1, 1]).range([ch, 0]);
    cg.append("g").attr("class", "axis").call(d3.axisLeft(cy).tickValues([-1, 0, 1]).tickFormat(v => (v === 0 ? "0" : d3.format("+d")(v))));
    cg.append("line").attr("x1", 0).attr("x2", w).attr("y1", cy(0)).attr("y2", cy(0)).attr("stroke", "var(--rule)");
    const ctitle = cg.append("text").attr("class", "caption").attr("x", 0).attr("y", -6);
    const bw = w / store.items.length;
    const cc = d3.scaleDiverging(t => d3.interpolateRdBu(1 - t)).domain([-1, 0, 1]);
    function drawCorr(rc) {
      ctitle.text(`Correlación móvil liveness × popularidad (ventana de ${cfg.win} años; cada barra se ubica en el centro de su ventana)`);
      cg.selectAll("rect.rc").data(rc.filter(d => d.r != null), d => d.year).join("rect").attr("class", "rc")
        .attr("x", d => x(d.c) - bw / 2 + 0.5).attr("width", Math.max(1, bw - 1))
        .on("mousemove", (e, d) => showTip(e, `<b>${d.year - cfg.win + 1}–${d.year}</b><br>r = ${d3.format("+.2f")(d.r)}`))
        .on("mouseleave", hideTip)
        .transition().duration(dur(500))
        .attr("y", d => Math.min(cy(0), cy(d.r))).attr("height", d => Math.abs(cy(d.r) - cy(0))).attr("fill", d => cc(d.r));
    }

    draw(false);
    d3.select(controls.mode).selectAll("button").attr("aria-pressed", function () { return String(this.dataset.v === cfg.mode); })
      .on("click", function () { cfg.mode = this.dataset.v; d3.select(controls.mode).selectAll("button").attr("aria-pressed", function () { return String(this.dataset.v === cfg.mode); }); draw(true); });
    d3.select(controls.smooth).property("value", cfg.smooth).on("change", function () { cfg.smooth = +this.value; draw(true); });
    d3.select(controls.win).property("value", cfg.win).on("change", function () { cfg.win = +this.value; draw(true); });

    const ns = `.ts${el.id}`;
    store.bus.on(`hover${ns}`, d => crossAt(cross, d, "year-mark")).on(`pin${ns}`, markPin)
      .on(`clear${ns}`, () => brushG.call(brush.move, null));
    api.brushTo = r => brushG.call(brush.move, r ? r.map(x) : null);

    // Años de las canciones de "Mi playlist": marcas bajo el eje
    const mineG = g.append("g").attr("transform", `translate(0,${h})`);
    api.markYears = tracks => {
      myTracks = tracks;
      const byYear = d3.groups(tracks, d => d.year);
      mineG.selectAll("path").data(byYear, d => d[0]).join("path").attr("class", "mine-year")
        .attr("d", d3.symbol(d3.symbolTriangle, 70)())
        .attr("transform", ([yr]) => `translate(${x(yr)},-6)`)
        .on("mousemove", (e, [yr, ts]) => showTip(e, `<b>${yr} en tu playlist</b><br>${ts.map(t => `${t.name} (${t.artist})`).join("<br>")}`))
        .on("mouseleave", hideTip);
    };
    api.markYears(myTracks);
  }
  const api = { render };
  return api;
}

export const tipYear = d => `<b>${d.year}</b><br>Liveness: ${fmtV("liveness", d.v.liveness)}<br>Popularity: ${fmtV("popularity", d.v.popularity)}`;

// Dispersión conectada: cada punto es un año; la trayectoria muestra la evolución conjunta.
export function connected(el, store, { playBtn }) {
  let timer = null;
  function render() {
    const root = d3.select(el);
    root.selectAll("*").remove();
    const W = el.clientWidth, H = 420;
    const m = { t: 16, r: 18, b: 40, l: 52 }, w = W - m.l - m.r, h = H - m.t - m.b;
    const svg = root.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    const x = d3.scaleLinear().domain(d3.extent(store.items, d => d.v.liveness)).nice().range([0, w]);
    const y = d3.scaleLinear().domain([0, d3.max(store.items, d => d.v.popularity)]).nice().range([h, 0]);
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(6).tickFormat(d3.format(".2f")));
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6));
    g.append("text").attr("class", "axis-title").style("cursor", "default").attr("x", w).attr("y", h + 34).attr("text-anchor", "end").text("Liveness promedio");
    g.append("text").attr("class", "axis-title").style("cursor", "default").attr("x", 4).attr("y", 2).text("Popularity promedio");

    const segs = d3.pairs(store.items);
    const segSel = g.append("g").selectAll("line").data(segs).join("line").attr("class", "cs-seg")
      .attr("x1", ([a]) => x(a.v.liveness)).attr("y1", ([a]) => y(a.v.popularity))
      .attr("x2", ([, b]) => x(b.v.liveness)).attr("y2", ([, b]) => y(b.v.popularity))
      .attr("stroke", ([a]) => SCALES.year(a.year));
    const dots = g.append("g").selectAll("circle").data(store.items).join("circle").attr("class", "dot")
      .attr("r", 4).attr("cx", d => x(d.v.liveness)).attr("cy", d => y(d.v.popularity)).attr("fill", d => SCALES.year(d.year))
      .on("mouseenter", (e, d) => { store.hover(d); showTip(e, tipYear(d)); })
      .on("mousemove", (e, d) => showTip(e, tipYear(d)))
      .on("mouseleave", () => { store.hover(null); hideTip(); })
      .on("click", (e, d) => store.pin(d));
    g.append("g").selectAll("text").data(store.items.filter(d => d.year % 20 === 0 || d.year === 1921 || d.year === 2020)).join("text")
      .attr("class", "cs-label").attr("x", d => x(d.v.liveness) + 7).attr("y", d => y(d.v.popularity) - 6).text(d => d.year);
    const big = g.append("text").attr("class", "cs-year").attr("x", w).attr("y", h - 10).attr("text-anchor", "end");
    const overlay = g.append("g");
    const ring = (cls, d) => { overlay.selectAll(`.${cls}`).remove(); if (d) overlay.append("circle").attr("class", `ring ${cls}`).attr("r", 8).attr("cx", x(d.v.liveness)).attr("cy", y(d.v.popularity)); };

    const paint = () => {
      dots.classed("off", d => !d._a);
      segSel.classed("off", ([a, b]) => !(a._a && b._a));
    };
    paint();
    const ns = `.cs${el.id}`;
    store.bus.on(`filter${ns}`, paint).on(`hover${ns}`, d => ring("hov", d)).on(`pin${ns}`, d => ring("pinned", d));

    // Animación: la trayectoria se dibuja año a año
    d3.select(playBtn).on("click", function () {
      const btn = d3.select(this);
      if (timer) { timer.stop(); timer = null; btn.attr("aria-pressed", "false").text("Reproducir trayectoria"); segSel.attr("opacity", 1); dots.attr("opacity", 1); big.text(""); return; }
      btn.attr("aria-pressed", "true").text("Detener");
      segSel.attr("opacity", 0); dots.attr("opacity", 0);
      let i = 0;
      timer = d3.interval(() => {
        const d = store.items[i];
        dots.filter(e => e === d).attr("opacity", 1).attr("r", 8).transition().duration(dur(400)).attr("r", 4);
        segSel.filter(([a]) => a === store.items[i - 1]).attr("opacity", 1);
        big.text(d.year);
        store.hover(d);
        i++;
        if (i >= store.items.length) { timer.stop(); timer = null; btn.attr("aria-pressed", "false").text("Reproducir trayectoria"); store.hover(null); }
      }, 90);
    });
  }
  return { render };
}
