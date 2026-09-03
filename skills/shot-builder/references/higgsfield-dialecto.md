# Dialecto Higgsfield

Qué es verificado y qué es inferido sobre cómo Higgsfield espera sus instrucciones. No
mezclar los dos niveles al escribirle al usuario.

## Conexión: CLI oficial, no API cruda (verificado, 2026-09-03)

Existe `@higgsfield/cli` (npm, mantenido por Higgsfield), con skills companion instalables
con `npx skills add higgsfield-ai/skills`. Autenticación por OAuth de navegador
(`higgsfield auth login`), factura contra los créditos del plan de la cuenta — no hay clave
de API que administrar por separado. Esto es mejor que integrar la API REST a mano: es
plomería que mantiene el vendor, no este repositorio.

Comandos centrales usados y verificados:
- `higgsfield model list --image|--video` — catálogo de modelos.
- `higgsfield model get <job_type>` — parámetros aceptados, con su schema real (no siempre
  coincide con lo que la web pública sugiere — ver más abajo).
- `higgsfield generate cost <job_type> --prompt "..."` — costo estimado en créditos antes de
  generar.
- `higgsfield generate create <job_type> --prompt "..." --image-references <ruta-local>
  --aspect-ratio <ratio> --wait` — genera; acepta rutas de archivo local, las sube solo.

## Verificado por prueba real, no por documentación (2026-09-03)

**`text2image_soul_v2` (Higgsfield Soul 2.0) tiende a recrear la escena de la foto de
referencia en vez de obedecer un prompt nuevo.** Probado con el mismo prompt y la misma
imagen de referencia contra `nano_banana_flash` (Nano Banana 2): Soul 2.0 devolvió a la
persona en el mismo sofá y el mismo suéter de la foto de referencia, ignorando la escena
pedida (pared rosa, labial en la mano). Nano Banana 2, con el mismo prompt y la misma
referencia, puso a la persona exactamente en la escena nueva, sosteniendo identidad. La
respuesta de la API de Soul 2.0 incluye un campo `enhance_prompt: true` que **no está en
los parámetros documentados del modelo** (`model get` no lo lista, no es controlable por
flag) — así que no hay forma confirmada de desactivarlo para ese modelo.

**Recomendación que sale de esto:** para "personaje real + escena nueva descrita en
prompt", usar `nano_banana_flash` (o la familia Nano Banana en general — coincide con que
el propio kit de LoRA de Valentina ya usa Nano Banana 2 para el finish, por el mismo motivo:
sigue instrucciones cortas y precisas mejor que modelos que reinterpretan la referencia).
Reservar `text2image_soul_v2`/Soul para casos donde se quiere variación sobre la misma
escena de la referencia, no una escena nueva.

Costos reales verificados (créditos, plan básico): `text2image_soul_v2` ≈ 0,12 ·
`nano_banana_flash` ≈ 1,5 · `kling3_0` (video) ≈ 8,75. El plan básico de este workspace
trae 150 créditos.

## Video desde imagen, verificado con una corrida real (2026-09-03)

`kling3_0` acepta `start_image` (ruta local, se sube sola) + `prompt` + `duration` +
`sound` + `aspect_ratio` — exactamente el patrón keyframe-primero. Probado con la foto real
de una expresión del `CHARACTER_PACK` de Valentina como `start_image` y un prompt pidiendo
`slow dolly in` (push-in) más la acción del plano.

**Resultado real: identidad se sostuvo con claridad y el objeto pedido (un lápiz labial)
apareció correctamente en la mano a mitad de plano — pero el movimiento de cámara NO fue el
push-in pedido.** Medido con `video-reference-scanner` sobre el propio resultado: dio
`tilt_arriba`, con una nota de que "el movimiento cambia de dirección durante el plano: no
es un movimiento único" — no un push-in limpio y monótono.

