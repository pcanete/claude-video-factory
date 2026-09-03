# Dialecto Higgsfield

Qué es verificado y qué es inferido sobre cómo Higgsfield espera sus instrucciones. No
mezclar los dos niveles al escribirle al usuario.

## Verificado (SDK oficial, `github.com/higgsfield-ai/higgsfield-js`)

- Genera imagen con `/v1/text2image/soul`, acepta `custom_reference_id` +
  `custom_reference_strength` para anclar una identidad ya entrenada como Soul ID.
- Genera video desde imagen con `/v1/image2video/dop`: toma `input_images` + `prompt` +
  `motions` (movimientos de cámara, catálogo consultable con `getMotions()` — no cacheado
  acá, consultar en el momento si hace falta el nombre exacto de un preset).
- **`Speak` (`/v1/speak/higgsfield`) sincroniza labios con un audio que se le da
  (`input_audio`, WAV) — no genera voz a partir de texto.** Si una pieza necesita diálogo con
  sincronía de labios, hace falta un audio grabado o generado por TTS aparte, y subirlo como
  referencia. Escribir el diálogo en el prompt de texto no alcanza.
- Se autentica `Key <id>:<secret>`, factura créditos aparte del plan de la interfaz web.

## Inferido de blogs y comparativas (no verificado en código)

- Soul ID entrena con 20-80 fotos y tarda algunos minutos; no hay paso directo de esa
  identidad entrenada a video — son dos pasos separados (entrenar Soul ID, después generarlo
  en Cinema Studio o vía DoP).
- La interfaz de Cinema Studio ofrece presets de cámara con nombre (mencionados: push-in,
  paneo, órbita) pero no hay un catálogo verificado de los nombres exactos que usa la UI —
  por eso el compilador de este skill emite lenguaje natural de cámara (`slow dolly in`,
  `pan across`, etc.) en vez de intentar mapear a un nombre de preset que no está confirmado.

## Qué significa esto para el paquete que arma `compilar-higgsfield.mjs`

El paquete asume **v1 en modo paquete_para_pegar**: instrucciones en lenguaje natural
listas para copiar dentro del campo de prompt de Higgsfield, más la referencia de identidad
para subir a mano. No asume que existe un preset de cámara con nombre exacto — describe el
movimiento en el prompt, que es el nivel que sí está confirmado que Higgsfield entiende
(generación guiada por prompt de texto).

Cuando este frente pase a modo API, el punto de entrada real para imagen es
`/v1/text2image/soul` (con `custom_reference_id` si hay un Soul ID entrenado) y para
video-desde-imagen `/v1/image2video/dop`. Ese compilador todavía no existe — este documento
es la base de la que va a partir cuando se construya.
