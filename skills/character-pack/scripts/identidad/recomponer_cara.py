"""Edición por región sin modelos generativos: devuelve la cara de la vista del pack a una edición.

Se usa después de cambiar ropa, peinado o fondo sobre una vista del pack. La cara de la edición se
reemplaza por la de la vista fuente, alineada con la malla facial (transformación de similitud por
mínimos cuadrados medianos) y fundida con máscara suave sobre el óvalo de la cara. Así la cara nunca
pasa por el modelo. Solo sirve para la misma vista y expresión: si la pose cambió, el residuo de
alineación sube y el script avisa.

--mascara-ropa escribe además una máscara PNG para edición con máscara (GPT Image): transparente
debajo del mentón (zona editable) y opaca en la cara y arriba.

Uso: python recomponer_cara.py --modelo-cara face_landmarker.task --fuente vista_pack.png
         --destino edicion.png --salida resultado.png
     python recomponer_cara.py --modelo-cara face_landmarker.task --mascara-ropa imagen.png --salida mascara.png
"""
import argparse
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

OVALO = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
         176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
LADO_MAX = 1600
RESIDUO_MAX = 0.02  # fracción del ancho de cara


def leer(ruta):
    img = cv2.imdecode(np.fromfile(str(ruta), dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f'no se pudo leer {ruta}')
    return img


def guardar(img, ruta):
    ok, datos = cv2.imencode('.png', img)
    datos.tofile(str(ruta))


def puntos(detector, bgr):
    h, w = bgr.shape[:2]
    escala = min(1.0, LADO_MAX / max(h, w))
    chica = cv2.resize(bgr, (round(w * escala), round(h * escala)), interpolation=cv2.INTER_AREA) if escala < 1 else bgr
    r = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(chica, cv2.COLOR_BGR2RGB)))
    if not r.face_landmarks:
        raise SystemExit('no hay cara detectable')
    return np.array([[p.x * w, p.y * h] for p in r.face_landmarks[0]], dtype=np.float32)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--modelo-cara', required=True, type=Path)
    parser.add_argument('--fuente', type=Path)
    parser.add_argument('--destino', type=Path)
    parser.add_argument('--mascara-ropa', type=Path)
    parser.add_argument('--salida', required=True, type=Path)
    args = parser.parse_args()
    detector = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(args.modelo_cara)), num_faces=1))

    if args.mascara_ropa:
        img = leer(args.mascara_ropa)
        p = puntos(detector, img)
        alto_cara = p[152, 1] - p[10, 1]
        corte = int(p[152, 1] + 0.12 * alto_cara)
        mascara = np.full((*img.shape[:2], 4), 255, dtype=np.uint8)
        mascara[corte:, :, 3] = 0
        guardar(mascara, args.salida)
        print(f'máscara: editable desde y={corte} de {img.shape[0]} px')
        return

    fuente, destino = leer(args.fuente), leer(args.destino)
    pf, pd = puntos(detector, fuente)[:468], puntos(detector, destino)[:468]
    m, _ = cv2.estimateAffinePartial2D(pf, pd, method=cv2.LMEDS)
    ancho_cara = float(np.linalg.norm(pd[234] - pd[454]))
    residuo = float(np.median(np.linalg.norm(pf @ m[:, :2].T + m[:, 2] - pd, axis=1))) / ancho_cara

    h, w = destino.shape[:2]
    alineada = cv2.warpAffine(fuente, m, (w, h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
    mascara = np.zeros((h, w), dtype=np.uint8)
    cv2.fillConvexPoly(mascara, cv2.convexHull(pd[OVALO].astype(np.int32)), 255)
    borde = max(3, int(0.04 * ancho_cara))
    mascara = cv2.erode(mascara, np.ones((borde, borde), np.uint8))
    interior = mascara > 0
    suave = cv2.GaussianBlur(mascara.astype(np.float32) / 255, (0, 0), 0.035 * ancho_cara)[..., None]

    # Iguala el color medio de la cara traída con el de la edición, para que no quede un parche.
    lab_a = cv2.cvtColor(alineada, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab_d = cv2.cvtColor(destino, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab_a += lab_d[interior].mean(axis=0) - lab_a[interior].mean(axis=0)
    alineada = cv2.cvtColor(np.clip(lab_a, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)

    resultado = (alineada.astype(np.float32) * suave + destino.astype(np.float32) * (1 - suave)).astype(np.uint8)
    guardar(resultado, args.salida)
    escala = float(np.hypot(m[0, 0], m[1, 0]))
    aviso = '' if residuo <= RESIDUO_MAX else '  AVISO: la pose no coincide, revisar a ojo'
    print(f'{args.salida.name}: escala {escala:.3f}, residuo {residuo * 100:.2f}% del ancho de cara{aviso}')


if __name__ == '__main__':
    main()
