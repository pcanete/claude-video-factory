#!/usr/bin/env node
// Motor de medición del escáner de video de referencia.
//
// Regla que ordena este archivo: el script MIDE, el agente INTERPRETA.
// Acá no se decide si un plano es "medio" ni si la luz es "cálida". Se extraen
// hechos verificables y se dejan los frames en disco; la lectura cinematográfica
// la hace el agente mirándolos.
//
// Sin dependencias: Node nativo + ffmpeg/ffprobe + (para URLs) python -m yt_dlp.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";

import { analizarPlano } from "./lib/movimiento.mjs";
import { serieSignalstats, resumirTramo, medirTexturaEspacial } from "./lib/fotografia.mjs";
import * as transiciones from "./lib/transiciones.mjs";
import * as audioLib from "./lib/audio.mjs";

// Resolución reducida para el análisis de movimiento. 128x72 alcanza: la
// correlación trabaja sobre perfiles, no sobre detalle.
const MOV_W = 128, MOV_H = 72, MOV_FPS = 10;

const MODOS = {
  rapido: { motion: false, fotografia: true, audio: false, textura: false, tiras: false },
  estandar: { motion: true, fotografia: true, audio: true, textura: false, tiras: true },
  forense: { motion: true, fotografia: true, audio: true, textura: true, tiras: true },
};

// ---------------------------------------------------------------- utilidades

