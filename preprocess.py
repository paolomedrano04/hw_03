"""
Preprocesamiento — DS5343 Tarea 3 (Spotify 1921-2020, Kaggle / Yamaç Eren Ay).

P1  data.csv            tempo, liveness, energy, danceability, popularity   → tracks.json
P2  data_by_artist.csv  loudness, danceability, liveness, popularity       → artists.json
P3  data_by_year.csv    year, liveness, popularity                         → years.json
P4  whoop_fitness_dataset_100k.csv  sesiones: zonas FC, % FC máx, strain  → sessions.json
Mi playlist: catálogo completo de canciones y artistas para buscar      → catalog.json, artist_catalog.json
Resúmenes (dataset completo) y parámetros                                    → meta.json

Python solo calcula (limpieza, muestreo, normalización, K-means, PCA/t-SNE/UMAP);
toda la visualización se hace con D3 en el navegador.
"""
import ast
import json
import os

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

try:
    import umap
    HAS_UMAP = True
except ImportError:
    HAS_UMAP = False

BASE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(BASE, "data", "raw")
OUT = os.path.join(BASE, "data", "processed")
SEED = 42

TRACKS_PER_DECADE = 200     # P1: muestra estratificada por década
ARTIST_MIN_TRACKS = 5       # P2: artistas con al menos 5 canciones (promedios estables)
ARTISTS_PER_BAND = 450      # P2: muestra estratificada por banda de popularidad

Q1 = ["tempo", "liveness", "energy", "danceability", "popularity"]
Q2 = ["loudness", "danceability", "liveness", "popularity"]
Q2_FEATS = ["loudness", "danceability", "liveness"]          # espacio de proyección/cluster
POP_BANDS = [-1, 20, 40, 60, 80, 100]
POP_LABELS = ["0–20", "21–40", "41–60", "61–80", "81–100"]


def parse_first(s):
    try:
        v = ast.literal_eval(s)
        return v[0] if isinstance(v, list) and v else "Desconocido"
    except (ValueError, SyntaxError):
        return "Desconocido"


def domain(series, key):
    if key in {"liveness", "energy", "danceability"}:
        return [0.0, 1.0]
    if key == "popularity":
        return [0.0, 100.0]
    return [round(float(series.quantile(0.01)), 3), round(float(series.quantile(0.99)), 3)]


def stratified(df, col, n):
    """Muestra estratificada que conserva todas las columnas (compatible con pandas 2 y 3)."""
    parts = [g.sample(min(n, len(g)), random_state=SEED) for _, g in df.groupby(col, observed=False) if len(g)]
    return pd.concat(parts)


def fit01(c):
    c = c - c.mean(axis=0)
    return c / np.abs(c).max()


def binned(df, x, y, edges):
    cut = pd.cut(df[x], edges)
    g = df.groupby(cut, observed=False)[y].agg(["mean", "count"])
    out = []
    for iv, row in g.iterrows():
        if row["count"] >= 30:
            out.append({"x0": float(iv.left), "x1": float(iv.right),
                        "mean": round(float(row["mean"]), 4), "n": int(row["count"])})
    return out


