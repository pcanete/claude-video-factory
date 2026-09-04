---
name: character-pack
description: >
  Convierte la identidad de un personaje —una persona real con LoRA propio, un Soul ID de
  vendor, o referencias sueltas— en un activo versionado y portable: turnaround de ángulos,
  escalas de plano, rango de expresiones probado (no asumido), wardrobe locks y un manifiesto
  que declara qué mecanismo de identidad sostiene cada pieza y qué límites tiene. Usar SIEMPRE
  que se pida armar, actualizar o auditar el pack de identidad de un personaje para producción
  de video o imagen con IA generativa. No usar para generar contenido final de una pieza (eso
  es shot-builder, cuando exista) ni para entrenar un LoRA desde cero (ese paso es previo y
  específico de cada motor de generación).
license: MIT
metadata:
  version: "1.0.0"
---

# Character Pack — identidad como activo, no como generación suelta

Resuelve un problema concreto: cada vez que se necesita una foto nueva de un personaje se
vuelve a improvisar el prompt, y nadie sabe con certeza qué ángulos, escalas y expresiones ya
están probados y cuáles no. El pack es la respuesta a "¿esto ya lo tenemos, o hay que
generarlo de nuevo?" — y a "¿esto realmente se parece, o solo parece parecerse porque nadie
lo comparó?".

## Principio que ordena todo

**Los modelos de generación van a cambiar cada tres meses. El pack no.**

Todo ID de una plataforma de generación (Soul ID de Higgsfield, un fine-tune atado a un
vendor) se trata como **caché desechable**, nunca como el activo. El activo real es el
propio mecanismo de identidad cuando es portable (un LoRA propio, un dataset de referencia
curado) más el catálogo de qué se probó y qué sostuvo identidad. Si el mecanismo de identidad
NO es portable, el manifiesto lo declara así explícitamente — no se disimula.

## No inventar lo que es decisión de marca

**El wardrobe es una decisión del cliente, no del agente.** Si no hay un canon de vestuario
aprobado, el pack no lo inventa: cataloga los looks que ya se probaron como **candidatos**, y
dice con todas las letras que faltan aprobar. Mismo criterio que ya sostienen
`carousel-builder` y `video-builder` con la capa de marca del cliente.

## Antes de generar nada: catalogar lo que ya existe

Casi ningún personaje real arranca de cero. Buscar en la carpeta del cliente pruebas previas
de ángulos, escenas, o comparativas de realismo antes de gastar en generación nueva. Ver
`references/inventario-antes-de-generar.md`.

## El contrato: `CHARACTER_PACK.json`

Schema en `schemas/character-pack.schema.json`. Seis bloques:

0. **`personaje.naturaleza` + `personaje.titularidad`** — obligatorio, y se declara **antes**
   de producir, no después. `naturaleza` distingue `persona_real` de `sintetico`/`ficticio`;
   si es una persona real, `titularidad` tiene que decir qué consintió y para qué alcance —
   nunca inferir autorización. El validador rechaza un pack de `persona_real` con
   titularidad vacía o "pendiente".
1. **`mecanismo_identidad`** — cómo se sostiene la cara/cuerpo entre generaciones (LoRA propio,
   Soul ID de vendor, referencia suelta, entrenamiento custom), y su portabilidad.
2. **`activos`** — turnaround (mínimo: frontal, tres cuartos ambos lados, perfil, espalda),
   escalas (primer plano, plano medio, cuerpo entero) y expresiones **probadas**, cada una con
   el prompt exacto que la produjo y de dónde salió (existente vs. generada para este pack).
3. **`wardrobe`** — looks candidatos, nunca aprobados por el agente. `estado` distingue
   `candidato` de `aprobado`; solo el cliente cambia un candidato a aprobado.
4. **`variacion_permitida` / `deriva_prohibida`** — opcionales pero recomendados. Separan
   explícitamente "esto puede cambiar entre generaciones sin que sea una falla" (luz, ángulo
   leve) de "esto no puede cambiar nunca" (estructura facial, marcas de identidad). Antes esta
   distinción vivía disuelta en `limites_conocidos`; ahora tiene su propio lugar.
5. **`limites_conocidos`** — huecos de cobertura del dataset o del mecanismo de identidad,
   con su tipo (`entrenamiento`: no se arregla con mejor prompt; `prompting`: sí se puede
   mejorar) y qué se probó para confirmarlo.

Nunca declarar `sostiene_identidad` en una expresión sin haberla generado y mirado. Un hueco
de entrenamiento no se prueba "mejorando el prompt" — eso ya se probó y no funciona; se
registra como límite y punto.

Validar con:

```
node scripts/validate.mjs --pack <archivo>
```

Verificar que las compuertas funcionan (fixture sintético válido pasa, variantes rotas —en
particular persona real sin titularidad confirmada— fallan):

```
node scripts/self-test.mjs
```

## Procedimiento

1. **Inventariar.** `references/inventario-antes-de-generar.md`.
2. **Registrar `naturaleza` y `titularidad` antes de generar nada.** Si es una persona real y
   la titularidad no está confirmada, no seguir — decirlo y preguntar, no asumir.
3. **Declarar el mecanismo de identidad** — de dónde sale la cara, qué tan portable es.
4. **Completar el turnaround y las escalas** que falten, con el motor de generación que ese
   proyecto ya tenga validado (no se reinventa la plomería de generación acá: si el cliente
   ya tiene un pipeline probado —trigger word, pesos por escala, bloque de realismo—, se usa
   tal cual, no se improvisa uno nuevo).
5. **Probar expresiones**, no asumirlas. Generar, mirar, y recién ahí escribir
   `sostiene_identidad: true` o `false`. Un `false` con evidencia vale más que evitar la
   pregunta.
6. **Registrar wardrobe como candidato.** Nunca aprobarlo por cuenta propia.
7. **Escribir `variacion_permitida`/`deriva_prohibida` y `limites_conocidos`** con lo que ya
   se sabía (huecos de entrenamiento) y lo que se descubrió al probar expresiones nuevas.
8. **Costo:** antes de generar un lote, decir el costo total estimado. Cada llamada individual
   de generación de imagen es barata (centavos de dólar); igual se avisa el total antes de
   correr el lote, no después.
9. **Validar** con `scripts/validate.mjs` antes de entregar el pack a `shot-builder`.

## Frontera

Este skill arma el activo de identidad. No decide qué pieza se produce con él —eso es
`shot-builder`— ni entrena el mecanismo de identidad desde cero —eso es previo y específico
del motor elegido (fal.ai, Higgsfield Soul ID, lo que sea).
