#!/usr/bin/env node
// Arma un contact sheet de los keyframes de una pieza: la referencia de
// identidad del pack al lado de cada keyframe generado, con el índice y el
// estado_keyframe rotulados encima de cada tile.
//
// Existe porque un campo "estado_keyframe: pendiente/aprobado" en el JSON no
// alcanza para revisar consistencia — hace falta VER todos los keyframes de
// la pieza uno al lado del otro, y al lado de la referencia, para notar
// deriva de cara, vestuario o luz entre planos antes de gastar en video.
//
// uso: node armar-contact-sheet.mjs --shot-list <archivo> [--keyframes-dir <dir>] --out <archivo.png>

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Fuente explícita: en este build de ffmpeg en Windows, drawtext sin fontfile
// hace segfault (fontconfig no está configurado). Cualquier .ttf del sistema
// sirve; Arial está garantizada en toda instalación de Windows. El ':' de la
// unidad hay que escaparlo para el parser de filtros de ffmpeg.
// WINDIR trae backslashes ("C:\WINDOWS"); ffmpeg necesita forward slashes y el
// ':' de la unidad escapado para su parser de filtros — mezclar separadores
// acá rompe drawtext con un error de fontconfig que no dice la causa real.
const FONT = ((process.env.WINDIR || "C:/Windows") + "/Fonts/arial.ttf").replaceAll("\\", "/");
const FONT_FFMPEG = FONT.replace(":", "\\:");

