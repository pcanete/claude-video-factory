#!/usr/bin/env node
// Banco de calibración del módulo de movimiento.
//
// Genera video sintético con movimiento EXACTAMENTE conocido y verifica que la
// medición lo recupera. Sin esto los umbrales serían adivinados: el primer
// intento clasificaba un paneo lento real como "sin movimiento".
//
// uso: node scripts/calibrar.mjs [--dir <directorio de trabajo>]

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { analizarPlano } from "./lib/movimiento.mjs";

function ff(args) {
  const r = spawnSync("ffmpeg", args, { encoding: "buffer", maxBuffer: 1 << 28 });
  if (r.status !== 0) {
    throw new Error("ffmpeg falló:\n" + (r.stderr || Buffer.alloc(0)).toString().split("\n").slice(-8).join("\n"));
  }
  return r.stdout;
}

const W = 128, H = 72, FPS = 10;

// Cada caso declara qué se espera. `esperado` es la verdad de terreno, derivada
// de cómo se construye el video, no de lo que el algoritmo devuelve.
const CASOS = [
  {
    nombre: "estático",
    vf: "crop=1280:720:320:180",
    esperado: { movimiento: "fija" },
    verdad: "sin movimiento",
  },
  {
    nombre: "paneo derecha 37,5%",
    vf: "crop=1280:720:x='160+480*t/4':y=180",
    // El tilt tiene que dar 0: un paneo puro no debe inventar movimiento vertical.
    // Con imagen de patrones periódicos este caso reportaba tilt_abajo = 0,44.
    esperado: {
      movimiento: /^paneo_o_travelling_derecha$/,
      deriva_x_frac: [0.28, 0.47],
      deriva_y_frac: [0, 0.03],
    },
    verdad: "deriva x = +0,375 del ancho, sin componente vertical",
  },
  {
    nombre: "paneo lento 6,25%",
    vf: "crop=1280:720:x='320+80*t/4':y=180",
    esperado: { movimiento: /paneo_o_travelling_derecha/, deriva_x_frac: [0.03, 0.11] },
    verdad: "deriva x = +0,0625 del ancho (el caso que fallaba)",
  },
  {
    nombre: "tilt abajo 27,8%",
    vf: "crop=1280:720:x=320:y='80+200*t/4'",
    // Sin zoom espurio: con foto real este caso reportaba un push_in de 0,033.
    esperado: { movimiento: /^tilt_abajo$/, deriva_y_frac: [0.2, 0.36] },
    verdad: "deriva y = +0,278 del alto, sin cambio de escala",
  },
  {
    nombre: "push in 1,0→1,4",
    vf: "zoompan=z='1+0.40*on/99':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=25",
    esperado: { movimiento: /push_in/ },
    verdad: "zoom 1,00 → 1,40",
  },
  {
    nombre: "pull out 1,4→1,0",
    vf: "zoompan=z='1.40-0.40*on/99':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=25",
    esperado: { movimiento: /pull_out/ },
    verdad: "zoom 1,40 → 1,00",
  },
  {
    nombre: "handheld sin deriva",
    vf: "crop=1280:720:x='320+18*sin(t*23)+12*sin(t*37)':y='180+14*sin(t*29)'",
    esperado: { handheld: true },
    verdad: "sin deriva neta, temblor alto",
  },
];

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--dir");
  const dir = resolve(i >= 0 && args[i + 1] ? args[i + 1] : "calibracion");
  mkdirSync(dir, { recursive: true });

  // La imagen de calibración importa, y se probaron tres:
  //   testsrc2  -> patrones periódicos: enganchan la correlación en mínimos falsos
  //                (un paneo puro reportaba un tilt de 0,44 inexistente).
  //   ruido     -> isotrópico: al sumar columnas enteras el perfil queda plano y
  //                la correlación se queda sin información.
  //   mandelbrot-> estructura en todas las escalas, sin periodicidad, determinista.
  //                Nitidez 0,99 en ambos ejes. Es la que se usa.
  // `--base <archivo>` permite calibrar contra una foto real.
  const iBase = args.indexOf("--base");
  const base = iBase >= 0 && args[iBase + 1] ? resolve(args[iBase + 1]) : join(dir, "base.png");
  if (!existsSync(base)) {
    ff(["-v", "error", "-f", "lavfi", "-i", "mandelbrot=size=1920x1080:rate=1",
        "-frames:v", "1", "-y", base]);
  }

  let ok = 0, fallos = [];
  console.log("\ncalibración del módulo de movimiento\n" + "=".repeat(60));

  for (const caso of CASOS) {
    const mp4 = join(dir, `c_${caso.nombre.replace(/[^a-z0-9]+/gi, "_")}.mp4`);
    ff(["-v", "error", "-loop", "1", "-i", base, "-t", "4", "-r", "25",
        "-vf", caso.vf, "-pix_fmt", "yuv420p", "-y", mp4]);

    const raw = ff(["-v", "error", "-i", mp4,
                    "-vf", `fps=${FPS},scale=${W}:${H},format=gray`,
                    "-f", "rawvideo", "-"]);
    const total = Math.floor(raw.length / (W * H));
    const r = analizarPlano(raw, W, H, 1, total - 1, FPS);

    const problemas = [];
    for (const [clave, esperado] of Object.entries(caso.esperado)) {
      const obtenido = clave in r ? r[clave] : r.clasificacion?.[clave];
      if (esperado instanceof RegExp) {
        if (!esperado.test(String(obtenido))) problemas.push(`${clave}: esperaba ${esperado}, dio ${JSON.stringify(obtenido)}`);
      } else if (Array.isArray(esperado)) {
        const v = Math.abs(Number(obtenido));
        if (!(v >= esperado[0] && v <= esperado[1])) problemas.push(`${clave}: esperaba entre ${esperado[0]} y ${esperado[1]}, dio ${obtenido}`);
      } else if (obtenido !== esperado) {
        problemas.push(`${clave}: esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(obtenido)}`);
      }
    }

    const marca = problemas.length ? "FALLA" : "  ok ";
    console.log(`\n[${marca}] ${caso.nombre}`);
    console.log(`         verdad   : ${caso.verdad}`);
    console.log(`         medido   : ${r.clasificacion?.movimiento} | dx=${r.deriva_x_frac} dy=${r.deriva_y_frac} div=${r.divergencia_mitades} jitter=${r.jitter} conf=${r.confianza}`);
    if (r.clasificacion?.intensidad) console.log(`         intensidad: ${r.clasificacion.intensidad}`);
    for (const p of problemas) console.log(`         -> ${p}`);
    if (problemas.length) fallos.push(caso.nombre); else ok++;
  }

  console.log("\n" + "=".repeat(60));
  console.log(`${ok}/${CASOS.length} casos correctos`);
  if (fallos.length) {
    console.log(`fallan: ${fallos.join(", ")}`);
    process.exit(1);
  }
}

main();
