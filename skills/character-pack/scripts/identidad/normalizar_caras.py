"""Arma una comparación con la cara a la misma escala: cada foto se escala para que el ancho de cara
(pómulo a pómulo, puntos 234 y 454 de la malla facial) mida lo mismo, y se recorta con la nariz en el
mismo punto. Así los hombros, el pelo y el encuadre se comparan directo entre fotos distintas.

Uso: python normalizar_caras.py --modelo-cara face_landmarker.task --salida hoja.png "etiqueta=ruta" ...
"""
import argparse
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

ANCHO_CARA = 150          # px del ancho de cara en la hoja
CUADRO_W, CUADRO_H = 560, 900
NARIZ_X, NARIZ_Y = CUADRO_W // 2, 230


def leer(ruta):
    imagen = cv2.imdecode(np.fromfile(str(ruta), dtype=np.uint8), cv2.IMREAD_COLOR)
    if imagen is None:
        raise ValueError(f'no se pudo leer {ruta}')
    return imagen


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--modelo-cara', required=True, type=Path)
    parser.add_argument('--salida', required=True, type=Path)
    parser.add_argument('fotos', nargs='+', help='etiqueta=ruta')
    args = parser.parse_args()

    detector = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(args.modelo_cara)), num_faces=1))
    cuadros = []
    for spec in args.fotos:
        etiqueta, ruta = spec.split('=', 1)
        imagen = leer(ruta)
        h, w = imagen.shape[:2]
        r = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(imagen, cv2.COLOR_BGR2RGB)))
        if not r.face_landmarks:
            print(f'sin cara: {etiqueta}')
            continue
        f = r.face_landmarks[0]
        ancho = np.hypot((f[234].x - f[454].x) * w, (f[234].y - f[454].y) * h)
        escala = ANCHO_CARA / ancho
        nx, ny = f[1].x * w * escala, f[1].y * h * escala
        # Traslada la nariz al punto fijo; lo que quede fuera de la foto se pinta gris.
        m = np.float32([[escala, 0, NARIZ_X - nx], [0, escala, NARIZ_Y - ny]])
        cuadro = cv2.warpAffine(imagen, m, (CUADRO_W, CUADRO_H), flags=cv2.INTER_AREA, borderValue=(60, 60, 60))
        for x in range(0, CUADRO_W, 40):
            cv2.line(cuadro, (x, 0), (x, CUADRO_H), (0, 220, 255), 1)
        cv2.putText(cuadro, etiqueta, (8, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 4)
        cv2.putText(cuadro, etiqueta, (8, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        cuadros.append(cuadro)
        print(f'{etiqueta}: ancho de cara {ancho:.0f} px, escala {escala:.3f}')

    hoja = np.hstack(cuadros)
    ok, datos = cv2.imencode('.png', hoja)
    datos.tofile(str(args.salida))
    print(f'hoja: {args.salida} ({hoja.shape[1]}x{hoja.shape[0]})')


if __name__ == '__main__':
    main()
