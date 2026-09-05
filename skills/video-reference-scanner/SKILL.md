---
name: video-reference-scanner
description: >
  Descifra un video de referencia y lo convierte en gramática reusable: desglose de planos
  con timecodes, lenguaje de cámara, luz, paleta, ritmo de corte, relación con el audio y
  estructura narrativa, más un veredicto de qué se puede replicar con IA generativa y qué no.
  Traduce lo que el usuario dice en criollo ("me gusta cómo se acerca de golpe") al término
  técnico que un modelo de video entiende. Usar SIEMPRE que alguien mande un video, un reel o
  un enlace y diga "quiero algo así", "me gusta este", "analizá este video", "cómo está hecho
  esto", o pida entender o replicar una pieza audiovisual. No usar para editar video propio
  (eso es un editor de material propio) ni para analizar carruseles de imágenes.
license: MIT
metadata:
  version: "1.0.0"
---

# Video Reference Scanner — descifrar una referencia audiovisual

Análogo de `reference-scanner` (que escanea sitios web), para video.

Resuelve un problema anterior a producir: **no saber nombrar en términos cinematográficos
lo que uno quiere**. El usuario trae un video que le gusta; el skill devuelve la gramática
de ese video en lenguaje que sirve para dar órdenes a un modelo generativo.

## La regla que ordena todo

**El script mide. El agente interpreta.**

`scripts/scan.mjs` no decide si un plano es "medio" o si la luz es "cálida". Extrae hechos
verificables —timecodes, duraciones, luminancia, color promedio, envolvente de audio— y deja
los frames en disco. La lectura cinematográfica la hace el agente **mirando esos frames**.

Nunca presentar una inferencia como observación. Si el desglose de planos es dudoso, decirlo.

## Qué se produce

| Archivo | Qué es | Quién lo escribe |
|---|---|---|
| `VIDEO_EVIDENCE.json` | lo medido: planos, transiciones, movimiento, luz, color, audio | el script |
| `VIDEO_DNA.json` | la gramática reusable sintetizada | el agente |
| `VIDEO_REPORT.md` | la lectura para humano, en criollo y en técnico | el agente |
| `SHOT_TEMPLATE.json` | la estructura vaciada de contenido, lista para rellenar | el agente |
| `frames/`, `contact.png`, `motion-XXX.png` | la evidencia visual | el script |

`SHOT_TEMPLATE.json` es el enganche con el resto del frente: es lo que después consume el
`shot-builder` para producir una pieza nueva con esa misma gramática.

Los dos contratos que el agente escribe tienen schema: `schemas/video-dna.schema.json` y
`schemas/shot-template.schema.json`. Escribir contra ellos desde el principio, no reacomodar
la salida al final.

## Cómo está armado el motor

`scripts/scan.mjs` orquesta cuatro módulos de medición en `scripts/lib/`, cada uno
responsable de un eje y de nada más:

- `scripts/lib/movimiento.mjs` — deriva, zoom y temblor por correlación de perfiles marginales.
- `scripts/lib/fotografia.mjs` — luz, color y textura vía `signalstats` de ffmpeg.
- `scripts/lib/transiciones.mjs` — corte duro, disolvencia, fundido, flash.
- `scripts/lib/audio.mjs` — energía, golpes, tempo y loudness.

No hace falta entrar a estos archivos para usar el skill; hace falta saber que existen para
tocar uno sin arrastrar a los otros tres.

## Procedimiento

### 1. Correr el motor

```
node scripts/scan.mjs <url-o-ruta> --out <directorio> --modo estandar
```

Acepta URL (baja con `python -m yt_dlp` — se invoca así a propósito: el `.exe` no está en
PATH y en esta máquina el PATH no se toca) o una ruta local, que no copia.

| Modo | Qué mide | Costo |
|---|---|---|
| `rapido` | estructura de planos, luz y color | 1 pasada de decodificación |
| `estandar` (default) | + movimiento de cámara, transiciones, audio | 3 pasadas |
| `forense` | + textura de alta frecuencia (grano) | 4 pasadas |

Referencia: 93s de video en modo forense tarda ~40s.

Opciones: `--umbral` (sensibilidad de corte, default 0.35), `--min-plano` (default 0.5s),
`--ancho` (frames, default 480).

### Qué se mide y qué se infiere

**Medido** (está en el JSON, con su confianza): estructura de planos y duraciones; tipo de
transición; movimiento de cámara (deriva, zoom, temblor, con clasificación y término de
prompt); luz (clave, contraste, negros, altas luces); color (eje cálido/frío, saturación
calibrada); audio (energía, golpes, tempo, loudness, si el montaje va al ritmo); barras
negras.

**Inferido por el agente mirando los frames**: escala de plano, ángulo de cámara, dirección
de la luz, estructura narrativa, y el veredicto de replicabilidad.

Nunca declarar como medido algo de la segunda lista.

### 2. Revisar el diagnóstico antes de creerle al desglose

Dos trampas conocidas, las dos verificadas contra material real:

- **Un solo plano en un video largo** casi nunca es un plano secuencia: es un falso negativo.
  Pasa con placas y material gráfico, donde el cambio global entre cuadros es bajo. El script
  lo avisa y sugiere un umbral. Volver a correr con ese umbral.
