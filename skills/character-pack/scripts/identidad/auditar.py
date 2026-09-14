"""Auditoría objetiva de identidad: una ficha por imagen con números y checklist. Nunca autoaprueba.

Capas, medidas contra la vista equivalente del pack (--referencia) y contra la semilla:
- identidad: similitud coseno de SFace (OpenCV Zoo).
- geometria: distancias rígidas de la malla facial 3D de MediaPipe, normalizadas por la distancia
  entre pupilas; desvío % contra la referencia. La mandíbula primero, porque es la primera en derivar.
  boca_ancho se informa, pero no entra al máximo: depende de la expresión.
- proporcion: hombros (pose 11-12) ÷ ancho de cara (malla 234-454).
- logo: IoU de la silueta blanca del pecho izquierdo contra el logo oficial (solo si el pecho se ve).
- calibracion: color de piel (a*, b*), nitidez y grano, con las funciones de pack_medir.py.
Con --umbrales cada capa sale ok / falla / n/a. Sin --umbrales solo mide (modo calibración).

Uso: python auditar.py --modelos carpeta --semilla img [--referencia img] [--umbrales umbrales.json]
         [--logo logo.png] --salida carpeta imagen_o_carpeta[@@referencia_propia] [...]
"""
import argparse
import csv
import json
import math
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

from pack_medir import DETECTOR, RECONOCEDOR, calibracion, detectar, embedding, leer

EXTENSIONES = {'.png', '.jpg', '.jpeg', '.webp'}
LADO_MAX = 1600
PUPILAS = (468, 473)
GEOMETRIA = {
    'mandibula': (172, 397),
    'pomulos': (234, 454),
    'nariz_ancho': (129, 358),
    'nariz_largo': (168, 2),
    'tercio_medio': (9, 2),
    'ojo_derecho': (33, 133),
    'ojo_izquierdo': (362, 263),
    'boca_ancho': (61, 291),
}
EXPRESIVAS = {'boca_ancho'}
# Posición relativa de la nariz entre los pómulos: fuera de este rango la vista no es frontal y la
# geometría 2D/3D, la proporción de hombros, el logo y el color de piel dejan de ser comparables.
# Medido: en perfil la distancia entre pupilas colapsa y la mandíbula da desvíos de 55-60%.
FRONTAL = (0.35, 0.65)
CARA_MIN_GRANO = 900


def expandir(entradas):
    for e in map(Path, entradas):
        if e.is_dir():
            yield from sorted(p for p in e.iterdir() if p.suffix.lower() in EXTENSIONES)
        else:
            yield e


def recortar(binaria):
    ys, xs = np.nonzero(binaria)
    if len(xs) == 0:
        return None
    return binaria[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def logo_oficial(ruta):
    img = cv2.imdecode(np.fromfile(str(ruta), dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    base = img[..., 3] if img.ndim == 3 and img.shape[2] == 4 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return recortar((base > 127).astype(np.uint8))


def medir_logo(bgr, pose, malla, oficial):
    """IoU contra el logo oficial, o None si el pecho izquierdo de quien lo lleva no mira a cámara."""
    h, w = bgr.shape[:2]
    nariz_x = malla[1].x * w
    hombro_izq_x, hombro_der_x = pose[11].x * w, pose[12].x * w
    if hombro_izq_x <= nariz_x:
        return None
    ancho = abs(hombro_izq_x - hombro_der_x)
    y0 = (pose[11].y + pose[12].y) / 2 * h
    roi = bgr[int(y0):int(min(h, y0 + 0.7 * ancho)), int(nariz_x):int(hombro_izq_x)]
    if roi.size == 0:
        return None
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    blanco = ((hsv[..., 2] > 170) & (hsv[..., 1] < 70)).astype(np.uint8)
    n, etiquetas, stats, _ = cv2.connectedComponentsWithStats(blanco, 8)
    minimo = 0.0005 * roi.shape[0] * roi.shape[1]
    comps = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= minimo]
    if not comps:
        return 0.0
    mayor = max(comps, key=lambda i: stats[i, cv2.CC_STAT_AREA])
    x, y, cw, ch = stats[mayor, :4]
    cx, cy = x + cw / 2, y + ch / 2
    # Suma las piezas cercanas a la mayor: la P, el 3 y los cuadros pueden quedar separados.
    cerca = [i for i in comps
             if abs(stats[i, 0] + stats[i, 2] / 2 - cx) < cw and abs(stats[i, 1] + stats[i, 3] / 2 - cy) < ch]
    detectado = recortar(np.isin(etiquetas, cerca).astype(np.uint8))
    oh, ow = oficial.shape
    tam = (256, max(1, round(256 * oh / ow)))
    a = cv2.resize(detectado, tam, interpolation=cv2.INTER_NEAREST).astype(bool)
    b = cv2.resize(oficial, tam, interpolation=cv2.INTER_NEAREST).astype(bool)
    return round(float((a & b).sum() / max(1, (a | b).sum())), 3)


class Medidor:
    def __init__(self, modelos):
        self.detector = cv2.FaceDetectorYN.create(str(modelos / DETECTOR), '', (320, 320), 0.7, 0.3, 50)
        self.reconocedor = cv2.FaceRecognizerSF.create(str(modelos / RECONOCEDOR), '')
        self.pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(modelos / 'pose_landmarker_heavy.task')), num_poses=1))
        self.malla = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(modelos / 'face_landmarker.task')), num_faces=1))

    def medir(self, ruta, logo=None):
        bgr = leer(ruta)
        h, w = bgr.shape[:2]
        m = {'archivo': Path(ruta).name}
        cara = detectar(self.detector, bgr)
        if cara is not None:
            m['embedding'] = embedding(self.reconocedor, bgr, cara)
            m['cara_px'] = int(cara[3])
            m['calibracion'] = calibracion(bgr, cara)
        escala = min(1.0, LADO_MAX / max(h, w))
        chica = cv2.resize(bgr, (round(w * escala), round(h * escala)), interpolation=cv2.INTER_AREA) if escala < 1 else bgr
        ch, cw = chica.shape[:2]
        imagen = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(chica, cv2.COLOR_BGR2RGB))
        rm, rp = self.malla.detect(imagen), self.pose.detect(imagen)
        if rm.face_landmarks:
            f = rm.face_landmarks[0]
            pts = np.array([[p.x * cw, p.y * ch, p.z * cw] for p in f])
            base = np.linalg.norm(pts[PUPILAS[0]] - pts[PUPILAS[1]])
            m['geometria'] = {k: float(np.linalg.norm(pts[a] - pts[b]) / base) for k, (a, b) in GEOMETRIA.items()}
            m['nariz_rel'] = round((f[1].x - f[234].x) / ((f[454].x - f[234].x) or 1e-6), 2)
            if rp.pose_landmarks:
                p = rp.pose_landmarks[0]
                hombros = math.hypot((p[11].x - p[12].x) * cw, (p[11].y - p[12].y) * ch)
                m['proporcion'] = round(hombros / math.hypot((f[234].x - f[454].x) * cw, (f[234].y - f[454].y) * ch), 3)
                if logo is not None:
                    m['logo_iou'] = medir_logo(chica, p, f, logo)
        return m