**Implicación para prompts de cámara a Kling 3.0:** nombrar el movimiento
(`slow dolly in`) no garantiza que sea el único movimiento que aparece. Probar, en la
próxima iteración, ser más explícito negando otros ejes ("camera height stays fixed, no
vertical drift, only a slow push in") — todavía no verificado si eso lo corrige, es la
siguiente prueba pendiente, no una conclusión.

Costo real de este test (créditos consumidos según `account status`, no la estimación de
`generate cost`): la cuenta bajó de 150 a 142,13 tras dos imágenes (Soul 2.0 + Nano Banana 2)
y un video de 5s en `kling3_0` — 7,87 créditos en total por los tres, bastante menos que la
suma de las estimaciones individuales.

## `start_image` no es una referencia de identidad — es el primer cuadro literal

Verificado con una corrida real de 9 planos (2026-09-03, ~52 créditos): usar una foto
existente del `CHARACTER_PACK` como `start_image` de `kling3_0`, **mientras el prompt pide
una escena distinta a la de esa foto**, da resultado inconsistente. De 8 planos con este
patrón, 2 obedecieron la escena nueva del prompt y 6 se quedaron con la escena original de
la foto de referencia (mismo sofá, mismo living, misma estantería), ignorando entorno y
estilo pedidos. El único plano que generó una imagen nueva **sin** ninguna foto de
referencia atada (`nano_banana_flash`, solo texto) obedeció el prompt con precisión.

**Causa:** `start_image` funciona como el primer cuadro real del video — "animá desde acá" —
no como un ancla de identidad portable a cualquier escena nueva. Pedirle a la vez "usá esta
cara" y "pero en un lugar totalmente distinto" es una contradicción que el modelo resuelve
de forma no confiable.

**Esto ya estaba escrito en el research del frente** (`29-research-video-generativo-identidad.md`,
Hallazgo 3): el patrón dominante es generar primero la imagen clave con un modelo de imagen,
recién después animar esa imagen. Saltear ese paso — como se hizo en esta corrida, por
apuro — es lo que produjo la falla.

**Regla para `shot-builder` de acá en adelante:** cuando el `entorno` de un plano sea
distinto al de la foto que declara `activo_identidad`, el flujo correcto es en dos pasos:

1. Generar el keyframe de la escena nueva con un modelo de imagen
   (`nano_banana_flash`, `--image-references <activo_identidad>`, prompt con los seis
   bloques completos) — verificado que esto sí respeta identidad y escena nueva a la vez.
2. Usar ESE keyframe resultante como `start_image` del modelo de video, con un prompt que
   describa **solo el movimiento y la acción a agregar**, no la escena entera de nuevo — la
   escena ya está fijada por el keyframe.

Un solo paso (foto original del pack directo a `start_image` de video) alcanza solamente
cuando el plano usa la misma escena que la foto de referencia — recién ahí es seguro saltear
el paso intermedio.

## Inferido (todavía no verificado con una corrida real)

- Los nombres exactos de presets de cámara con los que Cinema Studio (la interfaz web)
  etiqueta sus movimientos no están confirmados — por eso el compilador de este skill sigue
  emitiendo lenguaje natural de cámara (`slow dolly in`, `pan across`) en el bloque de texto
  del prompt, que es el nivel que sí está verificado que el modelo entiende.
- `Speak` (lipsync) no se probó en esta sesión. Documentación previa (SDK REST,
  `github.com/higgsfield-ai/higgsfield-js`) decía que sincroniza labios con un audio dado,
  no genera voz desde texto — pendiente confirmar si la CLI expone lo mismo bajo otro
  `job_type`.

## Qué significa esto para el paquete que arma `compilar-higgsfield.mjs`

El compilador sigue produciendo instrucciones en lenguaje natural, formato paquete_para_pegar
— eso no cambió. Lo que sí cambia con la CLI conectada: en vez de pegar a mano en la interfaz
web, el mismo texto del prompt se puede pasar directo a
`higgsfield generate create nano_banana_flash --prompt "<bloque de seis líneas>"
--image-references <activo_identidad del CHARACTER_PACK>`. El contrato (`SHOT_LIST.json`) no
cambia; lo que cambia es el paso final, que deja de ser manual.
