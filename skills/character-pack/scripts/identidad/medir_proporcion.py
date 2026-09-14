"""Mide la proporción hombros / cara en fotos de Valentina con MediaPipe (pose + malla facial).

- hombros_px: distancia entre los puntos 11 y 12 de la pose (articulación del hombro, no el borde
  de la ropa: mide el cuerpo, no la prenda).
- cara_px: ancho de la cara de pómulo a pómulo (puntos 234 y 454 de la malla facial, sin pelo).
- proporcion = hombros_px / cara_px. No depende de la distancia ni del encuadre.
- cara_frontal: la nariz cae en el tercio central entre los dos pómulos.
- torso_frontal: los dos hombros a una profundidad parecida (|z11 - z12| < 0,15) y visibles.
Solo las fotos con cara y torso de frente son comparables entre sí: de costado los hombros se acortan.

Uso: python medir_proporcion.py --modelos carpeta --salida proporcion.csv entrada [entrada ...]
"""
import argparse
import csv
import math
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

EXTENSIONES = {'.png', '.jpg', '.jpeg', '.webp'}
LADO_MAX = 1600


def leer_rgb(ruta):
    imagen = cv2.imdecode(np.fromfile(str(ruta), dtype=np.uint8), cv2.IMREAD_COLOR)
    if imagen is None:
        raise ValueError(f'no se pudo leer {ruta}')
    h, w = imagen.shape[:2]
    escala = min(1.0, LADO_MAX / max(h, w))
    if escala < 1:
        imagen = cv2.resize(imagen, (round(w * escala), round(h * escala)), interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(imagen, cv2.COLOR_BGR2RGB)


def expandir(entradas):
    for e in map(Path, entradas):
        if e.is_dir():
            yield from sorted(p for p in e.iterdir() if p.suffix.lower() in EXTENSIONES)
        else:
            yield e


def distancia(a, b, w, h):
    return math.hypot((a.x - b.x) * w, (a.y - b.y) * h)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--modelos', required=True, type=Path)
    parser.add_argument('--modelo-cara', type=Path, help='face_landmarker.task (por defecto, dentro de --modelos)')
    parser.add_argument('--salida', required=True, type=Path)
    parser.add_argument('entradas', nargs='+')
    args = parser.parse_args()

    pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(args.modelos / 'pose_landmarker_heavy.task')), num_poses=1))
    cara = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(args.modelo_cara or args.modelos / 'face_landmarker.task')), num_faces=1))

    filas = []
    for ruta in expandir(args.entradas):
        rgb = leer_rgb(ruta)
        h, w = rgb.shape[:2]
        imagen = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        fila = {'archivo': ruta.name}
        rp, rc = pose.detect(imagen), cara.detect(imagen)
        if not rp.pose_landmarks or not rc.face_landmarks:
            fila['nota'] = 'sin pose' if not rp.pose_landmarks else 'sin cara'
            filas.append(fila)
            continue
        p, f = rp.pose_landmarks[0], rc.face_landmarks[0]
        hombros = distancia(p[11], p[12], w, h)
        ancho_cara = distancia(f[234], f[454], w, h)
        nariz = (f[1].x - f[234].x) / ((f[454].x - f[234].x) or 1e-6)
        visibles = min(p[11].visibility, p[12].visibility)
        fila.update({
            'hombros_px': round(hombros), 'cara_px': round(ancho_cara), 'proporcion': round(hombros / ancho_cara, 3),
            'cara_frontal': 0.33 < nariz < 0.67, 'torso_frontal': abs(p[11].z - p[12].z) < 0.15 and visibles > 0.5,
            'nariz_rel': round(nariz, 2), 'dz_hombros': round(abs(p[11].z - p[12].z), 3), 'visibilidad': round(visibles, 2),
        })
        filas.append(fila)

    campos = ['archivo', 'hombros_px', 'cara_px', 'proporcion', 'cara_frontal', 'torso_frontal', 'nariz_rel',
              'dz_hombros', 'visibilidad', 'nota']
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    with args.salida.open('w', newline='', encoding='utf-8') as fcsv:
        escritor = csv.DictWriter(fcsv, fieldnames=campos)
        escritor.writeheader()
        escritor.writerows(filas)

    comparables = [r for r in filas if r.get('cara_frontal') and r.get('torso_frontal')]
    print(f'{len(filas)} fotos, {len(comparables)} comparables (cara y torso de frente)\n')
    print(f'{"archivo":<50}{"hombros":>8}{"cara":>6}{"prop":>7}  frontal')
    for r in sorted(filas, key=lambda r: r.get('proporcion', 0), reverse=True):
        if 'proporcion' not in r:
            print(f'{r["archivo"][:48]:<50}  {r["nota"]}')
            continue
        marca = 'si' if r['cara_frontal'] and r['torso_frontal'] else f'no (nariz {r["nariz_rel"]}, dz {r["dz_hombros"]})'
        print(f'{r["archivo"][:48]:<50}{r["hombros_px"]:>8}{r["cara_px"]:>6}{r["proporcion"]:>7.3f}  {marca}')
    if comparables:
        valores = sorted(r['proporcion'] for r in comparables)
        print(f'\ncomparables: mediana {valores[len(valores) // 2]:.3f}  mín {valores[0]:.3f}  máx {valores[-1]:.3f}')
    print(f'CSV: {args.salida}')


if __name__ == '__main__':
    main()