def comparar(m, ref, sem):
    fila = {'archivo': m['archivo'], 'cara_px': m.get('cara_px'), 'nariz_rel': m.get('nariz_rel'),
            'proporcion': m.get('proporcion'), 'logo_iou': m.get('logo_iou')}
    if 'embedding' in m:
        fila['identidad_semilla'] = round(float(m['embedding'] @ sem['embedding']), 3)
        if 'embedding' in ref:
            fila['identidad_referencia'] = round(float(m['embedding'] @ ref['embedding']), 3)
    if 'geometria' in m and 'geometria' in ref:
        desvios = {k: (m['geometria'][k] / ref['geometria'][k] - 1) * 100 for k in GEOMETRIA}
        fila.update({f'geo_{k}_pct': round(v, 1) for k, v in desvios.items()})
        fila['geo_max_pct'] = round(max(abs(v) for k, v in desvios.items() if k not in EXPRESIVAS), 1)
    # Color y grano contra la semilla: es el objetivo de calibración del pack. Contra la vista
    # equivalente fallaba en vistas de la semilla que solo se llevaron a formato (41, 46).
    if 'calibracion' in m and 'calibracion' in sem:
        c, s = m['calibracion'], sem['calibracion']
        fila['delta_ab'] = round(math.hypot(c['a'] - s['a'], c['b'] - s['b']), 1)
        # Con la cara chica (planos abiertos) el grano medido en la mejilla no es confiable.
        fila['grano_rel'] = round(c['grano'] / s['grano'], 2) if s['grano'] and (m.get('cara_px') or 0) >= CARA_MIN_GRANO else None
    fila['frontal'] = m.get('nariz_rel') is not None and FRONTAL[0] <= m['nariz_rel'] <= FRONTAL[1]
    return fila


def veredicto(fila, u):
    def rango(valor, minimo=None, maximo=None):
        if valor is None:
            return 'n/a'
        return 'ok' if (minimo is None or valor >= minimo) and (maximo is None or valor <= maximo) else 'falla'

    checks = {
        'identidad': rango(fila.get('identidad_referencia'), minimo=u['identidad_referencia_min']),
        'mandibula': rango(abs(fila['geo_mandibula_pct']) if 'geo_mandibula_pct' in fila else None, maximo=u['geo_mandibula_max_pct']),
        'geometria': rango(fila.get('geo_max_pct'), maximo=u['geo_max_pct']),
        'proporcion': rango(fila.get('proporcion'), *u['proporcion']),
        # Logo bajo no descarta: el pelo suele taparlo (medido en P3 v2). Lo decide el ojo humano.
        'logo': {'falla': 'revisar'}.get(rango(fila.get('logo_iou'), minimo=u['logo_iou_min']), rango(fila.get('logo_iou'), minimo=u['logo_iou_min'])) if u.get('exigir_logo') else 'n/a',
        'color': rango(fila.get('delta_ab'), maximo=u['delta_ab_max']),
        'grano': rango(fila.get('grano_rel'), *u['grano_rel']),
    }
    if not fila.get('frontal'):
        # Vista en ángulo: solo la identidad contra su vista equivalente es comparable.
        checks.update({k: 'n/a' for k in ('mandibula', 'geometria', 'proporcion', 'logo', 'color')})
    fila.update({f'check_{k}': v for k, v in checks.items()})
    if 'falla' in checks.values():
        fila['estado'] = 'NO PASA'
    elif 'revisar' in checks.values():
        fila['estado'] = 'pasa, con logo a revisar: falta revisión humana'
    else:
        fila['estado'] = 'pasa los números: falta revisión humana'
    return fila


