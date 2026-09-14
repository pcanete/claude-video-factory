# Changelog

## character-pack 1.1.0 — 2026-09-14

Consistencia de personaje sin LoRA, con la identidad medida en lugar de juzgada a ojo. Sale de
cinco días de producción real con un personaje sintético (Valentina Muzzo) y de contrastar un
machete externo con esa evidencia: donde se contradijeron, mandó la prueba.

- **Reglas duras** en `SKILL.md`: semilla canónica inmutable, nunca referencia derivada, cambiar ropa
  o escena editando la vista del pack y recomponiendo la cara, no describir la piel en el prompt,
  no usar fotos de prenda con otro cuerpo, ledger, auditar siempre.
- **`scripts/identidad/`** (Python: `opencv-contrib-python`, `mediapipe`, `numpy`; los modelos se
  descargan aparte, ver `SKILL.md`):
  - `auditar.py`: ficha por imagen con identidad SFace contra la vista equivalente, geometría facial
    3D (mandíbula primero), hombros ÷ cara, logo contra el archivo oficial, color y grano. Presenta
    números y un checklist sin tildar; nunca autoaprueba.
  - `calibrar.py`: iguala formato, nitidez, grano y color a la semilla, sin modelos generativos.
  - `recomponer_cara.py`: edición por región sin modelo. Devuelve la cara de la vista del pack a una
    edición, alineada por malla facial.
  - `medir_proporcion.py`, `normalizar_caras.py`, `pack_medir.py`, `ledger.py`.
- **Schema:** bloque opcional `auditoria`.
- **`references/consistencia-sin-lora.md`:** qué se confirmó, qué se corrigió y con qué número.

**Calibración y sus límites, declarados:**
- Los umbrales de `umbrales.json` se calibraron contra fotos reales de la misma sesión de la semilla
  (identidad 0,85-0,96, mandíbula ±2,2%), no contra un banco sintético de respuesta conocida, como pide
  `CONTRIBUTING.md` para el escáner. Son un ejemplo por personaje, no valores universales: cada
  personaje calibra los suyos.
- Recomponer la cara subió la identidad mediana de un look nuevo de 0,898 a 0,924, medida en 13 vistas.
- Geometría, proporción, logo y color solo valen en vistas frontales: en perfil la geometría da desvíos
  del 55-60% sin que haya deriva.
- Las herramientas Python no tienen suite automática en `npm test`, porque necesitan modelos
  descargados. Se verificaron por sintaxis y contra imágenes reales.
- Sobre la invariante "el script mide, el agente interpreta": `auditar.py` solo compara números con
  umbrales que el usuario declara, y no emite juicio sobre la imagen.

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