- **`cruce_imagen_audio`**: el audio ve estructura que la imagen no ve. Si aparecen
  `limites_que_solo_ve_el_audio`, el desglose visual está incompleto. En la prueba de
  referencia la imagen encontró 3 de 5 cortes reales y los silencios marcaban los 5.
- **`posible_subsegmentacion`**: picos que quedaron apenas debajo del umbral sin corte
  asignado. En montaje rápido de material homogéneo —agua, piel, una sola paleta— un corte
  real puede no llegar nunca al umbral, y la pieza se lee con menos planos y más lentos de
  los que tiene. **No bajar el umbral a ojo:** está calibrado. Ir a mirar esos timecodes con
  el paso 3. Verificado contra una campaña deportiva real donde el aviso marcó tres cortes
  que la detección se había comido, los tres confirmados por frames.

No dar el desglose por cerrado hasta haber mirado esto.

### 3. Mirar la evidencia

- `contact.png` primero: da estructura narrativa, escala de planos, paleta y luz de un vistazo.
- `motion-XXX.png` para cada plano con duración: tres frames en fila. Si el encuadre no se
  mueve, es **cámara fija con acción interna**, no un travelling. Esa distinción cambia el
  prompt entero.
- Frames sueltos en `frames/` cuando haga falta detalle.

**Para leer contenido, no alcanza con un frame por plano.** Vestuario, props, texto en
pantalla, marcas y acción no se leen de la hoja de contacto:

```
node scripts/escanear-contenido.mjs --video <archivo> --evidencia <VIDEO_EVIDENCE.json> --out <directorio>
```

Deja una tira por plano en `contenido/` (2 a 5 frames según duración, a 720px) y declara en
`COBERTURA_CONTENIDO.json` qué se extrajo. **Esta pasada no filtra nada a propósito: primero
se lee todo lo que la técnica permite ver, y recién después se decide qué se mantiene, qué se
cambia y qué se descarta.** Decidir antes de mirar es decidir a ciegas — y en la práctica el
paso denso es el que expone lo que el conteo de planos se comió.

### 3 bis. Leer las mediciones con su confianza

El campo `confianza` del movimiento no es decorativo. Cuando un sujeto llena el cuadro, los
perfiles siguen al sujeto y no a la cámara: ahí la medición baja de confianza y hay que
resolver mirando la tira. Ver `references/calibracion.md`.

### 4. Sintetizar

Seguir `references/sintesis.md`. Ejes obligatorios: ritmo, escala de planos, cámara, luz,
paleta, audio, estructura narrativa.

### 5. Dar el veredicto de replicabilidad

Obligatorio. Ver `references/replicabilidad-generativa.md`. Cada plano va a una de tres
cubetas: replicable con generativa hoy / necesita producción real / hoy no se puede.

Es la parte más valiosa del escaneo, porque es la que el usuario no puede dar solo y la que
evita semanas peleando con una herramienta por algo que no iba a salir.

### 6. Devolver vocabulario, no solo análisis

Cada término técnico que se emita queda anclado a un frame del video del propio usuario.
Ver `references/lenguaje-de-camara.md`. El objetivo es que después alcance con decir
"como el plano 05 de aquella referencia".

## Frontera

Extraer la gramática de una referencia es lo que hace cualquier director. Reproducir plano
por plano una pieza ajena, con su marca y su contenido, no lo es. Este skill extrae **lógica
visual**, no contenido: nunca copiar textos, logos, música ni encuadres específicos de marca.

Misma línea que ya sostienen `reference-scanner` y `analizar-carrusel-referencia`.

## Límites conocidos

- **Sin transcripción.** No hay speech-to-text instalado. El eje audio cubre ritmo, energía,
  silencios y coincidencia de cortes con golpes; no cubre qué se dice. Si el guion importa,
  pedírselo al usuario o resolver la instalación primero.
- **Detección parcial en material gráfico.** Ver el paso 2.
- **El color medido es estadística de píxeles**, no un análisis de grading ni una medición
  de temperatura en kelvin. Sirve sobre todo para comparar planos entre sí dentro de la
  misma pieza; no reemplaza mirar el frame.
- **Movimiento con sujeto dominante**: cuando alguien llena el cuadro, la medición sigue al
  sujeto. Sale con `confianza` baja o media; resolver mirando la tira de tres frames.
- **Tempo sin calibrar**: el BPM puede caer en la mitad o el doble del real. Usar
  `confianza` y `relieve_pico` antes de citarlo.
- **Grano no separado del detalle**: la textura mide alta frecuencia espacial, que mezcla
  grano con follaje, tramas y texto. Es una pista; confirmar mirando un frame al 100%.
- **Paneo y travelling no se distinguen**: ambos desplazan el contenido igual. Hay que mirar
  el paralaje entre fondo y primer plano.

## Calibración

Los umbrales no están estimados: salieron de medir contra respuesta conocida, y los fallos
que los fijaron están registrados en `references/calibracion.md`. El banco se reproduce con
`node scripts/calibrar.mjs --dir <carpeta>` y debe dar 7/7.