CHECKLIST_HUMANO = [
    'Es la misma persona (mirar mandíbula primero: un ensanchamiento sutil es la primera señal de deriva)',
    'Largo y raya del pelo como en la referencia',
    'Proporciones del cuerpo y ancho de hombros',
    'Vestuario canónico presente, del color correcto, con el logo legible',
    'Sin detalles de piel nuevos ni exagerados (no se nombran en el prompt: se exageran)',
    'Sin personajes ni texto no pedidos',
    'Tono de piel coherente con la luz de la escena (no confundir deriva con iluminación)',
]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--modelos', required=True, type=Path)
    parser.add_argument('--semilla', required=True, type=Path)
    parser.add_argument('--referencia', type=Path)
    parser.add_argument('--umbrales', type=Path)
    parser.add_argument('--logo', type=Path)
    parser.add_argument('--salida', required=True, type=Path)
    parser.add_argument('imagenes', nargs='+')
    args = parser.parse_args()

    medidor = Medidor(args.modelos)
    logo = logo_oficial(args.logo) if args.logo else None
    semilla = medidor.medir(args.semilla)
    if 'embedding' not in semilla:
        raise SystemExit(f'No se detecta una cara en la semilla {args.semilla}: elegir otra imagen o recortarla.')
    referencia = medidor.medir(args.referencia) if args.referencia else semilla
    umbrales = json.loads(args.umbrales.read_text(encoding='utf-8')) if args.umbrales else None

    filas, referencias = [], {}
    for spec in args.imagenes:
        # "imagen@@referencia" audita esa imagen contra su propia vista equivalente del pack.
        ruta, _, propia = spec.partition('@@')
        ref = referencia
        if propia:
            referencias.setdefault(propia, medidor.medir(Path(propia)))
            ref = referencias[propia]
        for imagen in expandir([ruta]):
            fila = comparar(medidor.medir(imagen, logo), ref, semilla)
            fila['referencia'] = Path(propia).name if propia else (args.referencia or args.semilla).name
            filas.append(veredicto(fila, umbrales) if umbrales else fila)

    args.salida.mkdir(parents=True, exist_ok=True)
    campos = list(dict.fromkeys(k for f in filas for k in f))
    with (args.salida / 'auditoria.csv').open('w', newline='', encoding='utf-8') as f:
        escritor = csv.DictWriter(f, fieldnames=campos)
        escritor.writeheader()
        escritor.writerows(filas)

    lineas = [f'# Auditoría de identidad', '', f'- Semilla: `{args.semilla.name}`',
              f'- Referencia: `{(args.referencia or args.semilla).name}`',
              f'- Umbrales: `{args.umbrales.name}`' if args.umbrales else '- Sin umbrales: modo calibración', '']
    for f in filas:
        lineas.append(f'## {f["archivo"]}  (referencia: {f["referencia"]})')
        if umbrales:
            lineas.append(f'**{f["estado"]}**')
        lineas.append('')
        lineas.append('| Capa | Valor | Check |')
        lineas.append('|---|---|---|')
        for capa, clave in [('identidad', 'identidad_referencia'), ('mandibula', 'geo_mandibula_pct'),
                            ('geometria', 'geo_max_pct'), ('proporcion', 'proporcion'), ('logo', 'logo_iou'),
                            ('color', 'delta_ab'), ('grano', 'grano_rel')]:
            lineas.append(f'| {capa} | {f.get(clave)} | {f.get("check_" + capa, "-")} |')
        lineas += ['', 'Revisión humana (sin tildar):'] + [f'- [ ] {c}' for c in CHECKLIST_HUMANO] + ['']
    (args.salida / 'auditoria.md').write_text('\n'.join(lineas), encoding='utf-8')

    cols = ['identidad_referencia', 'identidad_semilla', 'geo_mandibula_pct', 'geo_max_pct', 'proporcion', 'logo_iou', 'delta_ab', 'grano_rel']
    print(f'{"archivo":<46}' + ''.join(f'{c[:10]:>11}' for c in cols) + ('  estado' if umbrales else ''))
    for f in filas:
        print(f'{f["archivo"][:44]:<46}' + ''.join(f'{str(f.get(c, "")):>11}' for c in cols) + (f'  {f["estado"]}' if umbrales else ''))
    print(f'\n{args.salida / "auditoria.csv"}\n{args.salida / "auditoria.md"}')


if __name__ == '__main__':
    main()
