# Calibración

Todo umbral de este escáner salió de medir contra algo de respuesta conocida, no
de estimar. Este archivo registra qué se midió, contra qué, y qué falló primero —
porque los fallos son lo que fija los umbrales.

Para reproducir la parte automatizable: `node scripts/calibrar.mjs --dir <carpeta>`.
Debe dar 7/7. Si baja, algo se rompió.

---

## Movimiento de cámara

### Banco sintético

`scripts/calibrar.mjs` genera con ffmpeg siete videos de movimiento exacto conocido
(paneo 37,5% del ancho, paneo lento 6,25%, tilt 27,8%, push-in 1,0→1,4,
pull-out 1,4→1,0, estático, handheld) y verifica que la medición los recupere.

### Cuatro fallos que fijaron el diseño

**1. Acumular cuadro a cuadro pierde el movimiento lento.**
El primer método sumaba desplazamientos entre cuadros consecutivos. Un movimiento
de menos de 1 px por cuadro redondea a cero en cada paso y el acumulado da cero:
un plano de dron real dio recorrido 0. Corregido midiendo entre los **extremos**
del plano. Los movimientos cinematográficos viven justo en ese rango.

**2. El signo estaba invertido.**
La correlación mide hacia dónde se movió el *contenido*; la cámara va al revés.
Las magnitudes eran correctas (0,349 medido contra 0,375 real) y el sentido,
opuesto. Lo detectó el banco: sin verdad de terreno, un error así pasa inadvertido
y se propaga a todos los prompts.

**3. La imagen de calibración cambia el resultado.** Se probaron tres:

| Base | Qué pasa |
|---|---|
| `testsrc2` | patrones periódicos: la correlación engancha mínimos falsos. Un paneo puro reportaba un tilt de 0,44 inexistente |
| ruido desenfocado | isotrópico: al sumar columnas enteras el perfil queda plano y no hay qué correlacionar. El tilt dejó de detectarse |
| **`mandelbrot`** | estructura en todas las escalas, sin periodicidad, determinista. Nitidez 0,99 en ambos ejes. **Es la que se usa** |

De ahí salió también evaluar la nitidez **por eje** en vez de promediada: un patrón
repetitivo afecta un solo eje, y al promediar el eje bueno tapaba al malo.

**4. Los sujetos en movimiento simulan un zoom.**
Un plano de dos personas con cámara verificadamente fija daba divergencia entre
mitades de 0,068, porque el movimiento de los sujetos deforma cada mitad de forma
asimétrica. Los push-in verdaderos miden 0,15 y 0,24. `ZOOM_MIN` quedó en **0,10**:
prefiere perder un push-in muy sutil antes que inventar uno.

Este es el límite de fondo del método y no se resuelve con umbrales: cuando un
sujeto domina el cuadro, los perfiles siguen al sujeto, no a la cámara. Por eso
existe el campo `confianza` y por eso se guardan las tiras de tres frames.

### Umbrales vigentes

| Constante | Valor | Qué lo fija |
|---|---|---|
| `QUIETO` | 0,025 del cuadro | un paneo de 6,25% tiene que dar "paneo" |
| `ZOOM_MIN` | 0,10 de divergencia | el falso positivo real de 0,068 |
| `HANDHELD` | 0,4 de jitter | separa temblor de movimiento sostenido |
| `NITIDEZ_EJE` | 0,5 | descarta el eje enganchado en un mínimo falso |

---

## Saturación

Escala obtenida forzando saturación conocida con `eq=saturation=X` sobre material
real y midiendo el `SATAVG` resultante:

| Forzada | SATAVG |
|---|---|
| 0 (monocromo) | 1 |
| 0,35 | 12,6 |
| 0,7 | 25,3 |
| **1,0 (natural)** | **35,8** |
| 1,5 | 54,4 |
| 2,2 | 79,7 |
| 3,0 | 105,4 |

Antes de medir esto, el umbral de "desaturado" estaba en 22 y **casi todo el
material caía ahí**, con lo cual la métrica no distinguía nada. Los cortes ahora
son 5 / 18 / 30 / 45 / 70.

Advertencia que va en el reporte: depende del contenido. Una escena sin color
intrínseco mide bajo aunque no tenga grading desaturado. Sirve sobre todo para
comparar planos **entre sí** dentro de la misma pieza.

