# Spotify (y WHOOP) en varias dimensiones: DS5343 Tarea 3

Aplicación Flask + D3 v7 que responde tres preguntas sobre el dataset de Spotify 1921–2020 (Kaggle, Yamaç Eren Ay) con RadViz, Star Coordinates, coordenadas paralelas y proyecciones PCA / t-SNE / UMAP.

## Ejecutar

```bash
pip install flask
python app.py            # http://127.0.0.1:5000
```

Los datos ya vienen procesados en `data/processed/`. Para regenerarlos: `pip install -r requirements.txt` y `python preprocess.py`. D3 está incluido en `static/js/`, así que la app funciona sin internet.

## Datos

| Pregunta | Archivo | Variables | Muestra |
|---|---|---|---|
| P1 | `data.csv` | tempo, liveness, energy, danceability, popularity | 2 200 canciones, 200 por década (sin duplicados, sin tempo 0 ni grabaciones habladas con speechiness > 0.66) |
| P2 | `data_by_artist.csv` | loudness, danceability, liveness, popularity | 1 804 artistas con ≥ 5 canciones, 450 por banda de popularidad (las 5 bandas quedan comparables) |
| P3 | `data_by_year.csv` | year, liveness, popularity | los 100 años completos |
| P4 | `whoop_fitness_dataset_100k.csv` | activity_type, zonas FC 1–5, FC media, strain, duración, recovery | 2 000 sesiones, 250 por actividad |

Las curvas de medias, correlaciones y perfiles por banda se calculan con el dataset **completo** (151 mil canciones y 10 417 artistas); la muestra solo se usa para dibujar puntos y líneas sin saturar el SVG. Normalización para RadViz y Star Coordinates: los atributos 0–1 conservan su dominio; tempo y loudness se escalan entre los percentiles 1 y 99.

## Preguntas, tasks y vistas

**P1. ¿Cómo varía la danceability de una canción en relación con su tempo, liveness y energy?**
Task: comparar la danceability según las variaciones de tempo, liveness y energy para identificar patrones.
Vistas: small multiples con curva de medias por intervalo, coordenadas paralelas (danceability al centro), Star Coordinates con preset «Aislar», RadViz. Color: danceability (viridis).
Hallazgo: tempo tiene r ≈ 0, pero la curva muestra una U invertida con pico ~0.60 entre 110 y 120 BPM; energy repite el patrón (pico ~0.61 en 0.65–0.70); liveness es la única relación negativa (r = −0.12). Un coeficiente de Pearson no ve estas relaciones no lineales; la curva sí.

**P2. ¿Cómo se relaciona la popularidad de los artistas con loudness, liveness y danceability?**
Task: identificar y comparar patrones en la popularidad según esos tres atributos.
Vistas: proyección PCA / t-SNE / UMAP de los tres atributos con K-means (k = 3), RadViz con ancla opcional de popularity, perfil por banda de popularidad (dataset completo vs. selección), coordenadas paralelas. Color: popularity (magma) o cluster.
Hallazgo: loudness es el atributo más asociado (r = +0.56), luego danceability (+0.38); liveness va en contra (−0.19). De la banda 0–20 a 81–100, el volumen medio sube de −14.6 a −5.2 dB y la danceability de 0.47 a 0.74. K-means separa «Fuerte y bailable» (pop. media 47), «Sonido en vivo» (24) y «Suave y tranquilo» (20). Parte del efecto del volumen es época: los artistas recientes graban más fuerte y también son los más escuchados hoy.

**P3. ¿Cómo han variado el liveness y la popularidad a través de los años?**
Task: comparar su evolución temporal e identificar períodos con cambios o patrones similares.
Vistas: series de tiempo (doble eje o puntaje z, con suavizado), barra de correlación móvil con ventana ajustable, dispersión conectada animada.
Hallazgo: en el siglo van en sentidos opuestos (r = −0.61), pero la correlación móvil de 10 años marca dos períodos en que se mueven juntas: ~1956–1966 y ~1991–2000 (franjas sombreadas).

