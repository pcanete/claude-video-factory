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

Un plano por elemento. Cada uno con los seis bloques del prompt (sujeto, acción, cámara, luz,
entorno, estilo), duración, empalme con el siguiente, y **el veredicto de cubeta ya decidido
para el contenido específico de este plano** — no alcanza con heredar la cubeta del
`SHOT_TEMPLATE` sin revisar: el mismo movimiento de cámara puede ser cubeta A con un paisaje y
cubeta C con dos personas tocándose las manos.

Si un plano usa un personaje, `activo_identidad` apunta al archivo exacto del
`CHARACTER_PACK` que ancla ese plano (qué ángulo, qué escala, qué expresión). El validador
rechaza referencias a activos que no están catalogados en el pack, y avisa si el activo es una
expresión todavía sin probar o marcada como que no sostiene identidad.

**Regla verificada con costo real (ver `references/higgsfield-dialecto.md`): si el `entorno`
del plano es distinto al de la foto que declara `activo_identidad`, hace falta generar un
keyframe nuevo de esa escena antes de animarlo — nunca pasar la foto del pack directo a un
modelo de video pidiéndole a la vez identidad y una escena que esa foto no tiene.** Saltear
este paso es lo que rompió 6 de 8 planos en la primera corrida real de este skill.

### 3. Validar antes de compilar

```
node scripts/validate-shot-list.mjs --shot-list <archivo>
```

Bloquea: schema inválido, cubeta C sin alternativa, `activo_identidad` que no existe en el
pack o que el pack marca roto. Avisa sin bloquear: planos más largos que el límite de clip
nativo asumido (`--limite-nativo-s`, default 10), suma de duraciones lejos del objetivo
declarado, diálogo que va a necesitar audio de referencia aparte.

### 4. Compilar

```
node scripts/compilar-higgsfield.mjs --shot-list <archivo> --out <directorio>
```

Produce `00-checklist.md` (resumen de la pieza, cubetas B/C a resolver antes de producir,
wardrobe candidato y límites conocidos heredados del pack, tabla de planos) y una ficha por
plano en `planos/` con el prompt de seis bloques listo para pegar, más `referencias/` con las
imágenes de identidad que hacen falta subir.

## Verificar que las compuertas funcionan

```
node scripts/self-test.mjs
```

Arma un `CHARACTER_PACK` y un `SHOT_LIST` sintéticos y comprueba que el validador rechace lo
que tiene que rechazar (cubeta C sin alternativa, referencia a un activo que no existe en el
pack, referencia a una expresión marcada como que no sostiene identidad) y que el compilador
produzca el checklist y las fichas de plano esperadas. Si esto no falla cuando debería fallar,
las compuertas no están haciendo nada.

## Frontera

Este skill compila instrucciones. No genera nada — la generación pasa por la UI de la
plataforma, a mano, en v1. No decide qué molde o qué personaje usar; eso lo trae quien pide
la pieza.
