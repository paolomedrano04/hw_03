
import json
import math
import os
import unicodedata

from flask import Flask, abort, jsonify, render_template, request

BASE = os.path.dirname(os.path.abspath(__file__))
PROCESSED = os.path.join(BASE, "data", "processed")
Q1 = ["tempo", "liveness", "energy", "danceability", "popularity"]
SIM_KEYS = ["tempo", "liveness", "energy", "danceability"]   # espacio de la Pregunta 1

app = Flask(__name__)
_cache = {}


def load(name):
    if name not in _cache:
        path = os.path.join(PROCESSED, f"{name}.json")
        if not os.path.exists(path):
            abort(503, description=f"Falta data/processed/{name}.json. Ejecuta: python preprocess.py")
        with open(path, encoding="utf-8") as fh:
            _cache[name] = json.load(fh)
    return _cache[name]


def fold(s):
    """minúsculas y sin tildes, para buscar 'cancion' y encontrar 'Canción'."""
    s = unicodedata.normalize("NFKD", str(s).lower())
    return "".join(c for c in s if not unicodedata.combining(c))


def catalog():
    if "cat_index" not in _cache:
        rows = load("catalog")
        _cache["cat_index"] = [(fold(r[1]), fold(r[2]), r) for r in rows]
        _cache["cat_by_id"] = {r[0]: r for r in rows}
    return _cache["cat_index"], _cache["cat_by_id"]


def as_track(r):
    return {"id": r[0], "name": r[1], "artist": r[2], "year": r[3],
            "v": dict(zip(Q1, r[4:9]))}


def norm_vec(r, doms):
    out = []
    for i, k in enumerate(Q1):
        if k not in SIM_KEYS:
            continue
        lo, hi = doms[k]
        out.append(min(1.0, max(0.0, (r[4 + i] - lo) / (hi - lo))))
    return out


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/<name>")
def api(name):
    if name not in {"tracks", "artists", "meta", "years", "sessions", "pool"}:
        abort(404)
    return jsonify(load(name))


@app.route("/api/search")
def search():
    q = fold(request.args.get("q", "")).strip()
    if len(q) < 2:
        return jsonify([])
    index_, _ = catalog()
    terms = q.split()
    hits = [r for n, a, r in index_ if all(t in n or t in a for t in terms)]
    # primero coincidencias al inicio del título, luego por popularidad
    hits.sort(key=lambda r: (not fold(r[1]).startswith(terms[0]), -r[8]))
    return jsonify([as_track(r) for r in hits[:25]])


@app.route("/api/similar")
def similar():
    ids = [i for i in request.args.get("ids", "").split(",") if i]
    _, by_id = catalog()
    doms = load("meta")["q1"]["domains"]
    seeds = [by_id[i] for i in ids if i in by_id]
    if not seeds:
        return jsonify([])
    if "cat_vecs" not in _cache:
        _cache["cat_vecs"] = [(norm_vec(r, doms), r) for _, _, r in catalog()[0] if r[8] >= 30]
    vecs = [norm_vec(r, doms) for r in seeds]
    centroid = [sum(c) / len(vecs) for c in zip(*vecs)]
    exclude = set(ids)
    best = []
    for v, r in _cache["cat_vecs"]:            # solo canciones con popularidad ≥ 30
        if r[0] in exclude:
            continue
        dist = math.sqrt(sum((a - b) ** 2 for a, b in zip(v, centroid)))
        best.append((dist, r))
    best.sort(key=lambda t: (t[0], -t[1][8]))
    seen, out = set(), []
    for dist, r in best:
        key = (fold(r[1]), fold(r[2]))
        if key in seen:
            continue
        seen.add(key)
        out.append({**as_track(r), "dist": round(dist, 4)})
        if len(out) == 10:
            break
    return jsonify(out)


@app.route("/api/artist")
def artist():
    name = request.args.get("name", "")
    if "art_index" not in _cache:
        _cache["art_index"] = {fold(r[0]): r for r in load("artist_catalog")}
    r = _cache["art_index"].get(fold(name))
    if not r:
        return jsonify(None)
    meta = load("meta")["q2"]
    doms, mu, sd = meta["domains"], meta["z_mean"], meta["z_scale"]
    feats = ["loudness", "danceability", "liveness"]
    vals = dict(zip(["loudness", "danceability", "liveness", "popularity"], r[2:6]))

    def z(v):
        return [(min(max(v[k], doms[k][0]), doms[k][1]) - mu[i]) / sd[i] for i, k in enumerate(feats)]

    target = z(vals)
    # Ubicación fuera de muestra: t-SNE y UMAP no proyectan puntos nuevos, así que el artista
    # toma la posición de su vecino más cercano de la muestra (en z-scores) y su cluster.
    best, bd = None, float("inf")
    for a in load("artists"):
        d = sum((p - q) ** 2 for p, q in zip(target, z(a["v"])))
        if d < bd:
            best, bd = a, d
    return jsonify({"id": "u-" + fold(r[0]), "name": r[0], "count": r[1], "v": vals,
                    "cl": best["cl"], "p": best["p"], "near": best["name"]})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
