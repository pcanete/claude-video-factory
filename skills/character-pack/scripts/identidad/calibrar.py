"""Calibra imágenes del pack contra la semilla: formato 2160x3840, nitidez, grano y color de piel.

No usa modelos generativos: solo recorte/escala, desenfoque gaussiano, grano de luminancia y un
corrimiento de color en Lab, así la identidad no cambia. Mide con las funciones de pack_medir.py.

- --frontal: vistas frontales y expresiones. Se ajustan nitidez, grano y color de piel (a*, b*).
- --angulo: tres cuartos y perfiles. Nitidez y grano contra la semilla; el color de piel, contra
  --semilla-angulo (una vista en ángulo de la misma sesión), porque de costado la luz de la ventana
  cambia la piel.
- --solo-formato: fotos de la semilla. Solo se llevan a 2160x3840.
Las imágenes sin cara detectable (espalda) reciben la mediana del desenfoque y el grano aplicados.

Uso: python calibrar.py --modelos carpeta --semilla img --salida carpeta
         [--solo-formato img ...] [--frontal img ...] [--angulo img ...]
"""
import argparse
import json
import statistics
from pathlib import Path

import cv2
import numpy as np

from pack_medir import DETECTOR, calibracion, detectar, leer

ANCHO, ALTO = 2160, 3840


