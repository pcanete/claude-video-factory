"""Consolida los registro.ndjson de un personaje en un ledger.csv único (una fila por generación).

Cada herramienta de generación escribe su registro.ndjson junto a sus salidas. Este script los junta
para que cualquier deriva se pueda rastrear: qué modelo, con qué referencias, con qué prompt y con
qué costo salió cada archivo. Si un modelo cambia de versión en silencio, el ledger es lo que lo
muestra.

Uso: python ledger.py --raiz carpeta_del_personaje --salida ledger.csv
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path

CAMPOS = ['fecha', 'lote_id', 'modelo', 'plataforma', 'refs_usadas', 'prompt_id', 'parametros',
          'costo_estimado_usd', 'archivos', 'carpeta', 'resultado', 'deriva_notas']


def referencias(body):
    refs = []
    for clave in ('image_url', 'image_urls', 'mask_url'):
        valor = body.get(clave)
        for v in (valor if isinstance(valor, list) else [valor] if valor else []):
            refs.append(Path(str(v).removeprefix('@archivo:')).name)
    return ';'.join(refs)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--raiz', required=True, type=Path)
    parser.add_argument('--salida', required=True, type=Path)
    args = parser.parse_args()

    filas = []
    for registro in sorted(args.raiz.rglob('registro.ndjson')):
        for linea in registro.read_text(encoding='utf-8').splitlines():
            if not linea.strip():
                continue
            e = json.loads(linea)
            body = e.get('body', {})
            prompt = body.get('prompt', '')
            filas.append({
                'fecha': e.get('ts', ''),
                'lote_id': e.get('request_id', ''),
                'modelo': e.get('endpoint', ''),
                'plataforma': 'fal.ai',
                'refs_usadas': referencias(body),
                'prompt_id': hashlib.sha1(prompt.encode('utf-8')).hexdigest()[:10] if prompt else '',
                'parametros': json.dumps({k: v for k, v in body.items()
                                          if k not in ('prompt', 'image_url', 'image_urls', 'mask_url')}, ensure_ascii=False),
                'costo_estimado_usd': e.get('costo_estimado_usd', ''),
                'archivos': ';'.join(e.get('files', [])),
                'carpeta': str(registro.parent.relative_to(args.raiz)),
                'resultado': '',
                'deriva_notas': '',
            })
    filas.sort(key=lambda f: f['fecha'])
    with args.salida.open('w', newline='', encoding='utf-8-sig') as f:
        escritor = csv.DictWriter(f, fieldnames=CAMPOS)
        escritor.writeheader()
        escritor.writerows(filas)
    total = sum(float(f['costo_estimado_usd'] or 0) for f in filas)
    print(f'{len(filas)} generaciones, costo estimado USD {total:.2f} -> {args.salida}')


if __name__ == '__main__':
    main()