def q1_tracks():
    df = pd.read_csv(os.path.join(RAW, "data.csv"))
    n0 = len(df)
    df["artist"] = df["artists"].apply(parse_first)
    df = df.sort_values("popularity", ascending=False).drop_duplicates(["name", "artist"])
    # canciones con tempo 0 o speechiness > 0.66 son grabaciones habladas (audiolibros):
    # no tiene sentido medir su danceability
    df = df[(df["tempo"] > 0) & (df["speechiness"] <= 0.66)]
    df["decade"] = df["year"] // 10 * 10

    doms = {k: domain(df[k], k) for k in Q1}
    summary = {
        "n_raw": n0, "n_clean": int(len(df)),
        "corr": df[Q1].corr().round(3).loc["danceability"].to_dict(),
        "bins": {
            "tempo": binned(df, "tempo", "danceability", list(range(40, 221, 10))),
            "energy": binned(df, "energy", "danceability", list(np.round(np.arange(0, 1.01, 0.05), 2))),
            "liveness": binned(df, "liveness", "danceability", list(np.round(np.arange(0, 1.01, 0.05), 2))),
            "popularity": binned(df, "popularity", "danceability", list(range(-1, 101, 5))),
        },
    }
    sample = stratified(df, "decade", TRACKS_PER_DECADE)
    tracks = [{
        "id": r["id"], "name": str(r["name"])[:90], "artist": str(r["artist"])[:60],
        "year": int(r["year"]), "v": {k: round(float(r[k]), 4) for k in Q1},
    } for _, r in sample.iterrows()]
    # Mi playlist: percentiles (para "más bailable que el X %") y medias del dataset completo
    summary["percentiles"] = {k: [round(float(v), 4) for v in np.percentile(df[k], np.arange(101))] for k in Q1}
    summary["means"] = {k: round(float(df[k].mean()), 4) for k in Q1}
    # Catálogo completo para el buscador de "Mi playlist" (formato compacto: listas)
    catalog = [[r.id, str(r.name)[:90], str(r.artist)[:60], int(r.year),
                round(float(r.tempo), 2), round(float(r.liveness), 4), round(float(r.energy), 4),
                round(float(r.danceability), 4), int(r.popularity)]
               for r in df.itertuples(index=False)]
    return tracks, doms, summary, catalog


def q2_artists():
    a = pd.read_csv(os.path.join(RAW, "data_by_artist.csv"))
    a = a[a["count"] >= ARTIST_MIN_TRACKS].copy()
    a["band"] = pd.cut(a["popularity"], POP_BANDS, labels=POP_LABELS)
    doms = {k: domain(a[k], k) for k in Q2}
    band_means = (a.groupby("band", observed=False)[Q2_FEATS + ["popularity"]]
                   .agg(["mean", "count"]))
    bands = []
    for b in POP_LABELS:
        bands.append({"band": b, "n": int(band_means.loc[b, ("popularity", "count")]),
                      **{k: round(float(band_means.loc[b, (k, "mean")]), 4) for k in Q2_FEATS}})
    summary = {
        "n_artists": int(len(a)),
        "corr": a[Q2].corr().round(3).loc["popularity"].to_dict(),
        "bands": bands,
        "bins": {
            "loudness": binned(a, "loudness", "popularity", list(range(-30, 1, 2))),
            "danceability": binned(a, "danceability", "popularity", list(np.round(np.arange(0, 1.01, 0.05), 2))),
            "liveness": binned(a, "liveness", "popularity", list(np.round(np.arange(0, 1.01, 0.05), 2))),
        },
    }

    s = stratified(a, "band", ARTISTS_PER_BAND).reset_index(drop=True)
    clipped = np.column_stack([s[k].clip(*doms[k]) for k in Q2_FEATS])
    scaler = StandardScaler().fit(clipped)
    Z = scaler.transform(clipped)

    sil, models = {}, {}
    for k in range(3, 7):
        km = KMeans(n_clusters=k, n_init=10, random_state=SEED).fit(Z)
        sil[k], models[k] = float(silhouette_score(Z, km.labels_)), km
    best = max(sil, key=sil.get)
    lab = models[best].labels_
    # renumerar clusters por popularidad media (0 = el más popular)
    order = s.groupby(lab)["popularity"].mean().sort_values(ascending=False).index.tolist()
    remap = {o: i for i, o in enumerate(order)}
    lab = np.array([remap[l] for l in lab])
    clusters = []
    for c in range(best):
        m = s[lab == c]
        clusters.append({"id": c, "n": int(len(m)),
                         "pop": round(float(m["popularity"].mean()), 1),
                         **{k: round(float(m[k].mean()), 3) for k in Q2_FEATS}})

    pca = PCA().fit(Z)
    proj = {"pca": fit01(pca.transform(Z)[:, :2]),
            "tsne": fit01(TSNE(perplexity=30, init="pca", random_state=SEED).fit_transform(Z))}
    if HAS_UMAP:
        proj["umap"] = fit01(umap.UMAP(n_neighbors=15, min_dist=0.1, random_state=SEED).fit_transform(Z))

    artists = [{
        "id": f"a{i}", "name": str(r["artists"])[:60], "count": int(r["count"]),
        "v": {k: round(float(r[k]), 4) for k in Q2}, "cl": int(lab[i]),
        "p": {m: [round(float(x), 4) for x in c[i]] for m, c in proj.items()},
    } for i, r in s.iterrows()]
    summary.update({"k": best, "silhouette": {str(k): round(v, 3) for k, v in sil.items()},
                    "clusters": clusters, "projections": list(proj),
                    "pca_explained": [round(float(v), 4) for v in pca.explained_variance_ratio_],
                    "pca_loadings": [[round(float(v), 3) for v in row] for row in pca.components_[:2]],
                    # para ubicar artistas de "Mi playlist" que no están en la muestra
                    "z_mean": [round(float(v), 5) for v in scaler.mean_],
                    "z_scale": [round(float(v), 5) for v in scaler.scale_]})
    allart = pd.read_csv(os.path.join(RAW, "data_by_artist.csv"))
    art_catalog = [[str(r.artists)[:60], int(r.count), round(float(r.loudness), 3), round(float(r.danceability), 4),
                    round(float(r.liveness), 4), round(float(r.popularity), 1)]
                   for r in allart.itertuples(index=False)]
    return artists, doms, summary, art_catalog


