"""Mide identidad y calibración de imágenes de Valentina contra la semilla.

Identidad: similitud coseno entre embeddings SFace (OpenCV Zoo) de cada imagen y de la semilla.
Referencia de OpenCV para SFace: coseno >= 0.363 se considera la misma persona. Es un umbral
genérico; el del pack se fija mirando la distribución de la propia semilla.
Calibración, medida sobre la cara normalizada a 512 px de alto:
- cara_px: alto de la cara en la imagen original (cuánto detalle real hay),
- L, a, b: color medio de piel en ambas mejillas (CIELAB),
- nitidez: varianza del laplaciano sobre la cara,
- grano: desvío del residuo de alta frecuencia en las mejillas.

Uso: python pack_medir.py --modelos carpeta --semilla img [--semilla img ...] --salida medicion.csv
         entrada [entrada ...]   (archivos o carpetas; .png .jpg .jpeg .webp)
"""
import argparse
import csv
from pathlib import Path

import cv2
import numpy as np

EXTENSIONES = {'.png', '.jpg', '.jpeg', '.webp'}
DETECTOR = 'face_detection_yunet_2023mar.onnx'
RECONOCEDOR = 'face_recognition_sface_2021dec.onnx'


def leer(ruta):
    # cv2.imread no abre rutas con "ñ" en Windows; imdecode sobre bytes sí.
    imagen = cv2.imdecode(np.fromfile(str(ruta), dtype=np.uint8), cv2.IMREAD_COLOR)
    if imagen is None:
        raise ValueError(f'no se pudo leer {ruta}')
    return imagen


def detectar(detector, imagen):
    """Devuelve la cara más grande en coordenadas de la imagen original, o None."""
    h, w = imagen.shape[:2]
    escala = min(1.0, 1280 / max(h, w))
    chica = cv2.resize(imagen, (round(w * escala), round(h * escala)), interpolation=cv2.INTER_AREA) if escala < 1 else imagen
    detector.setInputSize((chica.shape[1], chica.shape[0]))
    _, caras = detector.detect(chica)
    if caras is None or len(caras) == 0:
        return None
    cara = max(caras, key=lambda c: c[2] * c[3]).copy()
    cara[:14] /= escala  # caja (4 valores) y 5 puntos (10 valores); el puntaje queda igual
    return cara


def parche(imagen, centro, lado):
    x, y = int(centro[0] - lado / 2), int(centro[1] - lado / 2)
    return imagen[max(0, y):y + int(lado), max(0, x):x + int(lado)]


