# Changelog

## shot-builder 1.1.0 — 2026-09-04

Dos mecanismos incorporados desde la auditoría cruzada con la edición Codex del
frente (`github.com/pcanete/video-factory-codex`), adaptados en vez de copiados:

- **Continuidad declarada entre planos** (`continuidad.entra` / `.sale` /
  `.saltos_declarados`). Una diferencia de estado en la misma entidad entre el
  final de un plano y el inicio del siguiente ahora bloquea la validación salvo
  que esté declarada como elipsis con su motivo. Origen:
  `sequence-continuity-builder`. Diferencia deliberada: allá es obligatorio para
  toda entidad visible en cada beat; acá es opcional plano por plano, para no
  duplicar el trabajo de escribir la `SHOT_LIST`.
- **Aprobación de keyframe atada a su contexto** (`contexto_aprobacion`).
  `marcar-keyframe.mjs` registra proveedor/modelo/canal/revisión del pack al
  aprobar; `compilar-higgsfield.mjs --modelo/--canal` avisa si se está
  compilando bajo un contexto que esa aprobación nunca cubrió. Origen:
  `canReuseConsistencyTest` de `consistency-test-builder`. Diferencia
  deliberada: se llevó al campo que ya existía (`estado_keyframe`) en vez de
  agregar un contrato nuevo.

Ambos con cobertura en `self-test.mjs` en los dos sentidos (rechaza lo que debe
rechazar, acepta la decisión declarada) y verificados también contra una
`SHOT_LIST` real, no solo contra el fixture sintético.

## 1.0.0 — 2026-09-03

- Primera publicación: `video-reference-scanner`.
- Motor de medición: estructura de planos con diagnóstico de falsos negativos,
  movimiento de cámara por correlación de perfiles marginales, transiciones
  clasificadas, luz y color vía `signalstats`, audio con tempo y loudness.
- Banco de calibración sintético (`scripts/calibrar.mjs`), 7/7 casos.
- Verificado contra video real de estructura y ritmo muy distintos entre sí,
  incluido material con más de 50 cortes por minuto y montaje disolvente.
