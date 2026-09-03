# Anatomía del prompt por plano

Seis bloques, en este orden, uno por línea. No prosa suelta — el compilador arma el prompt
final concatenando estos bloques, así que si falta uno acá falta en el resultado.

`Sujeto → Acción → Cámara → Luz → Entorno → Estilo`

Mismo principio que ya documentó `video-reference-scanner`: un prompt de 60 palabras
estructurado en bloques rinde más que 200 palabras en prosa. El modelo mapea cada bloque a
lo que tiene que controlar; una descripción corrida lo obliga a adivinar qué palabra es de
qué eje.

## Sujeto

Quién o qué está en el cuadro. Si es el personaje de un `CHARACTER_PACK`, usar el nombre tal
como figura en `personaje.nombre` del pack — no inventar un alias.

## Acción

Qué hace, en presente. Un verbo concreto por plano. "Camina hacia cámara" es accionable;
"está en un momento de reflexión" no lo es — eso es dirección de actor, no un prompt.

## Cámara

**Movimiento primero, intensidad segundo.** "Push-in lento, recorre 20% del cuadro" es
legible; "la cámara se acerca despacio y con calma" no. La tabla de movimientos y sus
términos de prompt está en `video-reference-scanner/references/lenguaje-de-camara.md` — acá
se reusa el mismo vocabulario, no uno nuevo.

Si el plano no tiene que moverse, decirlo explícito: `fija` con nota de que es cámara
fija con acción interna, no ausencia de dirección de cámara.

## Luz

Esquema, no solo "buena luz". Ver el mismo glosario: hora dorada, contraluz, clave alta/baja,
luz difusa.

## Entorno

Locación y momento del día. Si el plano viene de un `SHOT_TEMPLATE` escaneado, esto es lo que
se rellena con el tema nuevo — la estructura del template no trae entorno propio, trae la
función que ese entorno cumple en la pieza.

## Estilo

Look, lente, grano, paleta. Si la pieza deriva de un `VIDEO_DNA` escaneado, este bloque sale
directo de ahí.

## Diálogo

Si el plano lleva diálogo, va **literal, entre comillas, sin parafrasear**. Un diálogo
resumido o aproximado produce labios desincronizados — ya documentado como hallazgo del
research del frente. Ver `references/higgsfield-dialecto.md` sobre qué necesita
específicamente Higgsfield Speak para esto (no es solo texto en el prompt).

## Ejemplo armado

```
Subject: Fixture Persona
Action: camina hacia cámara
Camera: slow dolly in, recorre 20% del cuadro
Light: hora dorada, contraluz
Environment: calle vacía de adoquines, atardecer
Style: cinematográfico, 35mm, grano fino
```

Esto es exactamente lo que `scripts/compilar-higgsfield.mjs` arma a partir de un plano del
`SHOT_LIST` — no hay paso manual entre el contrato y el texto final.