function run(args) {
  const r = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg falló:\n${(r.stderr || "").split("\n").slice(-10).join("\n")}`);
  return r;
}

function leerJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

function args() {
  const a = process.argv.slice(2);
  const get = (n, def) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] ? a[i + 1] : def; };
  return {
    shotList: get("shot-list", null),
    keyframesDir: get("keyframes-dir", null),
    out: get("out", null),
  };
}

function existeArchivo(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

// Encuentra la imagen que representa a un plano, en orden de preferencia:
// keyframe_final (si existe, es el estado más informativo) > keyframe_inicial
// > un archivo plano-XX-kf.png en la carpeta de keyframes > el activo del
// pack como último recurso > ninguno (placeholder).
function resolverImagenPlano(p, dirBase, keyframesDir, packDir) {
  const candidatos = [];
  if (p.keyframe_final) candidatos.push({ ruta: path.isAbsolute(p.keyframe_final) ? p.keyframe_final : path.join(dirBase, p.keyframe_final), etiqueta: "final" });
  if (p.keyframe_inicial) candidatos.push({ ruta: path.isAbsolute(p.keyframe_inicial) ? p.keyframe_inicial : path.join(dirBase, p.keyframe_inicial), etiqueta: "inicial" });
  if (keyframesDir) {
    const idx = String(p.indice).padStart(2, "0");
    for (const nombre of [`plano-${idx}-kf.png`, `plano-${idx}.png`]) {
      candidatos.push({ ruta: path.join(keyframesDir, nombre), etiqueta: "kf" });
    }
  }
  if (p.activo_identidad && packDir) {
    candidatos.push({ ruta: path.join(packDir, p.activo_identidad), etiqueta: "pack (sin keyframe propio)" });
  }
  return candidatos.find((c) => existeArchivo(c.ruta)) || null;
}

function main() {
  const { shotList, keyframesDir, out } = args();
  if (!shotList || !out) {
    console.error("uso: node armar-contact-sheet.mjs --shot-list <archivo> [--keyframes-dir <dir>] --out <archivo.png>");
    process.exit(2);
  }

  const dirBase = path.dirname(path.resolve(shotList));
  const doc = leerJson(shotList);
  const dirKeyframes = keyframesDir ? path.resolve(keyframesDir) : path.join(dirBase, "generado");

  let packDir = null, packDoc = null;
  if (doc.personaje?.character_pack) {
    const rutaPack = path.isAbsolute(doc.personaje.character_pack) ? doc.personaje.character_pack : path.join(dirBase, doc.personaje.character_pack);
    if (existeArchivo(rutaPack)) {
      packDoc = leerJson(rutaPack);
      packDir = path.dirname(rutaPack);
    }
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shot-builder-contact-"));
  const TILE_W = 320;
  const TILE_H = 480; // fijo: keyframes 9:16 y referencias del pack no comparten aspecto
  const tiles = [];

  // La referencia de identidad del pack va primero, para poder comparar
  // cada keyframe contra ella con el ojo, no solo entre sí.
  if (packDoc && packDir) {
    const refPrincipal = packDoc.activos?.turnaround?.[0]?.archivo;
    if (refPrincipal) {
      const rutaRef = path.join(packDir, refPrincipal);
      if (existeArchivo(rutaRef)) {
        const tile = path.join(tmp, "tile-000-ref.png");
        etiquetarTile(rutaRef, tile, `REF: ${packDoc.personaje?.nombre || ""}`, TILE_W, TILE_H);
        tiles.push(tile);
      }
    }
  }

  const faltantes = [];
  for (const p of doc.planos) {
    const encontrado = resolverImagenPlano(p, dirBase, dirKeyframes, packDir);
    const idx = String(p.indice).padStart(2, "0");
    if (!encontrado) {
      faltantes.push(p.indice);
      continue;
    }
    const estado = p.estado_keyframe || "sin estado";
    const etiqueta = `#${idx} [${encontrado.etiqueta}] ${estado}`;
    const tile = path.join(tmp, `tile-${idx}.png`);
    etiquetarTile(encontrado.ruta, tile, etiqueta, TILE_W, TILE_H);
    tiles.push(tile);
  }

  if (!tiles.length) {
    console.error("No se encontró ningún keyframe ni referencia para armar el contact sheet.");
    process.exit(1);
  }

  const columnas = Math.min(4, tiles.length);
  const filas = Math.ceil(tiles.length / columnas);
  const inputs = tiles.flatMap((t) => ["-i", t]);
  // tile normalmente recibe los frames secuenciales de UNA sola entrada (así
  // se armó el contact sheet de video-reference-scanner, con un patrón
  // shot-%03d.png). Acá los tiles vienen de N archivos sueltos con nombres no
  // secuenciales — sin encadenarlos primero, filter_complex con "tile=..." a
  // secas solo toma el primer input y rellena el resto de la grilla en
  // blanco. concat los une en un solo stream de frames antes de tile.
  const etiquetas = tiles.map((_, i) => `[${i}:v]`).join("");
  run([
    "-v", "error",
    ...inputs,
    "-filter_complex", `${etiquetas}concat=n=${tiles.length}:v=1:a=0,tile=${columnas}x${filas}:margin=8:padding=6:color=white`,
    "-y", out,
  ]);

  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`Contact sheet: ${out} (${tiles.length} imagen(es), grilla ${columnas}x${filas})`);
  if (faltantes.length) {
    console.log(`Sin keyframe ni referencia todavía: plano(s) ${faltantes.join(", ")}.`);
  }
}

// tile exige que todas las entradas tengan EXACTAMENTE el mismo tamaño — ya se
// rompió una vez con el contact sheet del escáner por este motivo. Acá el
// riesgo es mayor: los keyframes generados (768x1376, retrato 9:16) y la
// referencia de identidad del pack (768x1024) tienen aspectos distintos.
// Forzar un lienzo fijo con pad blanco, no un alto proporcional variable.
function etiquetarTile(origen, destino, texto, ancho, alto) {
  const escapado = texto.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'");
  run([
    "-v", "error", "-i", origen,
    // setsar=1 al final: imágenes de origen distinto (foto real vs. png
    // generado) traen SAR distinto aunque el tamaño en píxeles ya coincida —
    // concat lo rechaza igual que rechazaría un tamaño distinto.
    "-vf", `scale=${ancho}:${alto}:force_original_aspect_ratio=decrease,pad=${ancho}:${alto}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1,drawtext=fontfile='${FONT_FFMPEG}':text='${escapado}':fontcolor=white:fontsize=14:box=1:boxcolor=black@0.6:boxborderw=4:x=6:y=6`,
    "-y", destino,
  ]);
}

main();
