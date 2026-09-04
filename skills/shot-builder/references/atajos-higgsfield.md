# Atajos de Higgsfield — cuándo no reinventar el camino largo

`compilar-higgsfield.mjs` compila al camino genérico: keyframe con `nano_banana_flash`,
video con `kling3_0` desde ese keyframe. Es el camino correcto cuando el plano es retrato o
escena con personaje y no encaja en nada más específico. Pero Higgsfield ya tiene equipos de
producto que armaron vocabulario y plantillas especializadas para ciertos tipos de plano —
usarlas es más corto y más confiable que reinventar el prompt a mano.

**Verificado el 2026-09-04**, con la CLI conectada y consultada en vivo (`higgsfield model
list`, `higgsfield workflow list`, `higgsfield preset list`, y el skill ya instalado
`higgsfield-product-photoshoot`).

## Cuándo desviarse del camino genérico

### Plano de producto (con o sin persona) → `higgsfield-product-photoshoot`

Si el plano es sobre todo un **producto** —sostenido, aplicado, en primer plano, en una
escena de estilo de vida, en un carrusel de e-commerce— no escribir el prompt a mano.
`higgsfield-product-photoshoot` tiene modos con vocabulario fotográfico propio que el backend
ensambla:

| Modo | Cuándo |
|---|---|
| `product_shot` | producto solo, fondo neutro/estudio/catálogo |
| `lifestyle_scene` | producto en escena real, manos, acción |
| `closeup_product_with_person` | primer plano cerrado con manos/rostro parcial — aplicación de belleza, sostener, demostrar |
| `hero_banner`, `social_carousel`, `ad_creative_pack` | formatos de campaña específicos |
| `virtual_model_tryout` | producto puesto/usado por un modelo |

**Evidencia del motivo:** el plano 8 de la primera pieza real (el labial sostenido contra el
fondo rosa) salió con una forma de producto ambigua — no leía claramente como labial. Es
exactamente el caso `closeup_product_with_person`, y el prompt lo escribimos a mano en vez de
usar el modo que ya existe para esto.

Uso:

```
higgsfield product-photoshoot create --mode closeup_product_with_person --prompt "<intención>" --image <referencia> --enhance-only
```

`--enhance-only` devuelve el prompt final **sin gastar en generación** — revisarlo antes de
sacar el flag, mismo principio de costo que ya rige todo este frente.

### Cámara difícil de describir en palabras → `kling3_0_motion_control`

El movimiento de cámara por texto falló una vez con costo real: pedimos `slow dolly in` y
Kling devolvió `tilt_arriba` (medido con `video-reference-scanner` sobre el propio
resultado — ver `higgsfield-dialecto.md`). `kling3_0_motion_control` no describe el
movimiento en palabras: **transfiere el movimiento de un video de referencia** a la imagen
nueva.

```
higgsfield model get kling3_0_motion_control
```

Requiere exactamente una `image_references` (la escena nueva) y exactamente una
`video_references` (un clip cuyo movimiento de cámara se quiere copiar). Sirve cuando ya hay
un clip —propio o de stock— con el movimiento exacto que se busca, y el texto no alcanza para
describirlo con precisión. No es el default: pedir un video de referencia agrega un paso; se
usa cuando la fidelidad de cámara es crítica para el plano y ya falló por texto una vez.

Esto es lo que la interfaz web vende como "Higgsfield Genjutsu — transferencia de
movimiento". No es un `job_type` separado en la CLI: es la misma transferencia de movimiento,
con otro nombre de marketing en la UI.

### Acción corporal con nombre → presets `animation-action`

```
higgsfield preset list animation-action --query <acción>
```

Catálogo de acciones corporales con nombre (caminar, saltar, gestos de categorías como
Fighting/Punching). Útil cuando el plano necesita una acción física con nombre reconocible,
no una descripción libre. No aplica a retrato estático ni a producto.

### Pieza narrada, sin rostro protagonista → `higgsfield-video-explainer`

Fuera del alcance de piezas con personaje — para explicadores narrados armados en bloques de
10 segundos con voz. Mencionado acá para que quien pida una pieza sin protagonista sepa que
existe un camino dedicado, en vez de forzarla por el camino de `shot-builder`.

## Lo que sigue yendo por el camino genérico

Retrato de personaje en escena nueva, con identidad a sostener desde un `CHARACTER_PACK`:
sigue siendo `nano_banana_flash` (keyframe) → `kling3_0` con `start_image` (animación). Ningún
workflow especializado de Higgsfield resuelve "esta persona específica, en esta escena
específica, con esta acción específica" mejor que el camino que ya está probado con costo
real en `higgsfield-dialecto.md`.

## Cómo decidir, en una frase

Si el plano es fundamentalmente sobre un **producto**, probar `product-photoshoot` primero.
Si la **cámara** es lo crítico y hay un video de referencia con el movimiento exacto, probar
`motion_control`. Si es un **personaje en una escena**, camino genérico. En caso de duda,
`--enhance-only` (imagen) o `generate cost` (video) cuestan cero o casi nada — probar antes
de comprometerse.
