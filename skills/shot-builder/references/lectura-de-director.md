# Lectura de director

Un paso, antes de compilar, no después. El origen: quien pide una pieza casi nunca tiene el
ojo entrenado para notar que dos planos no se van a sentir como la misma sesión — eso es
oficio de dirección, no de quien encarga el video. Si el skill espera a que lo note el
usuario mirando el resultado ya generado, ya se gastó el crédito. Este paso existe para
notarlo antes, con el guion todavía en texto.

## El principio, con evidencia real detrás

**Un mecanismo de identidad no solo trae la cara — trae todo lo que hay alrededor de esa
cara en la foto de referencia, a menos que el prompt lo contradiga explícitamente.**

No es una sospecha: en la primera pieza de producción real de este skill, el vestuario de
Valentina fue el mismo suéter crema en ocho de nueve planos, sin que nadie lo hubiera
decidido — porque es el único vestuario que aparece en las fotos de su `CHARACTER_PACK`, y
ningún plano lo contradijo en el prompt. Es la misma mecánica, exacta, que ya rompió la
cámara y el entorno en la primera corrida de video (`higgsfield-dialecto.md`): la referencia
arrastra su contexto entero si no se le da una razón para no hacerlo.

## Los ejes que se arrastran en silencio

Recorrer esta lista **antes** de dar el `SHOT_LIST` por terminado. Por cada eje: o hay una
decisión explícita escrita, o hay una pregunta hecha al usuario. Nunca un silencio.

### Vestuario

Campo obligatorio en el schema (`vestuario`) — pero el campo obligatorio solo fuerza que
algo esté escrito, no que esté bien decidido. Preguntas:

- ¿Este plano necesita el mismo vestuario que otro? Si sí, el texto de `vestuario` tiene que
  ser **literal idéntico** en los dos — mismo motivo que ya se aplicó a `entorno`/`luz`.
- ¿El `CHARACTER_PACK` tiene más de un vestuario aprobado, o solo candidatos sin aprobar? Si
  solo hay candidatos, cualquier vestuario nuevo que se le pida a un plano es una apuesta —
  decírselo al usuario, no asumir que cualquier cosa que el modelo genere va a sostenerse.
- Si la decisión es sostener el vestuario que trae la foto de referencia, escribirlo así,
  con el literal `"hereda del activo_identidad"` — no dejar el campo vacío ni parafrasear
  "el mismo de siempre".

### Props y objetos recurrentes

Si un objeto aparece en más de un plano (un producto, un accesorio), su forma y color tienen
que describirse **con el mismo nivel de detalle en cada plano donde aparece** — no alcanza
con nombrarlo genérico ("un lápiz labial") y esperar que salga igual dos veces. Evidencia
real: en la misma corrida, el mismo producto se generó con formas visiblemente distintas
entre plano y plano porque el prompt lo describía distinto (a veces "lápiz labial", a veces
solo "el producto"). Si el objeto importa, describirlo una vez con precisión y reusar esa
descripción literal en cada plano donde vuelve a aparecer.

### Peinado y estado físico

Mismo mecanismo: si el peinado tiene que ser continuo entre planos, decirlo explícito
("mismo peinado que el plano anterior") en vez de confiar en que el modelo lo sostenga solo.
Si el guion quiere un cambio de peinado como parte de la historia, marcarlo como una decisión
deliberada, no dejar que sea el resultado de qué foto del pack se usó como ancla en cada
plano.

### Entorno y luz cuando dos planos comparten set

Ya resuelto y en el schema desde antes: texto literal idéntico entre planos del mismo lugar.
Se menciona acá porque es el primer caso donde se detectó este patrón — los demás ejes son
la misma lección aplicada a otras variables.

### Cuándo pasar de checklist a contrato validable

Todo lo de arriba depende de que el agente se acuerde de recorrer la lista. Para un prop u
objeto cuyo estado cambia dentro de la pieza (un cuaderno que se abre, una tapa que se saca),
eso no alcanza — un olvido no avisa. El campo opcional `continuidad` en cada plano
(`{ entra, sale, saltos_declarados }`) hace la misma pregunta pero de forma que
`validate-shot-list.mjs` la puede bloquear: si el `sale` de un plano y el `entra` del
siguiente declaran un valor distinto para la misma entidad, hace falta un salto declarado en
`saltos_declarados` con su motivo (una elipsis de guion) — si no, el validador lo rechaza como
deriva de continuidad, no como decisión.

No es obligatorio en todos los planos ni para toda entidad visible — eso sería una segunda
`SHOT_LIST` completa. Usarlo solo para las entidades cuyo estado de verdad importa sostener
(el objeto que protagoniza la acción, no el color del cielo de fondo). Idea adaptada de
`sequence-continuity-builder` de la edición Codex del frente (cruce 2026-09-04), acotada a
propósito para no convertir esta lectura en trabajo duplicado.

## Cuándo preguntar en vez de decidir

Si al recorrer la lista de arriba alguno de estos ejes no tiene una respuesta clara **y**
no hay una decisión ya aprobada de la que agarrarse (un wardrobe `aprobado`, no
`candidato`; un peinado ya establecido en piezas anteriores), no elegir por cuenta propia.
Preguntarle al usuario, con la opción concreta a la vista — no una pregunta abierta tipo
"¿qué vestuario querés?", sino algo como: *"el pack de Valentina solo tiene el suéter crema
probado — ¿usamos ese para toda la pieza, o probamos un vestuario nuevo sabiendo que es
un candidato sin validar?"*

Esto no es exceso de proceso. Es la diferencia entre gastar crédito real generando algo que
después no sirve, y gastarlo una vez, con la decisión ya tomada.