def calibracion(imagen, cara):
    x, y, w, h = cara[:4]
    margen = 0.15 * h
    x0, y0 = int(max(0, x - margen)), int(max(0, y - margen))
    x1, y1 = int(min(imagen.shape[1], x + w + margen)), int(min(imagen.shape[0], y + h + margen))
    recorte = imagen[y0:y1, x0:x1]
    factor = 512 / recorte.shape[0]
    recorte = cv2.resize(recorte, (round(recorte.shape[1] * factor), 512), interpolation=cv2.INTER_AREA)

    def local(px, py):
        return ((px - x0) * factor, (py - y0) * factor)

    ojo_der, ojo_izq = local(*cara[4:6]), local(*cara[6:8])
    boca_der, boca_izq = local(*cara[10:12]), local(*cara[12:14])
    lado = 0.12 * w * factor
    mejillas = [parche(recorte, ((ojo_der[0] + boca_der[0]) / 2 - lado * 0.4, (ojo_der[1] + boca_der[1]) / 2), lado),
                parche(recorte, ((ojo_izq[0] + boca_izq[0]) / 2 + lado * 0.4, (ojo_izq[1] + boca_izq[1]) / 2), lado)]
    mejillas = [m for m in mejillas if m.size]

    lab = np.concatenate([cv2.cvtColor(m, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(float) for m in mejillas])
    # OpenCV guarda L en 0-255 y a/b desplazados en 128: se pasan a la escala CIELAB habitual.
    L, a, b = lab[:, 0].mean() * 100 / 255, lab[:, 1].mean() - 128, lab[:, 2].mean() - 128

    gris = cv2.cvtColor(recorte, cv2.COLOR_BGR2GRAY).astype(float)
    # Suavizado previo para que el grano no cuente como nitidez: mide el detalle de la cara, no el ruido.
    nitidez = cv2.Laplacian(cv2.GaussianBlur(gris, (0, 0), 1.0), cv2.CV_64F).var()
    residuos = []
    for m in mejillas:
        g = cv2.cvtColor(m, cv2.COLOR_BGR2GRAY).astype(float)
        residuos.append((g - cv2.GaussianBlur(g, (0, 0), 1.0)).std())
    return {'L': L, 'a': a, 'b': b, 'nitidez': nitidez, 'grano': float(np.mean(residuos)) if residuos else float('nan')}


def embedding(reconocedor, imagen, cara):
    f = reconocedor.feature(reconocedor.alignCrop(imagen, cara)).flatten().astype(float)
    return f / np.linalg.norm(f)


def expandir(entradas):
    for e in map(Path, entradas):
        if e.is_dir():
            yield from sorted(p for p in e.iterdir() if p.suffix.lower() in EXTENSIONES)
        else:
            yield e


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--modelos', required=True, type=Path)
    parser.add_argument('--semilla', required=True, action='append', type=Path)
    parser.add_argument('--salida', required=True, type=Path)
    parser.add_argument('entradas', nargs='+')
    args = parser.parse_args()

    detector = cv2.FaceDetectorYN.create(str(args.modelos / DETECTOR), '', (320, 320), 0.7, 0.3, 50)
    reconocedor = cv2.FaceRecognizerSF.create(str(args.modelos / RECONOCEDOR), '')

    semillas = []
    for s in args.semilla:
        img = leer(s)
        cara = detectar(detector, img)
        if cara is None:
            raise SystemExit(f'no hay cara detectable en la semilla {s}')
        semillas.append(embedding(reconocedor, img, cara))
    referencia = np.mean(semillas, axis=0)
    referencia /= np.linalg.norm(referencia)

    filas = []
    for ruta in expandir(args.entradas):
        img = leer(ruta)
        fila = {'archivo': str(ruta), 'ancho': img.shape[1], 'alto': img.shape[0]}
        cara = detectar(detector, img)
        if cara is None:
            fila['nota'] = 'sin cara detectada'
        else:
            fila.update({'cara_px': int(cara[3]), 'deteccion': round(float(cara[14]), 3),
                         'identidad': round(float(embedding(reconocedor, img, cara) @ referencia), 3)})
            fila.update({k: round(v, 2) for k, v in calibracion(img, cara).items()})
        filas.append(fila)

    campos = ['archivo', 'ancho', 'alto', 'cara_px', 'deteccion', 'identidad', 'L', 'a', 'b', 'nitidez', 'grano', 'nota']
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    with args.salida.open('w', newline='', encoding='utf-8') as f:
        escritor = csv.DictWriter(f, fieldnames=campos)
        escritor.writeheader()
        escritor.writerows(filas)

    print(f'{"archivo":<48}{"cara_px":>8}{"ident":>7}{"L":>6}{"a":>6}{"b":>6}{"nitid":>8}{"grano":>7}')
    for r in filas:
        nombre = Path(r['archivo']).name[:46]
        if 'identidad' not in r:
            print(f'{nombre:<48}  {r.get("nota", "")}')
            continue
        print(f'{nombre:<48}{r["cara_px"]:>8}{r["identidad"]:>7.3f}{r["L"]:>6.1f}{r["a"]:>6.1f}{r["b"]:>6.1f}{r["nitidez"]:>8.0f}{r["grano"]:>7.2f}')
    print(f'\nCSV: {args.salida}')


if __name__ == '__main__':
    main()
