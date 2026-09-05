# El sistema de la pieza — leer qué ES, no qué TIENE

## El problema que resuelve

Un desglose de planos es un inventario: este plano tiene un dolly in, aquel es un primer
plano, el corte de acá es duro. Todo cierto, y sin embargo se puede cumplir el inventario
ítem por ítem y obtener una pieza que no se parece al original.

Pasa porque lo que sostiene una pieza casi nunca vive en un plano. Vive en dos lugares que el
inventario no registra:

1. **Las reglas que todos los planos obedecen** — y que por obedecerlas todos, ninguno declara.
2. **Lo que la pieza sistemáticamente no hace.** Un desglose solo puede listar lo que está.
   Nadie escribe "acá no hay un plano general", así que la reconstrucción mete uno, y rompe
   la pieza sin que nadie pueda decir por qué.

Este contrato existe para capturar las dos cosas, en términos que sobrevivan a cambiar el
sujeto, el entorno y los objetos — porque el objetivo no es rehacer la pieza, es poder hacer
una distinta que no quede a medias.

## Cómo encontrar el principio organizador

Una frase. No un resumen de lo que pasa: el mecanismo que genera la pieza.

- *"Montaje rápido de una nadadora entrenando"* → es un resumen. No sirve.
- *"Nunca se ve a la atleta entera ni la pileta entera, así que el espectador la arma en su
  cabeza con equipo, piel y agua"* → es un principio. Explica por qué cada plano es como es.

**La prueba:** cambiá el sujeto mentalmente. Si el principio sigue siendo cierto y sigue
generando planos, es un principio. Si deja de tener sentido, era un resumen disfrazado.

## Cómo cazar prohibiciones

Es lo más difícil y lo más valioso. No se ve mirando: se ve preguntando. Recorrer la pieza
entera con cada pregunta, y anotar cuáles dan cero:

- ¿Hay algún plano general o establishing?
- ¿Se ve el cuerpo entero del sujeto alguna vez?
- ¿Aparece otra persona? ¿público, rivales, equipo?
- ¿Hay gráfica, texto o placas antes del cierre?
- ¿Hay diálogo? ¿Hay alguien mirando a cámara?
- ¿Hay algún plano en reposo, sin movimiento de cámara ni acción?
- ¿Hay algún frame que no tenga el motivo recurrente (agua, polvo, humo, lo que sea)?

Una respuesta "cero" sostenida durante toda la pieza no es casualidad: es una decisión de
dirección. **Esa decisión es la que más se pierde al reconstruir.**

Y hay que declarar cómo se comprobó la ausencia — qué planos se revisaron sin encontrarlo.
Una ausencia afirmada sin haber mirado es una suposición, y el validador la rechaza.

## Carga de identidad: columna vertebral vs. acabado

Por cada regla y prohibición, decidir: si esto se rompe, ¿la pieza deja de ser esta pieza?

- **Columna vertebral** (`carga_identidad: true`): fragmentación total, ausencia de plano
  general, el motivo recurrente. Romperlas es legítimo, pero cambia la naturaleza del trabajo.
- **Acabado** (`carga_identidad: false`): la temperatura de color, la hora del día, el grado.
  Se pueden cambiar sin que nadie note que es "otra clase de pieza".

Confundir las dos es la causa técnica de que algo quede a medias: se cuida religiosamente el
grado de color y se mete un plano general, cuando era exactamente al revés.

## Portabilidad: la única parte que sirve para construir

`sobrevive_cambio_de_sujeto` separa lo que es de esta pieza de lo que es transferible.

- *"Agua en todos los planos"* no es portable tal cual, pero sí su forma general: **el
  elemento de la disciplina está en todos los planos**. Con un ciclista es polvo o asfalto;
  con un cocinero es fuego o vapor.
- *"El equipamiento tiene tanto tiempo en pantalla como la cara"* es portable literal, y es
  oro para una pieza de producto.
- *"Contraluz de hora dorada"* es portable pero es acabado: te da el look, no la pieza.

Si ninguna regla es portable, el sistema describe esta pieza y nada más — y entonces no sirve
para lo único que se escribió.

## Cambios deliberados

Acá vive la decisión, y es el paso posterior a la lectura, nunca simultáneo. Primero se lee
todo lo que la técnica permite ver; después se elige qué romper.

Romper una regla con `carga_identidad: true` **exige declarar qué se gana a cambio**. No es
burocracia: es la diferencia entre "decidimos abrir con un plano general para ubicar la
locación, sabiendo que perdemos el encierro" y una pieza que salió rara y nadie sabe por qué.

## Frontera

Este contrato captura técnica y estructura. Registrar que a los 22,15s hay un logo de un
tercero es análisis y va acá con su timecode. Reproducir ese logo en la pieza nueva es otra
cosa, y esa decisión se toma en `cambios_deliberados` y en el `SHOT_LIST`, no acá.
