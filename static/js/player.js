// Reproductor integrado: las canciones se escuchan dentro de la app, en una barra fija
// inferior, usando el reproductor oficial de Spotify (IFrame API). No es una librería de
// visualización: solo reproduce audio; todos los gráficos siguen siendo D3.
//
// Nota: con sesión de Spotify iniciada en el navegador se escucha la canción completa;
// sin sesión, Spotify reproduce una vista previa de ~30 s.
import { esc } from "./store.js";
const d3 = window.d3;

let controller = null;       // controlador de la IFrame API
let apiReady = null;         // promesa que se resuelve con la IFrameAPI (o null si no carga)
let queue = [], idx = -1, pendingPlay = false, lastPos = 0;

function loadApi() {
  if (apiReady) return apiReady;
  apiReady = new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), 6000);   // sin internet o bloqueado a modo simple
    window.onSpotifyIframeApiReady = api => { clearTimeout(timer); resolve(api); };
    const s = document.createElement("script");
    s.src = "https://open.spotify.com/embed/iframe-api/v1";
    s.async = true;
    s.onerror = () => { clearTimeout(timer); resolve(null); };
    document.head.appendChild(s);
  });
  return apiReady;
}

export function initPlayer() { bar(); }

function bar() {
  let b = d3.select("#player");
  if (!b.empty()) return b;
  d3.select("body").classed("has-player", true);
  b = d3.select("body").append("div").attr("id", "player").attr("class", "player open").attr("role", "region").attr("aria-label", "Reproductor");
  b.html(`
    <div class="player-info">
      <span class="player-kicker" id="player-kicker">Nada sonando</span>
      <b id="player-title">Elige una canción</b><span id="player-artist">Toca ▶ en cualquier parte de la app</span>
    </div>
    <div class="player-controls">
      <button type="button" class="pbtn" id="player-prev" aria-label="Anterior" title="Anterior">⏮</button>
      <button type="button" class="pbtn" id="player-next" aria-label="Siguiente" title="Siguiente">⏭</button>
    </div>
    <div class="player-embed"><div id="player-embed"><div class="player-idle"><span class="eq"><i></i><i></i><i></i><i></i></span> Las canciones se reproducen aquí mismo</div></div></div>
    <button type="button" class="pbtn close" id="player-close" aria-label="Pausar" title="Pausar">❚❚</button>`);
  d3.select("#player-prev").on("click", () => step(-1));
  d3.select("#player-next").on("click", () => step(1));
  d3.select("#player-close").on("click", close);
  return b;
}

function show(t) {
  bar().classed("playing", true);
  d3.select("#player-title").text(t.name);
  d3.select("#player-artist").text(t.artist);
  d3.select("#player-kicker").text(queue.length > 1 ? `Reproduciendo ${idx + 1} de ${queue.length}` : "Reproduciendo");
  d3.select("#player-prev").property("disabled", idx <= 0);
  d3.select("#player-next").property("disabled", idx >= queue.length - 1);
}

/** Reproduce una canción dentro de la app. `list` (opcional) es la cola para ⏮ ⏭. */
export async function play(track, list) {
  queue = list && list.length ? list : [track];
  idx = Math.max(0, queue.findIndex(t => t.id === track.id));
  show(track);
  const uri = `spotify:track:${track.id}`;
  const api = await loadApi();

  if (!api) {                                   // modo simple: iframe normal (se pulsa play dentro)
    d3.select("#player-embed").html(`<iframe title="Reproductor de Spotify" src="https://open.spotify.com/embed/track/${encodeURIComponent(track.id)}?utm_source=generator" width="100%" height="80" frameborder="0" allow="autoplay; encrypted-media; clipboard-write" loading="lazy"></iframe>`);
    return;
  }
  if (!controller) {
    await new Promise(resolve => api.createController(document.getElementById("player-embed"),
      { uri, width: "100%", height: 80 }, c => {
        controller = c;
        c.addListener("ready", () => { if (pendingPlay) { pendingPlay = false; c.play(); } });
        c.addListener("playback_update", e => {
          const { isPaused, position, duration } = e.data;
          // al terminar una canción, pasa a la siguiente de la cola
          if (duration > 0 && !isPaused && position >= duration - 800 && lastPos < duration - 800) step(1);
          lastPos = position;
        });
        resolve();
      }));
    pendingPlay = true;
  } else {
    pendingPlay = true;
    lastPos = 0;
    controller.loadUri(uri);
  }
}

function step(k) {
  const j = idx + k;
  if (j < 0 || j >= queue.length) return;
  play(queue[j], queue);
}

function close() {
  controller?.pause?.();
  d3.select("#player").classed("playing", false);
  d3.select("#player-kicker").text("En pausa");
}

/** Botón ▶ reutilizable: reproduce `track` (con `list` como cola) al hacer clic. */
export function playButton(sel, track, list) {
  return sel.append("button").attr("type", "button").attr("class", "icon play")
    .attr("title", `Escuchar «${track.name}» aquí`).attr("aria-label", `Escuchar ${esc(track.name)}`)
    .text("▶").on("click", e => { e.stopPropagation(); play(track, typeof list === "function" ? list() : list); });
}