def q3_years():
    y = pd.read_csv(os.path.join(RAW, "data_by_year.csv"))[["year", "liveness", "popularity"]]
    summary = {"corr": round(float(y["liveness"].corr(y["popularity"])), 3)}
    return y.round(5).to_dict(orient="records"), summary


# ---------------------------------------------------------------------------------
# P4 — WHOOP (sesiones de entrenamiento) + puente con la música
# ---------------------------------------------------------------------------------
SESSIONS_PER_ACTIVITY = 250
ZONES = [f"z{i}" for i in range(1, 6)]
# Regla de diseño (supuesto declarado, no un dato del dataset): intensidad de la sesión
# según % de FC máxima estimada (220 − edad) → rango de tempo y energy de la música.
MUSIC_RULE = [
    {"level": "Moderada", "pmax": [0.0, 0.70], "tempo": [90, 120], "energy": [0.30, 0.60]},
    {"level": "Alta", "pmax": [0.70, 0.80], "tempo": [120, 140], "energy": [0.60, 0.80]},
    {"level": "Muy alta", "pmax": [0.80, 1.01], "tempo": [140, 175], "energy": [0.80, 1.00]},
]


def level_of(p):
    for r in MUSIC_RULE:
        if r["pmax"][0] <= p < r["pmax"][1]:
            return r["level"]
    return MUSIC_RULE[-1]["level"]