**P4. ¿Cómo se distribuye la intensidad cardíaca de las sesiones según la actividad, y qué música encaja con cada intensidad?** (dataset `whoop`, WHOOP Fitness Dataset de Kaggle)
Task: comparar las sesiones de entrenamiento por tipo de actividad según sus zonas de frecuencia cardíaca, % de FC máxima y strain, y vincular cada nivel de intensidad con canciones de tempo y energy acordes.
Datos: `whoop_fitness_dataset_100k.csv` (100 mil días de 286 usuarios, 2023-01 a 2024-02). Se usan las 54 010 sesiones con entrenamiento; muestra de 250 por actividad (2 000). Variables derivadas: % del tiempo en cada zona (zona / suma de zonas) y % de FC máxima = FC media / (220 − edad).
Vistas: barras apiladas de zonas por actividad (dataset completo, clic para filtrar), RadViz con las 5 zonas como anclas, coordenadas paralelas de sesiones y el mapa «Música para la intensidad» (tempo × energy del catálogo de canciones).
Puente con la música: los dos datasets no comparten personas ni canciones, así que se conectan con una **regla de diseño declarada** (no es un dato): intensidad moderada (< 70 % FC máx) a 90–120 BPM y energy 0.3–0.6; alta (70–80 %) a 120–140 BPM y energy 0.6–0.8; muy alta (> 80 %) a 140–175 BPM y energy ≥ 0.8. Al filtrar sesiones, el mapa toma la intensidad que predomina, sugiere canciones del catálogo y clasifica las canciones de «Mi playlist».
Hallazgo: HIIT es la actividad más intensa (84 % de FC máx, 49 % del tiempo en zonas 4–5) y Walking la más suave (69 %, 79 % en zonas 1–2). Solo el 4.2 % del catálogo cumple la regla de intensidad muy alta. Los días en rojo (recovery ≤ 33) se entrena más suave (strain 8.9 frente a 11.1 en verde). El recovery depende de la HRV frente a su línea base (r = +0.33) y de la FC en reposo (r = −0.41), pero casi nada del sueño (r = +0.01) y los niveles de fitness son casi idénticos: en datos reales de WHOOP eso sería raro, lo que sugiere que el dataset es sintético.

## Laboratorio de recomendación (en vivo)

Sección «Laboratorio» del menú. Hace visible cómo se construye una recomendación, sin cajas negras:

1. **Espacio 4D**: 3 000 canciones populares (popularidad ≥ 40) con tempo, liveness, energy y danceability normalizados de 0 a 1. Se dibujan con PCA (69 % de la varianza) y flechas que indican hacia dónde crece cada atributo.
2. **K-means en vivo** (k de 2 a 8, velocidad ajustable): el algoritmo corre en el navegador. En cada iteración las canciones cambian de color, los centroides se desplazan, los contornos (convex hull) se deforman, la curva de inercia baja y los perfiles de cada cluster se actualizan con un nombre automático («Rápidas y enérgicas»…). Se detiene cuando cambia menos del 0,2 % de las canciones.
3. **Recomendación animada**: las canciones de tu playlist convergen a su centro (promedio 4D, la estrella verde), se ilumina su cluster, el radio de búsqueda crece y las 10 canciones más cercanas (distancia euclidiana 4D) se conectan una por una. Cada una muestra su cercanía y en qué atributos se diferencia de tu centro.
4. **Exploración**: la estrella se arrastra; el punto del mapa se lleva de vuelta a 4D (PCA inversa) y las recomendaciones se recalculan en tiempo real. Mayús+clic en cualquier canción la usa como semilla. Clic en cualquier punto: escucharla.

## Interfaz

Tema oscuro inspirado en la app de escritorio de Spotify: navegación y biblioteca a la izquierda, contenido al centro, hallazgo y elemento fijado a la derecha y reproductor fijo abajo. Es una interfaz inspirada, sin logos ni marcas de Spotify.

## Mi playlist (las canciones que quiero escuchar)

Panel derecho de la app. Conecta el análisis con las canciones propias:

- **Buscador** sobre las 151 mil canciones del dataset (título o artista, sin importar tildes). El dataset llega hasta 2020.
- Las canciones agregadas se marcan con **borde verde y su nombre** en todas las vistas de la P1 (dispersión, coordenadas paralelas, Star Coordinates, RadViz). Sus **artistas** aparecen en la P2 y sus **años** como triángulos bajo el eje de la P3.
- **«Ver solo mi playlist»** filtra las vistas a tus canciones y artistas.
- **Mi playlist frente al catálogo**: percentil de cada atributo de tus canciones frente a las 151 mil (por ejemplo, «más bailable que el 67 % de las canciones»).
- **Recomendar parecidas**: las 10 canciones más cercanas al promedio de tu playlist en tempo, energy, liveness y danceability (las mismas variables de la P1), con popularidad ≥ 30.
- **Escuchar dentro de la app**: cada ▶ (playlist, recomendaciones, música para la intensidad, tarjeta de la canción fijada) reproduce la canción en una barra fija inferior, con ⏮ ⏭ para recorrer la lista y paso automático a la siguiente. En el mapa de la P4 también se reproduce haciendo clic en un punto. Usa el reproductor oficial de Spotify (IFrame API), que solo reproduce audio; los gráficos siguen siendo D3. Con sesión de Spotify iniciada en el mismo navegador se escucha la canción completa; sin sesión, Spotify da una vista previa de unos 30 s. Requiere internet.
- La playlist se guarda en el navegador (localStorage), así que sigue ahí al recargar la página.

