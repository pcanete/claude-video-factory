---
name: shot-builder
description: >
  Convierte un guion, una idea del atlas de un cliente, o un SHOT_TEMPLATE ya escaneado en un
  SHOT_LIST contractual —planos con sujeto, acción, cámara, luz, entorno y estilo reales— y lo
  compila a un paquete listo para pegar en la plataforma de generación elegida (Higgsfield en
  v1). Usar SIEMPRE que se pida producir una pieza de video con IA generativa a partir de un
  guion o de una referencia ya escaneada, con o sin un personaje de un character-pack. No usar
  para escanear una referencia (eso es video-reference-scanner) ni para armar la identidad de
  un personaje (eso es character-pack) ni para ensamblar el video final editado (eso es un
  editor de material propio, fuera de este repositorio).
license: MIT
metadata:
  version: "1.0.0"
---

# Shot Builder — de guion a paquete listo para generar

La tercera pieza del frente. Las otras dos producen contratos; esta los consume:
`video-reference-scanner` produce `SHOT_TEMPLATE.json` (una gramática vaciada de contenido),
`character-pack` produce `CHARACTER_PACK.json` (identidad probada). `shot-builder` toma
ambos —o ninguno, si la pieza no reusa un molde ni lleva un personaje— y arma la instrucción
final.

## El contrato es neutro, el compilador no

`SHOT_LIST.json` (`schemas/shot-list.schema.json`) no sabe qué es Higgsfield. Describe
planos en términos universales: sujeto, acción, cámara, luz, entorno, estilo, cubeta de
replicabilidad. El compilador (`scripts/compilar-higgsfield.mjs`) es la única pieza que habla
el dialecto de un destino específico.

**Agregar un destino nuevo (Veo, Kling) es escribir otro compilador, nunca tocar el
contrato ni el que ya funciona.** Ver `references/higgsfield-dialecto.md` para lo que está
verificado y lo que está inferido sobre cómo le habla el paquete a Higgsfield.

## Procedimiento

### 1. Reunir los insumos

- **Si la pieza reusa un molde escaneado:** partir del `SHOT_TEMPLATE.json` — su estructura
  de planos (función, escala, cámara, luz, cubeta) ya está resuelta; lo que falta es rellenar
  sujeto/acción/entorno/estilo con el tema de esta pieza. Registrar la ruta en
  `derivado_de_template`.
- **Si es un personaje con identidad a sostener:** apuntar `personaje.character_pack` al
  `CHARACTER_PACK.json`. Si no hay personaje, `character_pack: null` con la nota explicando
  por qué — nunca dejarlo en silencio.
- **Si no hay ni molde ni referencia:** escribir los planos desde cero siguiendo
  `references/anatomia-de-prompt.md`.

### 2. Escribir el `SHOT_LIST.json`

Un plano por elemento. Cada uno con los siete bloques del prompt (sujeto, vestuario, acción,
cámara, luz, entorno, estilo), duración, empalme con el siguiente, y **el veredicto de cubeta
ya decidido para el contenido específico de este plano** — no alcanza con heredar la cubeta
del `SHOT_TEMPLATE` sin revisar: el mismo movimiento de cámara puede ser cubeta A con un
paisaje y cubeta C con dos personas tocándose las manos.

Si un plano usa un personaje, `activo_identidad` apunta al archivo exacto del
`CHARACTER_PACK` que ancla ese plano (qué ángulo, qué escala, qué expresión). El validador
rechaza referencias a activos que no están catalogados en el pack, y avisa si el activo es una
expresión todavía sin probar o marcada como que no sostiene identidad.

**Regla verificada con costo real (ver `references/higgsfield-dialecto.md`): si el `entorno`
del plano es distinto al de la foto que declara `activo_identidad`, hace falta generar un
keyframe nuevo de esa escena antes de animarlo — nunca pasar la foto del pack directo a un
modelo de video pidiéndole a la vez identidad y una escena que esa foto no tiene.** Saltear
este paso es lo que rompió 6 de 8 planos en la primera corrida real de este skill.

### 3. Lectura de director — antes de validar, no después

Recorrer `references/lectura-de-director.md` sobre el `SHOT_LIST` recién escrito. No es un
paso opcional para piezas "grandes": es lo que evita que el vestuario, un objeto recurrente o
un peinado se arrastren en silencio de la foto de referencia — exactamente lo que le pasó al
vestuario de Valentina en la primera pieza real, sin que nadie lo hubiera decidido.

Por cada eje de la lista (vestuario, props recurrentes, peinado/estado, entorno/luz
compartido): o hay una decisión explícita escrita en el plano, o hay una pregunta hecha al
usuario antes de seguir. Quien pide la pieza casi nunca tiene el ojo entrenado para notar
estas inconsistencias solo — para eso es este paso.

