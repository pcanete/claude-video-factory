# Glosario espejo — de criollo a técnico, y de vuelta

Este archivo tiene dos usos y los dos importan.

**Hacia adentro:** cuando el usuario describe algo en criollo, encontrar acá el término
técnico antes de escribir un prompt.

**Hacia afuera:** cuando el escáner emite un término técnico, devolverlo siempre acompañado
de cómo se dice en criollo **y anclado a un frame del video del propio usuario**. Un término
sin ejemplo propio no se aprende.

La columna "cómo se detecta" es lo que hay que mirar en los frames, no una definición.

---

## Escala de plano

| En criollo | Término | Cómo se detecta en el frame | En un prompt |
|---|---|---|---|
| "de bien lejos, se ve todo el lugar" | plano general / establishing | la figura humana ocupa menos de 1/5 del alto | `wide establishing shot` |
| "se ve la persona entera" | plano entero | cabeza y pies dentro del cuadro, con aire | `full shot` |
| "de la cintura para arriba" | plano medio | corte entre cadera y pecho | `medium shot` |
| "la cara y los hombros" | primer plano | corte entre pecho y cuello | `close-up` |
| "solo los ojos, bien encima" | primerísimo primer plano | los rasgos exceden el cuadro | `extreme close-up` |
| "la mano haciendo algo, un detalle" | inserto / plano detalle | objeto sin rostro, sin contexto de espacio | `insert shot`, `detail shot` |

Regla práctica: si en el contact sheet no se distingue quién es la persona, es abierto.

---

## Movimiento de cámara

**Cómo distinguirlos:** mirar la tira `motion-XXX.png` (tres frames del mismo plano).
Comparar la posición del horizonte, los bordes del cuadro y el tamaño de los sujetos.

| En criollo | Término | Cómo se detecta | En un prompt |
|---|---|---|---|
| "no se mueve, se mueven ellos" | **cámara fija con acción interna** | encuadre idéntico en los 3 frames, cambia solo lo que pasa adentro | `locked-off shot`, `static camera` |
| "se va acercando de a poco" | push-in / dolly in | los sujetos crecen, el encuadre se cierra | `slow dolly in` |
| "se aleja y aparece todo" | pull-out / dolly out | los sujetos se achican, entra contexto | `dolly out revealing` |
| "se acerca de golpe" | snap zoom / whip-in | salto de escala entre dos frames contiguos | `fast snap zoom in` |
| "barre de un lado al otro" | paneo | el horizonte se mantiene a la misma altura, el contenido se desplaza lateral | `slow pan left/right` |
| "sube o baja mirando" | tilt | el horizonte sube o baja dentro del cuadro | `tilt up/down` |
| "camina al lado de ellos" | travelling lateral / tracking | el sujeto queda en el mismo lugar del cuadro y el fondo se corre | `tracking shot alongside` |
| "tiembla un poco, como filmado a mano" | cámara en mano | micro-desencuadres irregulares entre frames | `handheld, subtle camera shake` |
| "da la vuelta alrededor" | órbita | el fondo rota mientras el sujeto se mantiene centrado | `slow orbit, ~45 degrees` |
| "vuela por arriba" | aéreo / dron | punto de vista muy alto, horizonte lejano | `aerial drone shot` |

**El error más caro:** confundir cámara fija con acción interna con un movimiento de cámara.
Si se le pide movimiento a un modelo generativo cuando la referencia era fija, la pieza
pierde exactamente la calma que gustaba.

Al nombrar un movimiento en un prompt, decir **primero el movimiento y después la
intensidad**: "órbita lenta, unos 45 grados" es legible; "la cámara gira bastante" no.

---

## Altura y ángulo

| En criollo | Término | Cómo se detecta | En un prompt |
|---|---|---|---|
| "a la altura de los ojos" | ángulo neutro | línea de horizonte a la altura del rostro | `eye level` |
| "desde abajo, se ve imponente" | contrapicado | se ve el mentón, las líneas convergen hacia arriba | `low angle` |
| "desde arriba, se ve chiquito" | picado | se ve la coronilla, el piso ocupa el cuadro | `high angle` |
| "de arriba a pique, como un plano cenital" | cenital | el piso es todo el cuadro, sin horizonte | `top-down / overhead` |

---

## Luz

| En criollo | Término | Cómo se detecta | En un prompt |
|---|---|---|---|
| "esa luz dorada de la tardecita" | hora dorada | luminancia media-alta, `sesgo_rojo_azul` positivo y alto | `golden hour, warm low sun` |
| "la luz viene de atrás y los recorta" | contraluz | sujeto oscuro, fondo brillante, borde luminoso en el pelo | `backlit, rim light` |
| "pareja, sin sombras duras" | luz difusa | `contraste_interno` bajo | `soft diffused light, overcast` |
| "sombras marcadas, mucho contraste" | luz dura / clave baja | `contraste_interno` alto y luminancia media baja | `hard directional light, deep shadows` |
| "todo clarito y limpio" | clave alta | luminancia alta y contraste interno bajo | `high key lighting` |
| "luz de ventana de costado" | luz lateral suave | degradado horizontal en el rostro | `soft window light from the side` |

`sesgo_rojo_azul` en `VIDEO_EVIDENCE.json` es un hecho medido (rojo promedio menos azul
promedio), no una lectura de temperatura de color. Positivo alto = cálido. Negativo = frío.

---

## Ritmo de montaje

Está medido en `ritmo` dentro de `VIDEO_EVIDENCE.json`.

| En criollo | Qué mirar | Referencia |
|---|---|---|
| "va rapidísimo" | `cortes_por_minuto` > 30 | plano medio bajo 2s |
| "tiene un ritmo normal" | 12 a 25 cortes/min | plano medio 2,5 a 5s |
| "es lento, contemplativo" | < 10 cortes/min | plano medio > 6s |
| "arranca tranquilo y se acelera" | `desvio_s` alto | comparar duraciones por tercio |

`proporcion_cortes_montados_al_audio` alta sugiere montaje al ritmo de la música. Sugiere,
no prueba: decirlo así.

---

## Cómo devolver un término

Mal: *"el plano 05 es un locked-off shot."*

Bien: *"el plano 05 es **cámara fija con acción interna** —el encuadre no se mueve en los tres
frames, lo que cambia es que el padre le acomoda la gorra al hijo—. En inglés, para un modelo
de video, se pide como `locked-off shot`. Es lo que le da la calma que te gustó."*

La diferencia no es cortesía: la segunda versión deja al usuario capaz de pedirlo solo la
próxima vez.
