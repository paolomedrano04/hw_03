# Sound Lab: Spotify y WHOOP en varias dimensiones

**Curso:** DS5343 Visualización de Datos, UTEC 2026-2
**Tarea 3:** Multidimensional Data Visualization
**Tecnología:** Flask (Python) para los datos y D3 v7 para toda la visualización

Aplicación web que responde cuatro preguntas con RadViz, Star Coordinates, coordenadas paralelas y proyecciones PCA, t-SNE y UMAP. Incluye una playlist personal que se escucha dentro de la app y un laboratorio que muestra en vivo cómo se genera una recomendación.

---

## Contenido

1. [Cómo ejecutar](#1-cómo-ejecutar)
2. [Datos](#2-datos)
3. [Preguntas y hallazgos](#3-preguntas-y-hallazgos)
4. [Laboratorio de recomendación](#4-laboratorio-de-recomendación)
5. [Mi playlist](#5-mi-playlist)
6. [Interacciones](#6-interacciones)
7. [Decisiones de diseño](#7-decisiones-de-diseño)
8. [Cumplimiento de la rúbrica](#8-cumplimiento-de-la-rúbrica)
9. [Orden de la exposición](#9-orden-de-la-exposición)

---

## 1. Cómo ejecutar

```bash
pip install flask
python app.py
```

Luego abrir **http://127.0.0.1:5000** en el navegador.

- Para regenerarlos: `pip install -r requirements.txt` y luego `python preprocess.py`.
- Las visualizaciones funcionan sin internet. El reproductor de música sí necesita conexión.

### Estructura del proyecto

| Carpeta o archivo | Contenido |
|---|---|
| `app.py` | Servidor Flask y rutas de datos, búsqueda y recomendación |
| `preprocess.py` | Limpieza, muestreo, normalización, K-means y proyecciones |
| `data/raw/` | CSV originales de Kaggle |
| `data/processed/` | Archivos JSON que usa el navegador |
| `templates/index.html` | Estructura de la página |
| `static/js/` | Código D3: vistas, playlist, reproductor y laboratorio |
| `static/css/style.css` | Tema visual |

---

## 2. Datos

**Fuentes:** Spotify Dataset 1921–2020 (Kaggle, Yamaç Eren Ay) y WHOOP Fitness Dataset (Kaggle).

| Pregunta | Archivo | Variables | Muestra dibujada |
|---|---|---|---|
| P1 | `data.csv` | tempo, liveness, energy, danceability, popularity | 2 200 canciones, 200 por década |
| P2 | `data_by_artist.csv` | loudness, danceability, liveness, popularity | 1 804 artistas, 450 por banda de popularidad |
| P3 | `data_by_year.csv` | year, liveness, popularity | Los 100 años completos |
| P4 | `whoop_fitness_dataset_100k.csv` | zonas de FC 1 a 5, % FC máxima, strain, duración, recovery | 2 000 sesiones, 250 por actividad |

### Preprocesamiento

- **Limpieza:** se eliminan canciones duplicadas, con tempo 0 y grabaciones habladas (speechiness mayor a 0.66). Quedan 151 363 canciones.
- **Muestreo estratificado:** evita que las décadas recientes, los artistas poco populares o una sola actividad dominen los gráficos.
- **Promedios y correlaciones:** siempre se calculan con el dataset completo. La muestra solo se usa para dibujar sin saturar la pantalla.
- **Normalización:** los atributos que ya van de 0 a 1 conservan su escala. Tempo y loudness se escalan entre sus percentiles 1 y 99.
- **Variables derivadas en WHOOP:** porcentaje del tiempo en cada zona y % de FC máxima, calculado como FC media / (220 − edad).

---

## 3. Preguntas y hallazgos

### P1. ¿Cómo varía la danceability de una canción en relación con su tempo, liveness y energy?

**Task:** comparar la danceability según las variaciones de tempo, liveness y energy para identificar patrones entre estos atributos.

**Vistas:** gráficos de dispersión con curva de promedios, coordenadas paralelas, Star Coordinates y RadViz.

**Hallazgos:**
- El tempo no se correlaciona con la danceability (r = −0.01), pero la relación existe: tiene forma de **U invertida**, con un máximo de 0.60 entre 110 y 120 BPM.
- Energy sigue el mismo patrón, con un máximo de 0.61 entre 0.65 y 0.70.
- Liveness es la única relación negativa (r = −0.12): lo grabado en vivo se baila menos.

### P2. ¿Cómo se relaciona la popularidad de los artistas con loudness, liveness y danceability?

**Task:** identificar y comparar patrones en la popularidad de los artistas según sus niveles de loudness, liveness y danceability.

**Vistas:** proyección PCA, t-SNE y UMAP con K-means, RadViz, perfil por banda de popularidad y coordenadas paralelas.

**Hallazgos:**
- El volumen es lo que más acompaña a la popularidad (r = +0.56), seguido de la danceability (r = +0.38). Liveness va en contra (r = −0.19).
- De los artistas menos populares a los más populares, el volumen medio sube de −14.6 a −5.2 dB y la danceability de 0.47 a 0.74.
- K-means encuentra tres perfiles: **Fuerte y bailable** (popularidad media 47), **Sonido en vivo** (24) y **Suave y tranquilo** (20).
- Parte del efecto es de época: los artistas recientes graban más fuerte y hoy son los más escuchados.

### P3. ¿Cómo han variado el liveness y la popularidad de las canciones a través de los años?

**Task:** comparar la evolución temporal del liveness y la popularidad para identificar períodos en los que ambos presentan cambios o patrones similares.

**Vistas:** series de tiempo con doble eje o puntaje z, correlación móvil con ventana ajustable y dispersión conectada animada.

**Hallazgos:**
- En el siglo completo, las dos series van en sentidos opuestos (r = −0.61).
- La correlación móvil de 10 años revela dos períodos en que se mueven juntas: **1956–1966** y **1991–2000**.

### P4. ¿Cómo se distribuye la intensidad cardíaca de las sesiones según la actividad, y qué música encaja con cada intensidad?

**Task:** comparar las sesiones de entrenamiento por tipo de actividad según sus zonas de frecuencia cardíaca, % de FC máxima y strain, y vincular cada nivel de intensidad con canciones de tempo y energy acordes.

**Vistas:** barras de zonas cardíacas por actividad, RadViz con las cinco zonas como anclas, coordenadas paralelas de sesiones y mapa de música por intensidad.

**Puente entre datasets:** Spotify y WHOOP no comparten personas ni canciones. Se conectan con una **regla de diseño declarada**, no con un dato:

| Intensidad | % de FC máxima | Tempo sugerido | Energy sugerida |
|---|---|---|---|
| Moderada | Menos de 70 % | 90 a 120 BPM | 0.3 a 0.6 |
| Alta | 70 % a 80 % | 120 a 140 BPM | 0.6 a 0.8 |
| Muy alta | Más de 80 % | 140 a 175 BPM | 0.8 o más |

**Hallazgos:**
- HIIT es la actividad más intensa (84 % de FC máxima, 49 % del tiempo en zonas 4 y 5). Walking es la más suave (69 % de FC máxima, 79 % en zonas 1 y 2).
- Solo el 4.2 % del catálogo de canciones sirve para una sesión de intensidad muy alta.
- Los días con recovery bajo se entrena más suave (strain 8.9 frente a 11.1).
- El recovery depende de la HRV (r = +0.33) y de la FC en reposo (r = −0.41), pero casi nada del sueño (r = +0.01). En datos reales esto sería raro, lo que sugiere que **el dataset es sintético**.

---

## 4. Laboratorio de recomendación

Muestra paso a paso cómo se construye una recomendación, sin cajas negras.

| Paso | Qué se ve |
|---|---|
| 1. Espacio 4D | 3 000 canciones populares ubicadas según tempo, liveness, energy y danceability. El mapa usa PCA y conserva el 69 % de la información. |
| 2. K-means en vivo | Las canciones cambian de cluster, los centroides se mueven, los contornos se deforman y la curva de inercia baja hasta converger. |
| 3. Tu centro | Las canciones de tu playlist se unen en una estrella verde, que es su promedio en las cuatro dimensiones. |
| 4. Vecinos | Un radio de búsqueda crece y las 10 canciones más cercanas se conectan una por una, en orden de distancia. |
| 5. Exploración | Al arrastrar la estrella, las recomendaciones se recalculan en tiempo real. |

Cada recomendación muestra qué tan cerca está de tu centro y en qué atributos se diferencia. Se puede escuchar y agregar a la playlist.

---

## 5. Mi playlist

Ubicada en el panel izquierdo de la app.

- **Buscador:** encuentra cualquiera de las 151 mil canciones por título o artista. El dataset llega hasta 2020.
- **Marcado en las vistas:** tus canciones aparecen en verde en la P1, sus artistas en la P2, sus años en la P3 y su intensidad en el mapa de la P4.
- **Comparación:** muestra en qué percentil está tu playlist frente al catálogo, por ejemplo "más bailable que el 67 % de las canciones".
- **Recomendar parecidas:** lleva al Laboratorio y ejecuta la animación de recomendación.
- **Reproducción integrada:** cada botón ▶ reproduce la canción en la barra inferior, con anterior, siguiente y avance automático.
- **Guardado:** la playlist se conserva al recargar la página.

**Sobre el reproductor:** usa el reproductor oficial de Spotify, que solo reproduce audio; todos los gráficos siguen siendo D3. Con sesión de Spotify iniciada en el mismo navegador se escucha la canción completa. Sin sesión, Spotify reproduce una vista previa de unos 30 segundos.

---

## 6. Interacciones

| Vista | Interacción |
|---|---|
| Todas | Tooltip al pasar el cursor, resaltado en todas las vistas y clic para ver el detalle |
| Dispersión (P1) | Selección de rangos arrastrando en horizontal |
| Coordenadas paralelas | Filtro por eje, reordenar ejes, invertir ejes y tres tipos de escala |
| RadViz | Arrastrar anclas, apagarlas con doble clic y añadir el ancla de popularidad |
| Star Coordinates | Arrastrar ejes para cambiar dirección y peso, y opción «Aislar» |
| Proyección (P2) | Transición animada entre PCA, t-SNE y UMAP, y selección por área |
| Series de tiempo (P3) | Filtro por años que también afecta a la P1, cambio de escala y animación de trayectoria |
| Zonas (P4) | Clic en una actividad para filtrar toda la sección |
| Mapa musical (P4) | Clic en un punto para escuchar la canción |
| Laboratorio | K-means animado, recomendación paso a paso y estrella arrastrable |

---

## 7. Decisiones de diseño

- **Una sección por pregunta**, cada una con su dataset, su task y su hallazgo visible en el panel derecho.
- **El color siempre es la variable respuesta:** danceability en la P1 y popularidad en la P2. Así las técnicas multidimensionales muestran cómo se ordena respecto de los demás atributos.
- **Curvas del dataset completo sobre la muestra:** separan la tendencia de la dispersión y revelan relaciones no lineales que la correlación no detecta.
- **Muestreo estratificado:** evita que los grupos pequeños desaparezcan entre los grandes.
- **Puntaje z y correlación móvil en la P3:** ponen ambas series en la misma escala y convierten "períodos similares" en algo medible.
- **Verde reservado para lo seleccionado:** la canción fijada, tu playlist y tu selección nunca se confunden con una escala de datos.
- **Interfaz inspirada en Spotify:** navegación y biblioteca a la izquierda, contenido al centro, detalle a la derecha y reproductor abajo. No usa logos ni marcas de Spotify.

---

## 8. Cumplimiento de la rúbrica

| Requisito | Dónde se cumple |
|---|---|
| RadViz | P1, P2 y P4 |
| Star Coordinates con arrastre de ejes | P1 |
| Coordenadas paralelas con escalado y brushing | P1, P2 y P4 |
| Técnica de proyección | PCA, t-SNE y UMAP en la P2, y PCA en el Laboratorio |
| Al menos tres tareas analíticas | Cuatro preguntas más el Laboratorio |
| Interacción y animación | Todas las secciones |
| Solo D3 para visualizar | Todos los gráficos |
| Aplicación Flask con datos | `app.py` y carpeta `data/` |

---

## 9. Orden de la exposición

**Duración total:** 12 minutos.

**Antes de empezar:**
- Iniciar sesión en Spotify en el mismo navegador.
- Abrir la app con zoom al 90 %.
- Dejar 3 o 4 canciones cargadas en Mi playlist.
- Poner la velocidad del Laboratorio en «Normal».

| # | Bloque | Tiempo | Qué mostrar |
|---|---|---|---|
| 1 | Apertura | 0:30 | Portada y pregunta central: qué hace que una canción se baile, se escuche y sirva para entrenar. Arquitectura: Python calcula, D3 dibuja. |
| 2 | Datos | 1:00 | Limpieza, muestreo estratificado y normalización. Los promedios salen del dataset completo. |
| 3 | P1 Danceability | 2:00 | U invertida del tempo, filtro en coordenadas paralelas, «Aislar Tempo» y ancla de RadViz. |
| 4 | P2 Artistas | 1:30 | Transición de UMAP a PCA, selección del cluster «Sonido en vivo» y ancla de popularidad. |
| 5 | P3 En el tiempo | 1:30 | Puntaje z, períodos sombreados, animación de trayectoria y filtro de años que afecta a la P1. |
| 6 | P4 WHOOP | 2:00 | Clic en HIIT y luego en Yoga, reproducir una canción recomendada, regla de diseño y dataset sintético. |
| 7 | Mi playlist | 1:00 | Buscar una canción en vivo y verla marcada en la P1 y en la P4. |
| 8 | Laboratorio | 2:30 | K-means en vivo, recomendación animada, arrastrar la estrella y reproducir una recomendación. |
| 9 | Cierre | 0:30 | Tres hallazgos, limitaciones y preguntas. |

**Los tres hallazgos del cierre:**
1. La danceability tiene forma de U invertida con el tempo, algo que la correlación no detecta.
2. La popularidad de los artistas refleja en parte la época, no solo el sonido.
3. El dataset de WHOOP parece sintético, y la visualización lo deja en evidencia.