def q4_whoop():
    path = os.path.join(RAW, "whoop_fitness_dataset_100k.csv")
    if not os.path.exists(path):
        print("   (sin whoop_fitness_dataset_100k.csv: se omite la P4)")
        return None, None
    d = pd.read_csv(path)
    # a nivel día: recovery frente a HRV/FC en reposo relativas a la línea base
    d["hrv_ratio"] = d["hrv"] / d["hrv_baseline"]
    d["rhr_diff"] = d["resting_heart_rate"] - d["rhr_baseline"]
    rec_band = pd.cut(d["recovery_score"], [0, 33, 66, 100], labels=["Rojo (0–33)", "Amarillo (34–66)", "Verde (67–100)"])
    day = {
        "n_days": int(len(d)), "n_users": int(d["user_id"].nunique()),
        "dates": [d["date"].min(), d["date"].max()],
        "corr_recovery": {
            "hrv_ratio": round(float(d["recovery_score"].corr(d["hrv_ratio"])), 3),
            "rhr_diff": round(float(d["recovery_score"].corr(d["rhr_diff"])), 3),
            "sleep_hours": round(float(d["recovery_score"].corr(d["sleep_hours"])), 3),
            "day_strain": round(float(d["recovery_score"].corr(d["day_strain"])), 3),
        },
        "strain_by_recovery": {str(k): round(float(v), 2) for k, v in
                               d[d["workout_completed"] == 1].groupby(rec_band[d["workout_completed"] == 1], observed=False)["activity_strain"].mean().items()},
    }
    w = d[d["workout_completed"] == 1].copy()
    zc = [f"hr_zone_{i}_min" for i in range(1, 6)]
    tot = w[zc].sum(axis=1).replace(0, np.nan)
    for i, c in enumerate(zc):
        w[ZONES[i]] = w[c] / tot
    w["pmax"] = w["avg_heart_rate"] / (220 - w["age"])
    w["level"] = w["pmax"].apply(level_of)
    w = w.dropna(subset=ZONES)

    acts = []
    for a, g in w.groupby("activity_type"):
        acts.append({"act": a, "n": int(len(g)), "pmax": round(float(g["pmax"].mean()), 3),
                     "avg_hr": round(float(g["avg_heart_rate"].mean()), 1),
                     "strain": round(float(g["activity_strain"].mean()), 2),
                     **{z: round(float(g[z].mean()), 4) for z in ZONES},
                     "levels": {k: int(v) for k, v in g["level"].value_counts().items()}})
    acts.sort(key=lambda r: -r["pmax"])

    s = stratified(w, "activity_type", SESSIONS_PER_ACTIVITY)
    sessions = [{
        "id": f"s{i}", "user": r["user_id"], "date": r["date"], "act": r["activity_type"],
        "fitness": r["fitness_level"], "sport": r["primary_sport"], "age": int(r["age"]),
        "level": r["level"], "tod": r["workout_time_of_day"],
        "v": {"recovery": round(float(r["recovery_score"]), 1), "strain": round(float(r["activity_strain"]), 2),
              "pmax": round(float(r["pmax"]), 4), "avg_hr": round(float(r["avg_heart_rate"]), 1),
              "dur": int(r["activity_duration_min"]), **{z: round(float(r[z]), 4) for z in ZONES}},
    } for i, (_, r) in enumerate(s.iterrows())]

    doms = {"recovery": [0, 100], "strain": [0, 21], "pmax": [0.6, 0.95], "avg_hr": [100, 185],
            "dur": [15, 120], **{z: [0, 0.6] for z in ZONES}}
    return sessions, {"domains": doms, "day": day, "activities": acts, "rule": MUSIC_RULE,
                      "levels": {k: int(v) for k, v in w["level"].value_counts().items()},
                      "n_sessions": int(len(w)), "n_sample": len(sessions), "per_activity": SESSIONS_PER_ACTIVITY}


def music_for_levels(catalog_df):
    """Canciones del catálogo que cumplen la regla de cada nivel (las más populares)."""
    out = {}
    for r in MUSIC_RULE:
        m = catalog_df[(catalog_df["tempo"].between(*r["tempo"])) & (catalog_df["energy"].between(*r["energy"]))]
        top = m.sort_values("popularity", ascending=False).drop_duplicates(["name", "artist"]).head(15)
        out[r["level"]] = {"n": int(len(m)), "share": round(len(m) / len(catalog_df), 4),
                           "top": [{"id": t.id, "name": t.name, "artist": t.artist, "year": int(t.year),
                                    "v": {"tempo": float(t.tempo), "liveness": float(t.liveness), "energy": float(t.energy),
                                          "danceability": float(t.danceability), "popularity": int(t.popularity)}}
                                   for t in top.itertuples()]}
    return out