---

## Detección de planos

Verificada contra dos piezas de estructura conocida.

**Institucional de 93s:** 20 planos, coincidentes con el desglose hecho a mano.

**Reel propio de 27s, con los seis segmentos de origen como verdad de terreno**
(cortes reales en 5,92 / 9,79 / 13,39 / 18,56 / 23,97):

| Señal | Encontró |
|---|---|
| imagen, umbral por defecto | 1 plano — falso negativo total |
| imagen, umbral sugerido | 3 de 5, con sesgo constante de ~0,2s |
| silencios de audio | los 5, con sesgo de ~0,45s |

Por eso el escáner guarda el score de **todos** los cuadros en una sola pasada
—para poder refiltrar sin re-decodificar y sugerir umbral— y por eso muestra
imagen y audio **por separado** en `cruce_imagen_audio` en vez de fusionarlos.

---

## Transiciones

Verificada contra `blackdetect`, que es una medición independiente: el escáner
clasificó `fundido_a_negro` en t=64,07 y `blackdetect` reporta negro entre
64,066 y 64,133. Coinciden.

Nota: `blackdetect` con umbral laxo también marca un plano entero oscuro
(el ticker financiero, 44,4→48,5). Eso no es un fundido, y el escáner no lo
confunde porque solo mira la ventana alrededor de un corte.

---

## Audio mudo

Un institucional de stock real usado como caso de prueba tiene pista de audio a −91 dB. Confirmado con
`volumedetect` antes de creerle al propio código. El escáner distingue
"sin pista" de "presente pero muda": un video mudo se monta a ojo, no al ritmo.

---

## Loudness mide el pipeline de distribución, no la pieza

Verificado escaneando cuatro campañas publicitarias reales, de género, mood y editor
distintos entre sí (una de motorsport a 52 cortes/min, una de perfume con 4 planos de 4s
cada uno): **las cuatro miden exactamente −14,1 LUFS de loudness integrado.**

Esa coincidencia no es la pieza — es Instagram normalizando el audio al servir el video.
El loudness medido sobre material bajado de una plataforma social refleja el masterizado
de la plataforma, no el de la mezcla original. Sirve para comparar loudness relativo entre
piezas bajadas de la misma fuente; no sirve para inferir cómo se mezcló el original.

## Cuatro casos reales de cubeta C, con evidencia

`replicabilidad-generativa.md` describe las categorías; estos son ejemplos con material real
detrás, no hipotéticos:

- **Dos personas caminando sincronizadas al mismo paso** (compañeros de equipo entrando a
  boxes, en dos piezas de una misma campaña de motorsport): coordinación física entre dos
  cuerpos.
- **Mano sirviendo o sosteniendo líquido en vidrio** (whisky, perfume): la física de
  fluidos es el punto que el research marca como más duro de toda la lista, y apareció en
  dos piezas de género distinto.
- **Manipulación fina de un objeto chico** (mano moviendo una pieza de ajedrez).
- **Tipografía exacta de un nombre propio sobre una silueta**: texto legible generado en
  cuadro, con la ortografía de una persona real.

## Un falso "movimiento de cámara" que resultó ser dos planos fusionados

En una pieza de más de 36 cortes/min, un plano marcado `indeterminado` (confianza baja)
resultó ser, al mirar la tira, **dos tomas completamente distintas** (un auto en pista, un
caballo en duotono) que el detector de escenas no separó: el corte entre ambas fue más
rápido que lo que el umbral podía resolver en ese punto. El campo `confianza` hizo lo que
tenía que hacer — evitó reportar "movimiento de cámara" sobre algo que no era una cámara
moviéndose. A ritmos de corte muy altos, revisar los planos `indeterminado` con la tira
antes de descartarlos como ruido.

---

## Lo que NO está calibrado

Honestidad sobre el alcance:

- **Tempo (BPM):** el algoritmo reporta `relieve_pico` y `confianza`, pero no se
  contrastó contra pistas de BPM conocido. Puede caer en la mitad o el doble.
- **Textura / grano:** mide alta frecuencia espacial, que mezcla grano con detalle
  fino. No hay banco que los separe. Es una pista, no un veredicto.
- **Escala de plano y ángulo de cámara:** no se miden. Los infiere el agente
  mirando los frames, y así se declaran.