### 4. Antes de compilar al camino genérico: ¿hay un atajo?

Leer `references/atajos-higgsfield.md`. Un plano de producto no siempre necesita el prompt
genérico de siete bloques — `higgsfield-product-photoshoot` ya tiene vocabulario especializado
para eso (verificado: evita el problema real de forma ambigua de producto que salió en la
primera pieza). Un movimiento de cámara que el texto no describe bien tiene una alternativa
por transferencia de movimiento (`kling3_0_motion_control`), en vez de insistir con más
adjetivos en el prompt.

### 5. Validar antes de compilar

```
node scripts/validate-shot-list.mjs --shot-list <archivo>
```

Bloquea: schema inválido, cubeta C sin alternativa, `activo_identidad` que no existe en el
pack o que el pack marca roto. Avisa sin bloquear: planos más largos que el límite de clip
nativo asumido (`--limite-nativo-s`, default 10), suma de duraciones lejos del objetivo
declarado, diálogo que va a necesitar audio de referencia aparte.

### 6. Compilar

```
node scripts/compilar-higgsfield.mjs --shot-list <archivo> --out <directorio>
```

Produce `00-checklist.md` (resumen de la pieza, cubetas B/C a resolver antes de producir,
wardrobe candidato y límites conocidos heredados del pack, tabla de planos con su columna de
vestuario) y una ficha por plano en `planos/` con el prompt de siete bloques listo para
pegar, más `referencias/` con las imágenes de identidad que hacen falta subir.

### 7. Generar keyframes, revisar consistencia, recién ahí animar

Un campo `estado_keyframe: pendiente` en el JSON no alcanza para revisar nada — hace falta
**verlos**, todos juntos, al lado de la referencia de identidad. Motivo: las herramientas de
generación (Higgsfield, Magnific y en general la dirección de la industria — Google Flow
bloquea primer y último cuadro por escena) resuelven mejor con una foto/cuadro bien elegido
que con un catálogo de identidad entrenado; el punto donde de verdad se juega la consistencia
es acá, no en cuánto material tenga el `CHARACTER_PACK`.

```
node scripts/armar-contact-sheet.mjs --shot-list <archivo> --keyframes-dir <carpeta> --out <contact.png>
```

Arma una grilla: la referencia del pack primero, un tile por plano con su keyframe (o el
activo del pack si todavía no se generó uno propio) y su `estado_keyframe` rotulado encima.
Mostrar esta imagen al usuario — es la revisión de deriva de cara/vestuario/luz entre planos,
de un vistazo.

Con la decisión tomada:

```
node scripts/marcar-keyframe.mjs --shot-list <archivo> --plano <indice> --estado aprobado|rechazado|pendiente [--nota "..."]
```

Actualiza `estado_keyframe` en el `SHOT_LIST` y deja rastro en
`decisiones-keyframe.ndjson`, al lado del `SHOT_LIST` — quién decidió qué y cuándo, no solo
el estado final. Un `rechazado` sin `--nota` avisa: escribir por qué evita repetir el mismo
error al regenerar.

Recién con todos los planos necesarios en `aprobado` tiene sentido compilar a video —
`keyframe_inicial`/`keyframe_final` en cada plano pasan a ser `start_image`/`end_image` en
`compilar-higgsfield.mjs`.

## Verificar que las compuertas funcionan

```
node scripts/self-test.mjs
```

Arma un `CHARACTER_PACK` y un `SHOT_LIST` sintéticos y comprueba que el validador rechace lo
que tiene que rechazar (cubeta C sin alternativa, keyframe rechazado, activo que no existe en
el pack, expresión marcada como que no sostiene identidad, estado inválido en
`marcar-keyframe.mjs`), que el compilador produzca el checklist y las fichas de plano
esperadas, que `marcar-keyframe.mjs` deje rastro en el log de decisiones, y que
`armar-contact-sheet.mjs` arme la grilla incluso con imágenes de origen distinto (el caso real
que rompió el filtro `tile` la primera vez: referencia y keyframes con aspecto distinto). Si
esto no falla cuando debería fallar, las compuertas no están haciendo nada.

## Frontera

Este skill compila instrucciones — el `SHOT_LIST` y el paquete de fichas. No decide qué
molde o qué personaje usar; eso lo trae quien pide la pieza.

Sobre "cómo se genera": el modo `paquete_para_pegar` (pegar en la UI) sigue siendo válido y
es el default declarado en el schema, pero desde que se conectó `@higgsfield/cli` con la
cuenta real (ver `higgsfield-dialecto.md`) también se generó directo por CLI, con el mismo
texto de prompt que arma el compilador. Las dos vías comparten el mismo `SHOT_LIST` y el
mismo prompt de siete bloques — la diferencia es solo si alguien lo pega a mano o si un
script lo pasa como argumento a `higgsfield generate create`.