function run(cmd, args, { capture = "stdout", allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { encoding: "buffer", maxBuffer: 1 << 28 });
  if (r.error) {
    if (allowFail) return null;
    throw new Error(`no se pudo ejecutar ${cmd}: ${r.error.message}`);
  }
  if (r.status !== 0 && !allowFail) {
    const err = (r.stderr || Buffer.alloc(0)).toString("utf8").split("\n").slice(-15).join("\n");
    throw new Error(`${cmd} salió con código ${r.status}:\n${err}`);
  }
  if (capture === "buffer") return r.stdout;
  if (capture === "stderr") return (r.stderr || Buffer.alloc(0)).toString("utf8");
  return (r.stdout || Buffer.alloc(0)).toString("utf8");
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const fail = (m) => { console.error(`ERROR: ${m}`); process.exit(1); };
const log = (m) => console.error(m);

// -------------------------------------------------------------------- fetch

function fetchVideo(source, outDir) {
  if (!/^https?:\/\//i.test(source)) {
    const p = resolve(source);
    if (!existsSync(p)) fail(`no existe el archivo: ${p}`);
    return p;
  }
  mkdirSync(outDir, { recursive: true });
  log("bajando referencia con yt-dlp...");
  // `python -m yt_dlp` y no el ejecutable: el .exe no queda en PATH y en esta
  // máquina el PATH no se toca.
  run("python", ["-m", "yt_dlp",
    "-f", "bv*[height<=1080]+ba/b[height<=1080]/b",
    "--merge-output-format", "mp4", "--no-playlist",
    "-o", join(outDir, "fuente.%(ext)s"), source], { capture: "stderr" });
  const cand = readdirSync(outDir).filter((f) => f.startsWith("fuente."));
  if (!cand.length) fail("yt-dlp no dejó ningún archivo 'fuente.*'");
  return join(outDir, cand[0]);
}

// -------------------------------------------------------------------- probe

function probe(video) {
  const d = JSON.parse(run("ffprobe",
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", video]));
  const v = d.streams.find((s) => s.codec_type === "video");
  const a = d.streams.find((s) => s.codec_type === "audio");
  if (!v) fail("el archivo no tiene pista de video");
  const [num, den] = (v.r_frame_rate || "0/1").split("/").map(Number);
  const fps = den ? num / den : null;
  return {
    archivo: basename(video),
    duracion_s: round(Number(d.format.duration)),
    contenedor: (d.format.format_name || "").split(",")[0],
    bitrate_kbps: d.format.bit_rate ? Math.round(Number(d.format.bit_rate) / 1000) : null,
    video: {
      codec: v.codec_name, ancho: v.width, alto: v.height,
      aspecto: round(v.width / v.height, 3),
      orientacion: v.width > v.height ? "horizontal" : v.width < v.height ? "vertical" : "cuadrado",
      fps: fps ? round(fps, 3) : null, pix_fmt: v.pix_fmt,
    },
    audio: a ? { codec: a.codec_name, sample_rate: Number(a.sample_rate), canales: a.channels } : null,
  };
}

// Barras negras: cambia la lectura del encuadre y delata reencuadres de formato.
function detectarBarras(video, duracion) {
  const t = Math.max(0.5, duracion * 0.35);
  const log_ = run("ffmpeg", ["-v", "info", "-ss", String(t), "-i", video,
    "-vf", "cropdetect=limit=24:round=2", "-frames:v", "40", "-f", "null", "-"],
    { capture: "stderr", allowFail: true }) || "";
  const m = [...log_.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].pop();
  return m ? { ancho: +m[1], alto: +m[2], x: +m[3], y: +m[4] } : null;
}

// -------------------------------------------------------------------- planos

// Una sola pasada guarda el score de cambio de escena de TODOS los cuadros.
// Filtrar después en memoria evita re-decodificar por cada umbral y permite ver
// la distribución: un umbral fijo falla feo en material gráfico.
function medirScores(video) {
  const salida = run("ffmpeg", ["-i", video,
    "-filter:v", "select='gt(scene,0)',metadata=print:file=-", "-f", "null", "-"],
    { capture: "stdout", allowFail: true }) || "";
  const scores = [];
  let t = null;
  for (const linea of salida.split("\n")) {
    const mt = linea.match(/pts_time:([0-9.]+)/);
    if (mt) { t = Number(mt[1]); continue; }
    const ms = linea.match(/lavfi\.scene_score=([0-9.eE+-]+)/);
    if (ms && t !== null) { scores.push({ t, score: Number(ms[1]) }); t = null; }
  }
  return scores;
}

function sugerirUmbral(scores, duracion) {
  if (!scores.length) return null;
  const orden = [...scores].sort((a, b) => b.score - a.score);
  const estimado = Math.max(2, Math.round(duracion / 4));
  const c = orden[Math.min(estimado, orden.length - 1)];
  return c ? round(c.score, 4) : null;
}

// Las detecciones muy juntas no son cortes separados: son una transición suave.
// Se agrupan, pero a diferencia de la v1 NO se descartan — cuántas se agruparon
// es la señal que después distingue una disolvencia de un corte seco.
function construirPlanos(cortes, duracion, minPlano) {
  const bordes = [0, ...cortes, duracion];
  const limpios = [bordes[0]];
  const agrupadas = new Map();
  for (const b of bordes.slice(1)) {
    const ultimo = limpios[limpios.length - 1];
    if (b - ultimo >= minPlano) limpios.push(b);
    else if (b < duracion) agrupadas.set(ultimo, (agrupadas.get(ultimo) ?? 0) + 1);
  }
  if (limpios[limpios.length - 1] < duracion) limpios[limpios.length - 1] = duracion;

  const planos = [];
  for (let i = 0; i < limpios.length - 1; i++) {
    planos.push({
      indice: i,
      inicio_s: round(limpios[i]),
      fin_s: round(limpios[i + 1]),
      duracion_s: round(limpios[i + 1] - limpios[i]),
    });
  }
  return { planos, agrupadas };
}

function extraerFrame(video, t, destino, ancho) {
  run("ffmpeg", ["-v", "error", "-ss", String(t), "-i", video,
    "-frames:v", "1", "-vf", `scale=${ancho}:-2`, "-y", destino]);
}

function contactSheet(dir, patron, destino, columnas) {
  const archivos = readdirSync(dir).filter((f) => f.startsWith(patron) && f.endsWith(".png"));
  if (!archivos.length) return null;
  const filas = Math.ceil(archivos.length / columnas);
  // Este build de ffmpeg en Windows no soporta -pattern_type glob.
  run("ffmpeg", ["-v", "error", "-i", join(dir, `${patron}%03d.png`),
    "-filter_complex", `tile=${columnas}x${filas}:margin=8:padding=6:color=white`,
    "-y", destino], { allowFail: true });
  return existsSync(destino)
    ? { archivo: basename(destino), planos: archivos.length, grilla: `${columnas}x${filas}` }
    : null;
}

// ----------------------------------------------------------------------- main

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help")) {
    console.log(`
uso: node scan.mjs <url-o-ruta> --out <directorio> [opciones]

  --out <dir>       directorio de salida (obligatorio)
  --modo <m>        rapido | estandar (default) | forense
  --umbral <n>      sensibilidad de corte (default 0.35)
  --min-plano <s>   por debajo se agrupa como transición (default 0.5)
  --ancho <px>      ancho de los frames extraídos (default 480)

modos:
  rapido   estructura de planos + fotografía. Sin movimiento ni audio.
  estandar todo lo anterior + movimiento de cámara medido + audio + transiciones.
  forense  además, textura de alta frecuencia (grano) — una pasada más de decodificación.
`);
    process.exit(0);
  }

  const source = args[0];
  const opt = (n, def) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
  const outDir = opt("out", null);
  if (!outDir) fail("falta --out <directorio>");
  const nombreModo = opt("modo", "estandar");
  const modo = MODOS[nombreModo];
  if (!modo) fail(`modo desconocido: ${nombreModo}. Usar rapido, estandar o forense.`);
  const umbral = Number(opt("umbral", "0.35"));
  const minPlano = Number(opt("min-plano", "0.5"));
  const ancho = Number(opt("ancho", "480"));

  const out = resolve(outDir);
  const framesDir = join(out, "frames");
  mkdirSync(framesDir, { recursive: true });

  const video = fetchVideo(source, out);
  log(`escaneando: ${basename(video)}  [modo ${nombreModo}]`);

  // --- ficha técnica -------------------------------------------------------
  const ficha = probe(video);
  const barras = detectarBarras(video, ficha.duracion_s);
  if (barras && (barras.ancho !== ficha.video.ancho || barras.alto !== ficha.video.alto)) {
    ficha.video.contenido_util = barras;
    ficha.video.nota_barras = "hay barras negras: el encuadre real es menor que el cuadro, probable reencuadre de formato";
  }
  log(`  ${ficha.duracion_s}s · ${ficha.video.ancho}x${ficha.video.alto} · ${ficha.video.fps}fps · ${ficha.video.orientacion}`);

  // --- estructura de planos ------------------------------------------------
  const scores = medirScores(video);
  const cortes = scores.filter((s) => s.score > umbral).map((s) => s.t).sort((a, b) => a - b);
  const { planos, agrupadas } = construirPlanos(cortes, ficha.duracion_s, minPlano);
  log(`  ${planos.length} planos`);

  const diagnostico = {};
  if (planos.length === 1 && ficha.duracion_s > 15) {
    diagnostico.aviso = "se detectó un solo plano en un video largo: probable falso negativo";
    diagnostico.causa_probable = "material gráfico o placas sobre fondo plano, donde el cambio global entre cuadros es bajo";
    diagnostico.umbral_sugerido = sugerirUmbral(scores, ficha.duracion_s);
    log(`  AVISO: un solo plano en ${ficha.duracion_s}s. Probá --umbral ${diagnostico.umbral_sugerido}`);
  }

  // Picos que quedaron apenas debajo del umbral y no coinciden con ningún
  // corte ya detectado. En montaje rápido de material visualmente homogéneo
  // —agua, piel, una sola paleta— un corte real puede no llegar nunca al
  // umbral, y la pieza se lee con menos planos y más lentos de los que tiene.
  //
  // No se baja el umbral: está calibrado y bajarlo a ojo rompe los casos que
  // hoy funcionan. Se declara la duda con timecodes concretos para ir a
  // mirarlos. Verificado contra material real: en una campaña deportiva de
  // 23,75s este aviso marcó t=2.97 y t=13.00, y los frames a ambos lados
  // confirmaron que eran cortes que la detección se había comido.
  const BANDA_BAJA = 0.6;
  const sospechosos = scores
    .filter((s) => s.score > umbral * BANDA_BAJA && s.score <= umbral)
    .filter((s) => !cortes.some((c) => Math.abs(c - s.t) < 0.4))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((s) => ({ t: s.t, score: Number(s.score.toFixed(4)) }))
    .sort((a, b) => a.t - b.t);

  if (sospechosos.length >= 3) {
    diagnostico.posible_subsegmentacion = {
      picos_bajo_umbral: sospechosos,
      lectura: `${sospechosos.length} picos entre ${(umbral * BANDA_BAJA).toFixed(2)} y ${umbral} sin corte asignado. ` +
        `La estructura de planos puede estar sub-segmentada: extraer frames a ambos lados de esos timecodes ` +
        `(escanear-contenido.mjs) antes de dar por buenos el conteo de planos, la duración media y los cortes por minuto.`,
    };
    log(`  AVISO: ${sospechosos.length} picos bajo umbral sin corte asignado — posible sub-segmentación`);
  }

  // --- fotografía por plano ------------------------------------------------
  let serieLuma = [];
  if (modo.fotografia) {
    serieLuma = serieSignalstats(video);
    log(`  fotografía: ${serieLuma.length} cuadros medidos`);
  }

  // --- movimiento de cámara ------------------------------------------------
  let grises = null, totalGris = 0;
  if (modo.motion) {
    grises = run("ffmpeg", ["-v", "error", "-i", video,
      "-vf", `fps=${MOV_FPS},scale=${MOV_W}:${MOV_H},format=gray`,
      "-f", "rawvideo", "-"], { capture: "buffer", allowFail: true });
    totalGris = grises ? Math.floor(grises.length / (MOV_W * MOV_H)) : 0;
  }

  // --- por plano: frame, fotografía, movimiento ----------------------------
  for (const p of planos) {
    const medio = p.inicio_s + p.duracion_s / 2;
    const nombre = `shot-${String(p.indice).padStart(3, "0")}.png`;
    extraerFrame(video, medio, join(framesDir, nombre), ancho);
    p.frame = `frames/${nombre}`;

    if (serieLuma.length) p.fotografia = resumirTramo(serieLuma, p.inicio_s, p.fin_s);

    if (grises && totalGris) {
      const desde = Math.min(totalGris - 2, Math.round(p.inicio_s * MOV_FPS) + 1);
      const hasta = Math.min(totalGris, Math.max(desde + 3, Math.round(p.fin_s * MOV_FPS) - 1));
      p.movimiento = analizarPlano(grises, MOV_W, MOV_H, desde, hasta, MOV_FPS);
    }

    // Tira de tres frames: sostiene visualmente lo que dice la medición.
    if (modo.tiras && p.duracion_s >= 1.0) {
      const margen = Math.min(0.35, p.duracion_s * 0.15);
      const id = String(p.indice).padStart(3, "0");
      const tiempos = [p.inicio_s + margen, medio, p.fin_s - margen];
      const partes = tiempos.map((t, i) => {
        const f = join(framesDir, `mov-${id}${"abc"[i]}.png`);
        extraerFrame(video, t, f, ancho);
        return f;
      });
      const tira = join(out, `motion-${id}.png`);
      run("ffmpeg", ["-v", "error", "-i", partes[0], "-i", partes[1], "-i", partes[2],
        "-filter_complex", "hstack=inputs=3", "-y", tira], { allowFail: true });
      if (existsSync(tira)) p.tira_movimiento = basename(tira);
    }
  }

  // --- transiciones --------------------------------------------------------
  let listaTransiciones = [], resumenTransiciones = null;
  if (serieLuma.length) {
    listaTransiciones = planos.slice(1).map((p) => ({
      t: p.inicio_s,
      entre: [p.indice - 1, p.indice],
      ...transiciones.clasificar(p.inicio_s, scores, serieLuma, agrupadas.get(p.inicio_s) ?? 0),
    }));
    resumenTransiciones = transiciones.resumir(listaTransiciones);
    if (resumenTransiciones) log(`  transiciones: ${resumenTransiciones.lectura}`);
  }

  // --- audio ---------------------------------------------------------------
  const audio = modo.audio ? audioLib.analizar(video, ficha.duracion_s, planos) : null;
  if (audio) {
    log(`  audio: ${audio.pista}${audio.tempo?.confianza === "alta" ? ` · ~${audio.tempo.bpm_estimado} BPM` : ""}`);
    if (audio.montaje_al_ritmo) log(`  montaje al ritmo: ${audio.montaje_al_ritmo}`);
  }

  // El audio ve estructura que la imagen no ve. No se fusionan: decide el agente.
  let cruce = null;
  if (audio && Array.isArray(audio.silencios) && audio.silencios.length) {
    const visuales = planos.slice(1).map((p) => round(p.inicio_s));
    const porAudio = audio.silencios
      .map((s) => round(s.inicio_s + s.duracion_s))
      .filter((t) => t > 0.5 && t < ficha.duracion_s - 0.5);
    const soloAudio = porAudio.filter((t) => !visuales.some((c) => Math.abs(c - t) <= 1.0));
    cruce = {
      cortes_visuales: visuales,
      limites_por_silencio: porAudio,
      limites_que_solo_ve_el_audio: soloAudio,
      nota: soloAudio.length
        ? "hay estructura audible que la detección visual no marcó: revisar esos tiempos antes de dar el desglose por cerrado"
        : "imagen y audio coinciden en la estructura",
    };
    if (soloAudio.length) log(`  el audio marca ${soloAudio.length} límite(s) que la imagen no vio: ${soloAudio.join(", ")}`);
  }

  // --- ritmo ---------------------------------------------------------------
  const dur = planos.map((p) => p.duracion_s);
  const med = dur.reduce((s, x) => s + x, 0) / dur.length;
  const ordenado = [...dur].sort((a, b) => a - b);
  const tercio = Math.max(1, Math.floor(dur.length / 3));
  const mediaDe = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const ritmo = {
    planos: planos.length,
    duracion_media_s: round(med),
    duracion_mediana_s: round(ordenado[Math.floor(ordenado.length / 2)]),
    plano_mas_corto_s: round(Math.min(...dur)),
    plano_mas_largo_s: round(Math.max(...dur)),
    desvio_s: round(Math.sqrt(dur.reduce((s, x) => s + (x - med) ** 2, 0) / dur.length)),
    cortes_por_minuto: round((planos.length - 1) / (ficha.duracion_s / 60), 1),
    por_tercio_s: dur.length >= 3
      ? [round(mediaDe(dur.slice(0, tercio))), round(mediaDe(dur.slice(tercio, 2 * tercio))), round(mediaDe(dur.slice(2 * tercio)))]
      : null,
  };
  if (ritmo.por_tercio_s) {
    const [a, , c] = ritmo.por_tercio_s;
    ritmo.evolucion = c < a * 0.75 ? "acelera hacia el final"
      : c > a * 1.35 ? "desacelera hacia el final" : "ritmo parejo";
  }

  const sheet = contactSheet(framesDir, "shot-", join(out, "contact.png"), 4);
  const textura = modo.textura ? medirTexturaEspacial(video) : null;

  // --- salida --------------------------------------------------------------
  const evidencia = {
    contrato: "VIDEO_EVIDENCE",
    version: "2.0.0",
    generado: new Date().toISOString(),
    modo: nombreModo,
    fuente: { entrada: source, archivo_local: basename(video) },
    ficha_tecnica: ficha,
    parametros_escaneo: { umbral_escena: umbral, min_plano_s: minPlano, ancho_frame_px: ancho },
    ritmo,
    transiciones: resumenTransiciones ? { resumen: resumenTransiciones, detalle: listaTransiciones } : null,
    diagnostico_deteccion: {
      ...diagnostico,
      picos_mas_altos: [...scores].sort((a, b) => b.score - a.score).slice(0, 40)
        .map((s) => ({ t: round(s.t), score: round(s.score, 4) })),
    },
    contact_sheet: sheet,
    textura_global: textura,
    audio,
    cruce_imagen_audio: cruce,
    planos,
    pendiente: [
      "transcripción de la pista hablada (no hay speech-to-text instalado)",
      "escala de plano y ángulo de cámara: los infiere el agente mirando los frames",
      "lectura cinematográfica de conjunto: la hace el agente",
    ],
  };

  const destino = join(out, "VIDEO_EVIDENCE.json");
  writeFileSync(destino, JSON.stringify(evidencia, null, 2), "utf8");
  log(`\nlisto: ${destino}`);
  log(`  ${ritmo.planos} planos · media ${ritmo.duracion_media_s}s · ${ritmo.cortes_por_minuto} cortes/min · ${ritmo.evolucion ?? ""}`);
}

main();
