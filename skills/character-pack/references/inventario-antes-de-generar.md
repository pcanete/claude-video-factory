# Inventariar antes de generar

Casi ningún personaje real arranca en cero. Antes de gastar un solo llamado de generación:

1. Buscar en la carpeta del cliente carpetas de pruebas previas: turnaround, ángulos,
   escaneos de referencia, comparativas de realismo. Suelen llamarse `pruebas/`, `angulos/`,
   `tests/` o similar.
2. Mirar cada imagen encontrada, no solo listarla. Un archivo llamado `angulo_4_profile.jpg`
   puede no ser en realidad un perfil limpio.
3. Anotar, por cada activo existente: qué ángulo/escala/expresión cubre, qué wardrobe tiene,
   y si el prompt que lo generó está documentado en algún lado (registro, changelog, nombre
   de archivo).
4. Recién con ese inventario armado, calcular qué falta. Generar de nuevo algo que ya existe
   y sostiene identidad es gasto innecesario.

## Señal de que dos activos existentes no son el mismo look

Dos fotos con la misma cara pueden tener vestuario y escenario completamente distintos sin
que nadie lo haya decidido así — simplemente fueron pruebas de días distintos con prompts
distintos. Eso no es un wardrobe lock, son dos candidatos sueltos. Catalogarlos como
candidatos separados en `wardrobe.locks`, no fusionarlos ni elegir uno por cuenta propia.

## Cuándo el cuerpo entero necesita una generación nueva aunque ya exista una

Si el único cuerpo entero disponible usa un wardrobe distinto al del resto del turnaround,
no sirve para validar que la identidad se sostiene en escala completa **con el look base** —
sirve solo para saber que el mecanismo de identidad funciona en general. Si el pack necesita
demostrar cuerpo entero en el look base, hace falta generarlo de nuevo en ese look
específicamente.
