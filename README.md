# Claude Video Factory

**Descifrar un video de referencia y decir con certeza qué de él se puede reproducir con IA generativa.**

Le pasás un video que te gusta —un enlace o un archivo— y obtenés su gramática medida: cómo corta, cómo se mueve la cámara, cómo es la luz, el color, las transiciones y el audio. No una opinión sobre el video: números verificados frame por frame, con la clasificación en criollo y en el término técnico que un modelo de video entiende.

No genera video. No reemplaza a un director. Es la capa de análisis que hace posible dar instrucciones precisas a las herramientas que sí generan.

## Por qué existe

Producir video con IA generativa hoy significa: concepto y guion en un lado, generación de imagen en otro, movimiento y secuenciación en un tercero, edición final en un cuarto. Esas herramientas cambian cada pocos meses. Lo que no cambia es la necesidad de poder mirar una referencia y decir con precisión qué la hace funcionar — y de saber, plano por plano, qué de eso es alcanzable hoy y qué no.

Esa capa de análisis es el activo que no se descarta cuando cambia la herramienta de generación. Por eso se construye primero, y se construye para durar.

## Qué hace `video-reference-scanner`

**El script mide. El agente interpreta.** Ningún umbral está estimado: cada uno salió de calibrar contra un video de respuesta exactamente conocida — un banco sintético generado con ffmpeg que verifica la medición contra la verdad, no contra la intuición. El detalle de qué se calibró, contra qué, y qué falló primero está en [`skills/video-reference-scanner/references/calibracion.md`](skills/video-reference-scanner/references/calibracion.md).

| Eje | Qué mide |
|---|---|
| Estructura | planos, timecodes, duración, con diagnóstico de falsos negativos |
| Cámara | deriva, zoom, temblor, clasificados y con término de prompt listo |
| Transiciones | corte duro, disolvencia, fundido a negro, flash |
| Luz y color | clave, contraste, negros, saturación calibrada, eje cálido/frío |
| Audio | energía, golpes, tempo, loudness, si el montaje sigue el ritmo |
| Replicabilidad | veredicto por plano: generativa hoy / producción real / hoy no se puede |

Tres modos de escaneo (`rapido`, `estandar`, `forense`) según cuánto detalle hace falta.

## Para empezar

Hace falta Node.js 20 o superior y `ffmpeg`/`ffprobe` en el PATH. Para escanear una URL, además `yt-dlp` (vía `python -m yt_dlp` si el ejecutable no quedó en el PATH del sistema).

```bash
node skills/video-reference-scanner/scripts/scan.mjs <url-o-ruta> --out <directorio> --modo estandar
```

Verificar que la calibración de la propia instalación sigue siendo correcta:

```bash
node skills/video-reference-scanner/scripts/calibrar.mjs --dir <carpeta>
```

Debe dar 7/7. El procedimiento completo —qué mirar en la evidencia, cómo sintetizar la gramática, cómo dar el veredicto de replicabilidad— está en [`skills/video-reference-scanner/SKILL.md`](skills/video-reference-scanner/SKILL.md).

## Roadmap

El escáner es la primera pieza. Encaja en un pipeline más largo, todavía no construido:

1. **`video-reference-scanner`** — descifrar una referencia. *Construido.*
2. **`character-pack`** — convertir la identidad de un personaje en un activo versionado y portable entre herramientas, en vez de un ID encerrado en un vendor.
3. **`shot-builder`** — de guion a shot list contractual, compilada al dialecto de la herramienta de generación elegida.
4. **QA de continuidad** — detectar deriva de identidad, vestuario y luz entre planos antes de ensamblar.

Cada pieza nueva se agrega cuando resuelve un problema real, no antes.

## Licencia

MIT. Ver [LICENSE](LICENSE).
