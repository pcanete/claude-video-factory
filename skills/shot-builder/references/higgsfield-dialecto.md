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

## Inferido (todavía no verificado con una corrida real)

- Video desde imagen: el flujo esperable es generar el keyframe con un modelo de imagen
  (arriba) y pasarlo como referencia a un modelo de video (`kling3_0`, `veo3_1`, etc.) — no
  se corrió todavía un test de imagen-a-video real contra este pipeline.
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
