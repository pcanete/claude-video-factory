# Veredicto de replicabilidad

El paso obligatorio del escaneo, y el que más valor tiene: decir **qué de este video se puede
hacer hoy con IA generativa y qué no**.

El usuario no puede dar este veredicto solo. Sin él, el escaneo devuelve una lista de deseos
y la producción se transforma en semanas peleando con una herramienta por algo que nunca iba
a salir.

Cada plano va a una de tres cubetas. Sin excepciones y sin cubetas intermedias: la ambigüedad
acá es lo que hace perder tiempo.

---

## Cubeta A — Replicable con generativa hoy

Señales:

- plano de paisaje, arquitectura, ciudad, naturaleza, aéreo
- sin rostro reconocible, o con rostro que no tiene que repetirse en otro plano
- movimiento de cámara simple y continuo: push-in, paneo, órbita lenta, aéreo
- duración menor a ~10 segundos
- sin texto legible en cuadro
- sin manipulación fina de objetos

Se declara con: qué mecanismo de identidad hace falta (ninguno / referencia / pack de
personaje) y qué duración pedir.

---

## Cubeta B — Necesita producción real, o material de archivo

No es que la generativa falle: es que el plano depende de algo que la generativa no puede
saber.

Señales:

- una locación específica y reconocible que tiene que ser *esa*
- un producto real que tiene que verse exactamente como es
- una persona real que no está en el pack de personaje
- texto de marca, logos, packaging legible
- documentación de un hecho que ocurrió

Se declara con: qué habría que filmar o conseguir, y si hay stock que lo resuelva.

---

## Cubeta C — Hoy no se puede

Lo que la generativa de 2026 sigue rompiendo. Marcarlo temprano evita la frustración.

Señales:

- **acción física precisa entre dos personas** (acomodarle la gorra a alguien, pasarse un
  objeto, un apretón de manos que se lee bien)
- **manos manipulando objetos chicos** con continuidad
- **toma continua larga** (más de ~15s sin corte, por encima del largo nativo de los modelos)
- **diálogo largo** con sincronía de labios sostenida y gestualidad creíble
- **continuidad de identidad en ángulos extremos** o con oclusión fuerte del rostro
- **texto legible generado en cuadro** que tiene que decir algo exacto
- **física compleja**: líquidos, telas, multitudes coherentes, animales en acción

Se declara con: la alternativa concreta. Casi siempre hay una —cortar el plano en dos, pasar
a inserto, resolverlo con placa tipográfica, o filmarlo— y proponerla es parte del veredicto.

---

## Cómo se reporta

Por plano, una línea, en el `VIDEO_REPORT.md`:

```
plano 05  17,40 → 24,37  (6,97s)   [C]  dos personas, acción física precisa (acomodar una gorra)
                                        alternativa: cortar en dos planos, el gesto como inserto de manos
```

Y un resumen arriba de todo: cuántos planos en cada cubeta. Si más de un tercio cae en C, la
referencia no es replicable como está, y **hay que decirlo de frente antes de que se empiece
a producir**, proponiendo qué versión sí es alcanzable.

---

## Lo que este veredicto no es

No es una opinión sobre si el video es bueno. No es una evaluación de la idea. Es un
pronóstico técnico, y como todo pronóstico puede fallar: si un plano está en el límite,
decir que está en el límite en vez de forzarlo a una cubeta.
