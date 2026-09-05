#!/usr/bin/env node
// Segunda pasada sobre un video ya escaneado: extrae frames densos por plano,
// a resolución suficiente para LEER contenido (vestuario, props, texto en
// pantalla, marcas, acción), no solo para medirlo.
//
// Motivo: scan.mjs deja un frame por plano. Alcanza para medir luz y armar una
// hoja de contacto, pero no para que el agente pueda decir qué hay en cuadro —
// y esa lectura es la que después permite decidir, elemento por elemento, qué
// se mantiene, qué se cambia y qué se descarta. La decisión es posterior a la
// lectura, nunca al revés: por eso esta pasada no filtra nada, extrae todo.
//
// uso: node escanear-contenido.mjs --video <archivo> --evidencia <VIDEO_EVIDENCE.json> --out <directorio> [--ancho 720]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function args() {
  const a = process.argv.slice(2);
  const get = (n, def) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] ? a[i + 1] : def; };
  return {
    video: get("video", null),
    evidencia: get("evidencia", null),
    out: get("out", null),
    ancho: Number(get("ancho", "720")),
  };
}

function run(bin, argv, { allowFail = false } = {}) {
  const r = spawnSync(bin, argv, { encoding: "utf8" });
  if (r.status !== 0 && !allowFail) {
    throw new Error(`${bin} falló: ${(r.stderr || "").slice(-400)}`);
  }
  return r;
}

// drawtext sin fontfile explícito revienta en Windows cuando fontconfig no
// está configurado. Ya pasó una vez y costó un rato encontrarlo.
function fuenteFfmpeg() {
  const dir = (process.env.WINDIR || "C:/Windows").replaceAll("\\", "/");
  const candidatas = [`${dir}/Fonts/arial.ttf`, "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"];
  for (const c of candidatas) if (existsSync(c)) return c.replace(":", "\\:");
  return null;
}

// Cuántos frames merece un plano: los cortos se leen con dos, los largos
// esconden acción y cambios de encuadre en el medio.
function cuantosFrames(duracion) {
  if (duracion < 1.0) return 2;
  if (duracion < 3.0) return 3;
  if (duracion < 6.0) return 4;
  return 5;
}

// Muestreo hacia adentro del plano: los bordes suelen caer sobre la
// transición y devuelven un cuadro mezclado que no representa a ninguno.
function tiempos(inicio, fin, n) {
  const dur = fin - inicio;
  const margen = Math.min(0.12, dur * 0.12);
  const a = inicio + margen;
  const b = fin - margen;
  if (n === 1) return [(a + b) / 2];
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

function extraerFrame(video, t, destino, ancho) {
  run("ffmpeg", ["-v", "error", "-ss", String(t), "-i", video,
    "-frames:v", "1", "-vf", `scale=${ancho}:-2`, "-y", destino]);
}

function etiquetar(origen, destino, texto, fuente) {
  if (!fuente) { run("ffmpeg", ["-v", "error", "-i", origen, "-y", destino]); return; }
  const escapado = texto.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'");
  run("ffmpeg", ["-v", "error", "-i", origen, "-vf",
    `setsar=1,drawtext=fontfile='${fuente}':text='${escapado}':fontcolor=white:fontsize=22:box=1:boxcolor=black@0.65:boxborderw=6:x=10:y=10`,
    "-y", destino]);
}

function main() {
  const { video, evidencia, out, ancho } = args();
  if (!video || !evidencia || !out) {
    console.error("uso: node escanear-contenido.mjs --video <archivo> --evidencia <VIDEO_EVIDENCE.json> --out <directorio> [--ancho 720]");
    process.exit(2);
  }

  const ev = JSON.parse(readFileSync(evidencia, "utf8"));
  if (ev.contrato !== "VIDEO_EVIDENCE") {
    console.error(`ERROR: ${evidencia} no es un VIDEO_EVIDENCE (contrato: ${ev.contrato})`);
    process.exit(1);
  }

  const dirFrames = join(out, "contenido");
  mkdirSync(dirFrames, { recursive: true });
  const fuente = fuenteFfmpeg();

  const manifiesto = { contrato: "COBERTURA_CONTENIDO", generado: new Date().toISOString(), ancho_px: ancho, planos: [] };

  for (const p of ev.planos) {
    const id = String(p.indice).padStart(2, "0");
    const n = cuantosFrames(p.duracion_s);
    const ts = tiempos(p.inicio_s, p.fin_s, n);
    const tiles = [];

    ts.forEach((t, i) => {
      const crudo = join(dirFrames, `.tmp-${id}-${i}.png`);
      const tile = join(dirFrames, `p${id}-${i}.png`);
      extraerFrame(video, t, crudo, ancho);
      etiquetar(crudo, tile, `plano ${id} · ${t.toFixed(2)}s`, fuente);
      tiles.push(tile);
    });

    // Una tira por plano: el orden temporal dentro del plano es la mitad de
    // la información — si el sujeto entra, gira o el encuadre cambia, se ve acá
    // y no en un frame suelto del medio.
    const tira = join(dirFrames, `plano-${id}.png`);
    const entradas = tiles.flatMap((t) => ["-i", t]);
    const etiquetas = tiles.map((_, i) => `[${i}:v]`).join("");
    run("ffmpeg", ["-v", "error", ...entradas, "-filter_complex",
      `${etiquetas}hstack=inputs=${tiles.length}`, "-y", tira], { allowFail: true });

    manifiesto.planos.push({
      indice: p.indice,
      inicio_s: p.inicio_s,
      fin_s: p.fin_s,
      duracion_s: p.duracion_s,
      frames: ts.map((t) => Number(t.toFixed(2))),
      tira: `contenido/plano-${id}.png`,
    });
  }

  writeFileSync(join(out, "COBERTURA_CONTENIDO.json"), JSON.stringify(manifiesto, null, 2) + "\n", "utf8");

  const total = manifiesto.planos.reduce((s, p) => s + p.frames.length, 0);
  console.log(`Contenido extraído: ${manifiesto.planos.length} plano(s), ${total} frames a ${ancho}px.`);
  console.log(`  tiras por plano en ${dirFrames}`);
  console.log(`  cobertura declarada en COBERTURA_CONTENIDO.json`);
  console.log("");
  console.log("Siguiente paso: MIRAR las tiras y escribir la lectura de contenido.");
  console.log("Lo que no se miró no se declara como leído — ver references/lectura-de-contenido.md.");
}

main();
