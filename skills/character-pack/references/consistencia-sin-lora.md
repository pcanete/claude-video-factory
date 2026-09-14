# Consistencia de personaje sin LoRA: qué funciona y con qué evidencia

Síntesis de un machete externo (sept. 2026), contrastado con pruebas medidas sobre un personaje de
producción (Valentina Muzzo, 2026-09-10 a 2026-09-14). Donde la prueba contradijo al machete, manda la
prueba.

## Principio

La consistencia es una propiedad del flujo de trabajo, no del modelo ni del prompt. Toda generación
lee de la misma fuente canónica, nunca de la toma anterior.

## Lo que se confirmó

| Regla | Evidencia |
|---|---|
| Semilla canónica de alta resolución | La mejor pieza de video salió de una foto original de 8,3 MP. Las vistas de 1,6 MP (cara de ~250 px) daban piel plástica y deformaciones. |
| Nunca referencia derivada | Las vistas hechas desde vistas ya generadas pierden entre 0,01 y 0,05 de identidad por cada salto. |
| Editar por región en lugar de regenerar | Recomponer la cara del pack después de cambiar la ropa subió la identidad mediana de 0,898 a 0,924; el plano americano pasó de 0,798 a 0,967. |
| Un solo modelo para todo el pack | Mezclar modelos rompe la calibración. Partiendo de la semilla, Nano Banana 2 en 4K sostuvo más identidad que GPT Image 2.5 (perfil: 0,863 contra 0,683). |
| Auditar antes de usar | La auditoría encontró deriva que a ojo se discutía: hombros un 7% más angostos en un look nuevo. |
| Voz fija | Clon de voz con muestras de al menos 4,6 s; speech-to-speech sobre el audio del video conserva tiempos y sincronía. |

## Lo que se corrigió

| El machete decía | Lo que mostró la prueba |
|---|---|
| Sumar 2-3 marcadores duros (un lunar, una marca) a la descripción | Todo detalle de piel que se nombra sale exagerado, y el video lo amplifica. Pedir la cara "exactamente como en la referencia", sin describirla. |
| Una descripción densa de la cara al inicio de cada prompt | Mismo efecto. La identidad la llevan las imágenes de referencia; el prompt dice qué cambia y qué se preserva. |
| Hero con luz neutra y fondo liso | Deseable, pero no obligatorio: una semilla con luz lateral de ventana dio el mejor resultado. Cambiar la semilla cuesta rehacer todo el pack. |
| Referencia de la prenda para cambiar vestuario | Una foto de prenda con otro cuerpo contagia la proporción: hombros un 7-15% más angostos. Usar el logo oficial y la descripción de la prenda. |
| Cabeza grande u hombros chicos = corregir el cuerpo | Medido: la proporción hombros ÷ cara era la misma (2,13-2,28) en todas las fotos. La percepción la daban el pelo suelto voluminoso, el encuadre cortado en el pecho y las mangas que tapan el hombro. |

## Medición objetiva: qué mide cada capa

| Capa | Medición | Cuándo vale |
|---|---|---|
| Rostro | Similitud SFace contra la vista equivalente del pack | Siempre. Contra el master baja con la pose aunque sea la misma persona. |
| Geometría | Mandíbula, pómulos, nariz, ojos con la malla facial 3D, normalizados por la distancia entre pupilas | Solo frontal. La mandíbula es la primera señal de deriva. |
| Cuerpo | Hombros ÷ ancho de cara | Solo frontal. Independiente de la distancia y el encuadre. |
| Vestuario | IoU del logo contra el archivo oficial | Solo frontal. Si da bajo, revisar: suele ser el pelo tapándolo. |
| Calibración | Color de piel, nitidez y grano contra la semilla | Grano solo con cara de 900 px o más. |
| Actuación (video) | Apertura de boca, mandíbula, sonrisa y cejas por cuadro contra un video aprobado | Para detectar actuación exagerada. |

Los umbrales salen de la variación de la propia semilla. Referencia de Valentina: fotos de la misma
sesión contra el master, con identidad 0,85-0,96, mandíbula ±2,2% y geometría máxima 2,2-7,5%.

## Pendiente de probar

- Edición con máscara en GPT Image 2.5, contra la recomposición de cara.
- Umbrales específicos por vista en ángulo.
- Si reducir el grano sobrante (no solo sumarlo) mejora la calibración de caras traídas de originales.
