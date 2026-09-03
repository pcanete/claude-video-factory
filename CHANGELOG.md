# Changelog

## 1.0.0 — 2026-09-03

- Primera publicación: `video-reference-scanner`.
- Motor de medición: estructura de planos con diagnóstico de falsos negativos,
  movimiento de cámara por correlación de perfiles marginales, transiciones
  clasificadas, luz y color vía `signalstats`, audio con tempo y loudness.
- Banco de calibración sintético (`scripts/calibrar.mjs`), 7/7 casos.
- Verificado contra video real de estructura y ritmo muy distintos entre sí,
  incluido material con más de 50 cortes por minuto y montaje disolvente.
