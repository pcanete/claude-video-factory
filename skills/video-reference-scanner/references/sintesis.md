# De evidencia a gramática

Cómo pasar de `VIDEO_EVIDENCE.json` + los frames a `VIDEO_DNA.json`, `VIDEO_REPORT.md` y
`SHOT_TEMPLATE.json`.

## Principio

**Separar lo que se repite de lo que pasó una sola vez.**

Un video tiene decisiones estructurales (cómo corta siempre, cómo ilumina siempre, dónde
pone la cámara siempre) y tiene accidentes (este plano concreto, esta locación, esta
persona). La gramática reusable es lo primero. Lo segundo es contenido, y el contenido no
se copia.

Criterio operativo: **si aparece en al menos un tercio de los planos, es gramática. Si
aparece una vez, es accidente.** Un accidente puede seguir siendo interesante, pero se
reporta como accidente, no como regla.

## Los siete ejes

Cubrir los siete. Si alguno no se pudo determinar, decirlo en vez de rellenarlo.

1. **Ritmo** — duración media y mediana, cortes por minuto, si acelera o desacelera, si
   corta sobre el audio. Sale casi entero de `ritmo` y `audio`.
2. **Escala de planos** — la proporción entre abiertos, medios, cerrados e insertos, y en
   qué momento de la pieza aparece cada uno. Se cuenta mirando el contact sheet.
3. **Cámara** — qué proporción es fija y qué proporción tiene movimiento, y qué movimientos.
   Sale de las tiras `motion-XXX.png`. **Es el eje donde más se falla por apuro.**
4. **Luz** — esquema dominante y sus excepciones. Cruzar lo que se ve con `luminancia` y
   `contraste_interno`.
5. **Paleta** — familia de color dominante y contrastes. Cruzar lo que se ve con
   `hex_promedio` y `sesgo_rojo_azul` de todos los planos.
6. **Audio** — música o voz, densidad, silencios estructurales, si el montaje está atado al
   ritmo. Declarar que no hay transcripción.
7. **Estructura narrativa** — cómo abre, cómo desarrolla, cómo cierra. Si es circular, si
   alterna dos mundos, si acumula. Es el eje más interpretativo: sostenerlo nombrando los
   planos concretos que lo evidencian.

## VIDEO_DNA.json

La síntesis ejecutable: las reglas, no la descripción. Cada regla con la evidencia que la
sostiene (qué planos).

Regla de escritura: si una regla no se puede convertir en una instrucción para producir un
plano nuevo, no es una regla, es una observación. Sacarla o reescribirla.

Mal: `"luz": "linda luz natural"`
Bien: `"luz": { "regla": "hora dorada con sol bajo de contraluz en todos los planos con personas; los planos urbanos van en luz difusa de día nublado", "evidencia": [5, 6, 9, 12] }`

## SHOT_TEMPLATE.json

La estructura vaciada de contenido: la secuencia de planos con su función narrativa,
duración, escala, cámara y luz, pero **sin el tema del video original**.

Es lo que después consume el `shot-builder`. Un molde bien hecho se puede rellenar con otro
tema y sigue funcionando; si al vaciarlo no queda nada, es que no había gramática, había
solo contenido — y eso también hay que decirlo.

## VIDEO_REPORT.md

Para humano. Tres secciones:

1. **Qué es este video** — en criollo, en un párrafo. Sin jerga.
2. **Cómo está hecho** — los siete ejes, cada término técnico con su equivalente en criollo
   y anclado a un plano concreto (ver `lenguaje-de-camara.md`).
3. **Qué se puede replicar** — el veredicto por cubetas (ver `replicabilidad-generativa.md`).

Nunca presentar una inferencia como observación. "El plano 07 parece rodado con óptica larga,
por la compresión del fondo" es honesto. "El plano 07 fue rodado con un 135mm" no lo es.