Artistas que no están en la muestra de la P2: t-SNE y UMAP no pueden proyectar puntos nuevos, así que el artista se ubica en la posición de su vecino más cercano de la muestra (en z-scores de loudness, danceability y liveness) y hereda su cluster. En RadViz, coordenadas paralelas y el perfil por banda se dibuja con sus valores reales.

La búsqueda y las recomendaciones las calcula Flask (`/api/search`, `/api/similar`, `/api/artist`); el dibujo sigue siendo 100 % D3.

## Interacciones

- Todas las vistas: hover con tooltip y resaltado enlazado; clic fija el elemento en la tarjeta lateral.
- Filtros enlazados (AND) dentro de cada pregunta: brush en los small multiples, en la proyección, en cada eje de las coordenadas paralelas; el brush de años de P3 filtra también las canciones de P1.
- Coordenadas paralelas: reordenar ejes arrastrando el título, doble clic para invertir, tres escalas animadas.
- RadViz: arrastrar anclas, doble clic para apagarlas, añadir el ancla de popularidad (P2).
- Star Coordinates: arrastrar ejes (dirección y peso), preset «Aislar» animado.
- Proyección: transición animada entre PCA, t-SNE y UMAP.
- P3: animación «Reproducir trayectoria», escala doble eje ↔ z, suavizado y ventana de correlación.

## Justificación de diseño

- Una sección por pregunta, con su dataset, su task y un hallazgo visible en la barra lateral.
- Color con un propósito por pregunta: la variable respuesta (danceability en P1, popularity en P2) siempre es el color, y las técnicas multidimensionales muestran cómo se ordena respecto de los otros atributos.
- Curvas de medias del dataset completo junto a la muestra: separan la tendencia (robusta) de la dispersión (visible), y muestran relaciones no lineales que la correlación esconde.
- En P2 la muestra está estratificada por banda de popularidad; si no, los artistas populares (pocos) desaparecerían entre los demás.
- En P3 la escala z pone ambas series en la misma unidad; la correlación móvil convierte «períodos similares» en algo medible.
- El magenta se reserva para lo señalado o fijado y para la selección en los perfiles, para que no se confunda con ninguna escala de datos.

## Orden de la exposición (12 minutos)

Antes de empezar: iniciar sesión en Spotify en el mismo navegador, abrir la app con zoom al 90 %, dejar 3 o 4 canciones ya cargadas en Mi playlist y poner la velocidad del laboratorio en «Normal».

1. **Apertura (0:30).** Portada. Pregunta central: qué hace que una canción se baile, se escuche y sirva para entrenar. Dos datasets (Spotify y WHOOP) y una arquitectura simple: Python calcula, D3 dibuja.
2. **Datos y decisiones (1:00).** Limpieza, muestreo estratificado por década, por banda de popularidad y por actividad, y normalización. Aclarar que los promedios siempre salen del dataset completo.
3. **P1 Danceability (2:00).** Curva de tempo: la U invertida que la correlación no ve. Filtrar danceability alta en coordenadas paralelas. «Aislar Tempo» en Star Coordinates. Arrastrar un ancla de RadViz.
4. **P2 Artistas (1:30).** Transición UMAP a PCA. Colorear por cluster y seleccionar «Sonido en vivo»: la línea verde del perfil baja. Añadir el ancla Popularity en RadViz.
5. **P3 En el tiempo (1:30).** Puntaje z, franjas de co-movimiento y cambio de ventana. «Reproducir trayectoria». Arrastrar un rango de años y volver a la P1 para mostrar que también se filtró.
6. **P4 WHOOP (2:00).** Clic en HIIT y luego en Yoga: el mapa musical cambia de intensidad. Reproducir una canción recomendada. Explicar que el puente es una regla de diseño y que el dataset parece sintético.
7. **Mi playlist (1:00).** Buscar una canción en vivo, verla marcada en la P1 y en el mapa de la P4, y mostrar los percentiles.
8. **Laboratorio (2:30).** Agrupar en vivo y explicar la inercia. Recomendar para mi playlist. Arrastrar la estrella y reproducir una recomendación. Es el cierre de mayor impacto.
9. **Cierre (0:30).** Tres hallazgos (U invertida, efecto de época en la popularidad, dataset WHOOP sintético), limitaciones y preguntas.

Criterios de la rúbrica y dónde se muestran: RadViz (P1, P2, P4), Star Coordinates (P1), coordenadas paralelas con escalado y brushing (P1, P2, P4), proyecciones PCA, t-SNE y UMAP (P2 y laboratorio), más de tres tareas (P1 a P4), interacción y animación (todas las secciones).