def conformar(imagen):
    h, w = imagen.shape[:2]
    objetivo = ANCHO / ALTO
    if w / h > objetivo:
        nuevo = round(h * objetivo)
        imagen = imagen[:, (w - nuevo) // 2:(w - nuevo) // 2 + nuevo]
    else:
        nuevo = round(w / objetivo)
        imagen = imagen[(h - nuevo) // 2:(h - nuevo) // 2 + nuevo]
    interp = cv2.INTER_AREA if imagen.shape[1] > ANCHO else cv2.INTER_LANCZOS4
    return cv2.resize(imagen, (ANCHO, ALTO), interpolation=interp)


def desenfocar(imagen, sigma):
    return cv2.GaussianBlur(imagen, (0, 0), sigma) if sigma > 0 else imagen


def buscar_sigma(imagen, cara, objetivo):
    """Menor desenfoque que lleva la nitidez de la cara al objetivo (búsqueda binaria)."""
    bajo, alto = 0.0, 3.0
    for _ in range(12):
        medio = (bajo + alto) / 2
        if calibracion(desenfocar(imagen, medio), cara)['nitidez'] > objetivo:
            bajo = medio
        else:
            alto = medio
    return alto


def con_grano(imagen, amplitud, semilla=7):
    ruido = np.random.default_rng(semilla).normal(0, 1, imagen.shape[:2]).astype(np.float32)
    return np.clip(imagen.astype(np.float32) + (ruido * amplitud)[..., None], 0, 255).astype(np.uint8)


def buscar_grano(imagen, cara, objetivo):
    if calibracion(imagen, cara)['grano'] >= objetivo:
        return 0.0
    bajo, alto = 0.0, 30.0
    for _ in range(12):
        medio = (bajo + alto) / 2
        if calibracion(con_grano(imagen, medio), cara)['grano'] < objetivo:
            bajo = medio
        else:
            alto = medio
    return alto


def corregir_color(imagen, da, db):
    lab = cv2.cvtColor(imagen, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab[..., 1] += da
    lab[..., 2] += db
    return cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)


def guardar(imagen, carpeta, ruta):
    destino = carpeta / (Path(ruta).stem + '.png')
    ok, datos = cv2.imencode('.png', imagen)
    if not ok:
        raise ValueError(f'no se pudo codificar {destino}')
    datos.tofile(str(destino))  # tofile acepta rutas con "ñ"; cv2.imwrite no
    return destino


def redondear(d):
    return {k: round(v, 2) for k, v in d.items()} if d else None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--modelos', required=True, type=Path)
    parser.add_argument('--semilla', required=True, type=Path)
    parser.add_argument('--semilla-angulo', type=Path,
                        help='vista en ángulo de la semilla: objetivo de color para --angulo (sin ella, no se corrige su color)')
    parser.add_argument('--salida', required=True, type=Path)
    parser.add_argument('--solo-formato', nargs='*', default=[])
    parser.add_argument('--frontal', nargs='*', default=[])
    parser.add_argument('--angulo', nargs='*', default=[])
    args = parser.parse_args()
    args.salida.mkdir(parents=True, exist_ok=True)

    detector = cv2.FaceDetectorYN.create(str(args.modelos / DETECTOR), '', (320, 320), 0.7, 0.3, 50)
    semilla = conformar(leer(args.semilla))
    objetivo = calibracion(semilla, detectar(detector, semilla))
    objetivo_angulo = None
    if args.semilla_angulo:
        vista = conformar(leer(args.semilla_angulo))
        objetivo_angulo = calibracion(vista, detectar(detector, vista))
    informe = {'objetivo': redondear(objetivo), 'objetivo_color_angulo': redondear(objetivo_angulo),
               'formato': f'{ANCHO}x{ALTO}', 'imagenes': []}

    for ruta in args.solo_formato:
        imagen = conformar(leer(ruta))
        cara = detectar(detector, imagen)
        destino = guardar(imagen, args.salida, ruta)
        informe['imagenes'].append({'archivo': destino.name, 'grupo': 'semilla', 'pasos': {},
                                    'despues': redondear(calibracion(imagen, cara)) if cara is not None else None})

    sigmas, amplitudes, sin_cara = [], [], []
    for grupo, rutas in (('frontal', args.frontal), ('angulo', args.angulo)):
        for ruta in rutas:
            imagen = conformar(leer(ruta))
            cara = detectar(detector, imagen)
            if cara is None:
                sin_cara.append((grupo, ruta, imagen))
                continue
            antes, pasos = calibracion(imagen, cara), {}
            if antes['nitidez'] > objetivo['nitidez'] * 1.15:
                sigma = buscar_sigma(imagen, cara, objetivo['nitidez'])
                imagen = desenfocar(imagen, sigma)
                pasos['desenfoque_sigma'] = round(sigma, 3)
                sigmas.append(sigma)
            color = objetivo if grupo == 'frontal' else objetivo_angulo
            if color:
                actual = calibracion(imagen, cara)
                da, db = color['a'] - actual['a'], color['b'] - actual['b']
                if abs(da) > 1.5 or abs(db) > 1.5:
                    imagen = corregir_color(imagen, da, db)
                    pasos['color_ab'] = [round(da, 2), round(db, 2)]
            amplitud = buscar_grano(imagen, cara, objetivo['grano'])
            if amplitud:
                imagen = con_grano(imagen, amplitud)
                pasos['grano_amplitud'] = round(amplitud, 2)
                amplitudes.append(amplitud)
            destino = guardar(imagen, args.salida, ruta)
            informe['imagenes'].append({'archivo': destino.name, 'grupo': grupo, 'pasos': pasos,
                                        'antes': redondear(antes), 'despues': redondear(calibracion(imagen, cara))})

    for grupo, ruta, imagen in sin_cara:
        sigma = statistics.median(sigmas) if sigmas else 0.0
        amplitud = statistics.median(amplitudes) if amplitudes else 0.0
        imagen = con_grano(desenfocar(imagen, sigma), amplitud)
        destino = guardar(imagen, args.salida, ruta)
        informe['imagenes'].append({'archivo': destino.name, 'grupo': grupo, 'antes': None, 'despues': None,
                                    'pasos': {'desenfoque_sigma': round(sigma, 3), 'grano_amplitud': round(amplitud, 2),
                                              'nota': 'sin cara detectable: mediana de los ajustes del lote'}})

    (args.salida / 'calibracion.json').write_text(json.dumps(informe, ensure_ascii=False, indent=2), encoding='utf-8')
    o = informe['objetivo']
    print(f'objetivo (semilla): nitidez {o["nitidez"]}  grano {o["grano"]}  L {o["L"]}  a {o["a"]}  b {o["b"]}\n')
    print(f'{"archivo":<40}{"nitidez":>18}{"grano":>14}{"a":>14}{"b":>14}')
    for r in informe['imagenes']:
        a, d = r.get('antes'), r.get('despues')
        if not d:
            print(f'{r["archivo"]:<40}  {r["pasos"].get("nota", "sin cara")}')
            continue
        if not a:
            a = d
        print(f'{r["archivo"]:<40}{a["nitidez"]:>8.0f} -> {d["nitidez"]:<6.0f}{a["grano"]:>5.2f} -> {d["grano"]:<5.2f}'
              f'{a["a"]:>5.1f} -> {d["a"]:<5.1f}{a["b"]:>5.1f} -> {d["b"]:<5.1f}')


if __name__ == '__main__':
    main()