# ---------------------------------------------------------------------------------
# Laboratorio de recomendación: universo de canciones + PCA 4D → 2D (se aplica en el
# navegador a las canciones de la playlist). K-means y kNN corren EN VIVO en D3/JS.
# ---------------------------------------------------------------------------------
LAB_KEYS = ["tempo", "liveness", "energy", "danceability"]
LAB_POOL = 3000


def lab_pool(catalog_df, doms):
    c = catalog_df[catalog_df["popularity"] >= 40].drop_duplicates(["name", "artist"])
    pool = c.sample(min(LAB_POOL, len(c)), random_state=SEED)
    X = np.column_stack([((pool[k].clip(*doms[k]) - doms[k][0]) / (doms[k][1] - doms[k][0])).values for k in LAB_KEYS])
    pca = PCA(n_components=2).fit(X)
    P = pca.transform(X)
    rows = [[r.id, str(r.name)[:80], str(r.artist)[:50], int(r.year), int(r.popularity),
             *[round(float(v), 4) for v in X[i]], round(float(P[i, 0]), 4), round(float(P[i, 1]), 4)]
            for i, r in enumerate(pool.itertuples())]
    return rows, {"keys": LAB_KEYS, "mean": [round(float(v), 5) for v in pca.mean_],
                  "components": [[round(float(v), 5) for v in row] for row in pca.components_],
                  "explained": [round(float(v), 4) for v in pca.explained_variance_ratio_],
                  "n_pool": len(rows), "min_popularity": 40}


def main():
    os.makedirs(OUT, exist_ok=True)
    print("P1 canciones…")
    tracks, d1, s1, catalog = q1_tracks()
    print(f"   {s1['n_clean']:,} canciones limpias → muestra {len(tracks):,}")
    print("P2 artistas…")
    artists, d2, s2, art_catalog = q2_artists()
    print(f"   {s2['n_artists']:,} artistas con ≥{ARTIST_MIN_TRACKS} canciones → muestra {len(artists):,}; k={s2['k']}")
    print("P3 años…")
    years, s3 = q3_years()
    print("P4 WHOOP…")
    sessions, s4 = q4_whoop()
    cat_df = pd.DataFrame(catalog, columns=["id", "name", "artist", "year", "tempo", "liveness",
                                            "energy", "danceability", "popularity"])
    pool, lab = lab_pool(cat_df, d1)
    print(f"   Laboratorio: {len(pool):,} canciones, PCA {lab['explained']}")
    if s4:
        cat_df = pd.DataFrame(catalog, columns=["id", "name", "artist", "year", "tempo", "liveness",
                                                "energy", "danceability", "popularity"])
        s4["music"] = music_for_levels(cat_df)
        # muestra de canciones para el mapa tempo × energy
        mm = cat_df.sample(2500, random_state=SEED)
        s4["music_sample"] = mm[["id", "name", "artist", "year", "tempo", "energy", "popularity"]].values.tolist()
        print(f"   {s4['n_sessions']:,} sesiones → muestra {len(sessions):,}")

    meta = {
        "source": "Kaggle — Spotify Dataset 1921-2020, 160k+ Tracks (Yamaç Eren Ay)",
        "q1": {"domains": d1, "per_decade": TRACKS_PER_DECADE, "n_sample": len(tracks), **s1},
        "q2": {"domains": d2, "min_tracks": ARTIST_MIN_TRACKS, "per_band": ARTISTS_PER_BAND,
               "n_sample": len(artists), **s2},
        "q3": s3,
        "q4": s4,
        "lab": lab,
    }
    for name, obj in [("tracks", tracks), ("artists", artists), ("years", years), ("meta", meta),
                      ("catalog", catalog), ("artist_catalog", art_catalog), ("sessions", sessions or []), ("pool", pool)]:
        with open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8") as fh:
            json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))
    print("Listo → data/processed/")


if __name__ == "__main__":
    main()
