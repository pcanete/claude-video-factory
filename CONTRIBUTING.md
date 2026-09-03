# Cómo contribuir

Gracias por ayudar a mejorar Claude Video Factory.

## Antes de tocar el código

1. Este repositorio mide y clasifica; no genera video ni asume qué herramienta de
   generación se va a usar después. Un cambio que ata el escáner a un vendor
   específico no corresponde acá.
2. Todo umbral nuevo necesita calibración: video sintético de respuesta conocida
   que lo justifique, no una estimación. Ver
   [`skills/video-reference-scanner/references/calibracion.md`](skills/video-reference-scanner/references/calibracion.md)
   para el formato esperado.
3. No agregues client data, credenciales, ni material con copyright de terceros
   como fixture o ejemplo.

## Verificaciones de desarrollo

Desde la raíz del repositorio:

```bash
npm test
```

Esto corre la validación estructural del repositorio y, por cada skill, su propia
suite de calibración. Un cambio en un umbral de medición tiene que seguir dando
7/7 en `scripts/calibrar.mjs`, o traer el ajuste que lo vuelve a poner en 7/7.

## Una invariante que el revisor no tiene que recordar

**El script mide, el agente interpreta.** Ningún archivo bajo `scripts/` decide
si un plano es "medio" o si la luz es "cálida" — eso queda para quien lee
`VIDEO_EVIDENCE.json` con los frames a la vista. Si una función empieza a emitir
juicio cinematográfico en vez de un número medido, no corresponde en el motor.

## Pull requests

- Documentá qué se calibró y contra qué, no solo qué cambió.
- Señalá explícitamente si un cambio de umbral puede alterar clasificaciones ya
  emitidas en instalaciones existentes.
- Nunca incluyas credenciales, datos de clientes ni archivos `.env` locales.

Los pull requests chicos y enfocados son más fáciles de revisar y de reutilizar.
