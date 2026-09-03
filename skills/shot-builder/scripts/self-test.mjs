#!/usr/bin/env node
// Autoprueba de shot-builder: arma un CHARACTER_PACK y un SHOT_LIST sintéticos
// y verifica que el validador y el compilador se comporten como declaran.
//
// Las compuertas son el producto: si esto no falla cuando debería fallar,
// el validador no está haciendo nada.
//
// uso: node self-test.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const failures = [];
const fail = (m) => failures.push(m);

function run(args, { expect = "pass" } = {}) {
  const r = spawnSync(process.execPath, args, { encoding: "utf8" });
  const passed = r.status === 0;
  if (expect === "pass" && !passed) fail(`esperaba éxito, falló: node ${args.join(" ")}\n${r.stdout}${r.stderr}`);
  if (expect === "fail" && passed) fail(`esperaba fallo, tuvo éxito: node ${args.join(" ")}\n${r.stdout}`);
  return r;
}

function escribir(p, doc) {
  fs.writeFileSync(p, JSON.stringify(doc, null, 2), "utf8");
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shot-builder-self-test-"));

// --- fixture: un CHARACTER_PACK sintético, mínimo pero válido ---------------
const pack = {
  contrato: "CHARACTER_PACK",
  version: "1.0.0",
  personaje: { nombre: "Fixture Persona" },
  mecanismo_identidad: { tipo: "lora_propio", detalle: {}, portabilidad: "alta" },
  activos: {
    turnaround: [{ archivo: "turnaround/frontal.jpg", origen: "existente" }],
    escalas: [{ archivo: "escalas/plano_medio.jpg", origen: "existente" }],
    expresiones: [
      { nombre: "sonrisa", archivo: "expresiones/sonrisa.jpg", origen: "existente", sostiene_identidad: true },
      { nombre: "sin_probar", archivo: "expresiones/sin_probar.jpg", origen: "existente", sostiene_identidad: null },
      { nombre: "rota", archivo: "expresiones/rota.jpg", origen: "existente", sostiene_identidad: false },
    ],
  },
  wardrobe: { locks: [{ nombre: "casual", descripcion: "look de prueba", estado: "candidato" }], nota: "sin canon aprobado" },
  limites_conocidos: [{ descripcion: "límite de prueba", tipo: "prompting" }],
  ids_por_plataforma: {},
};
const packPath = path.join(dir, "CHARACTER_PACK.json");
escribir(packPath, pack);
// Los archivos de imagen referenciados no hace falta que existan de verdad
// para validar el contrato — el compilador los copia solo si existen.
for (const rel of ["turnaround/frontal.jpg", "escalas/plano_medio.jpg", "expresiones/sonrisa.jpg"]) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), "fixture");
}

// --- fixture: un SHOT_LIST válido -------------------------------------------
const planoBase = {
  indice: 0,
  funcion: "abre",
  sujeto: "Fixture Persona",
  accion: "camina hacia cámara",
  camara: { movimiento: "push_in", intensidad: "lento" },
  luz: "hora dorada",
  entorno: "calle vacía",
  estilo: "cinematográfico, 35mm",
  duracion_s: 4,
  empalme_siguiente: "corte_duro",
  activo_identidad: "turnaround/frontal.jpg",
  cubeta: "A",
};

const shotListValido = {
  contrato: "SHOT_LIST",
  version: "1.0.0",
  pieza: { titulo: "Pieza de prueba", duracion_objetivo_s: 8, orientacion: "vertical" },
  derivado_de_template: null,
  personaje: { character_pack: "CHARACTER_PACK.json", nota: "fixture" },
  destino: { plataforma: "higgsfield", modo: "paquete_para_pegar" },
  planos: [
    planoBase,
    { ...planoBase, indice: 1, funcion: "cierra", duracion_s: 4, activo_identidad: null, cubeta: "A" },
  ],
};
const shotListValidoPath = path.join(dir, "SHOT_LIST.valido.json");
escribir(shotListValidoPath, shotListValido);

run([path.join(HERE, "validate-shot-list.mjs"), "--shot-list", shotListValidoPath]);

// --- variante rota: cubeta C sin alternativa --------------------------------
const shotListSinAlternativa = {
  ...shotListValido,
  planos: [{ ...planoBase, cubeta: "C" }], // sin "alternativa"
};
const rutaSinAlternativa = path.join(dir, "SHOT_LIST.sin-alternativa.json");
escribir(rutaSinAlternativa, shotListSinAlternativa);
run([path.join(HERE, "validate-shot-list.mjs"), "--shot-list", rutaSinAlternativa], { expect: "fail" });

// --- variante rota: activo_identidad que no existe en el pack ---------------
const shotListActivoInexistente = {
  ...shotListValido,
  planos: [{ ...planoBase, activo_identidad: "expresiones/no_existe.jpg" }],
};
const rutaActivoInexistente = path.join(dir, "SHOT_LIST.activo-inexistente.json");
escribir(rutaActivoInexistente, shotListActivoInexistente);
run([path.join(HERE, "validate-shot-list.mjs"), "--shot-list", rutaActivoInexistente], { expect: "fail" });

// --- variante rota: usa una expresión marcada sostiene_identidad:false -----
const shotListExpresionRota = {
  ...shotListValido,
  planos: [{ ...planoBase, activo_identidad: "expresiones/rota.jpg" }],
};
const rutaExpresionRota = path.join(dir, "SHOT_LIST.expresion-rota.json");
escribir(rutaExpresionRota, shotListExpresionRota);
run([path.join(HERE, "validate-shot-list.mjs"), "--shot-list", rutaExpresionRota], { expect: "fail" });

// --- compilar el válido y verificar la salida -------------------------------
const outDir = path.join(dir, "paquete");
run([path.join(HERE, "compilar-higgsfield.mjs"), "--shot-list", shotListValidoPath, "--out", outDir]);

if (!fs.existsSync(path.join(outDir, "00-checklist.md"))) fail("el compilador no generó 00-checklist.md");
if (!fs.existsSync(path.join(outDir, "planos", "plano-00.md"))) fail("el compilador no generó planos/plano-00.md");
if (!fs.existsSync(path.join(outDir, "planos", "plano-01.md"))) fail("el compilador no generó planos/plano-01.md");

const plano00 = fs.existsSync(path.join(outDir, "planos", "plano-00.md"))
  ? fs.readFileSync(path.join(outDir, "planos", "plano-00.md"), "utf8")
  : "";
if (!plano00.includes("Subject: Fixture Persona")) fail("plano-00.md no arma el bloque Subject esperado");
if (!plano00.includes("slow dolly in")) fail("plano-00.md no tradujo push_in al término de prompt esperado");
if (!plano00.includes("hora dorada")) fail("plano-00.md no incluyó el bloque Light");

const checklist = fs.readFileSync(path.join(outDir, "00-checklist.md"), "utf8");
if (!checklist.includes("Pieza de prueba")) fail("00-checklist.md no incluye el título de la pieza");
if (!checklist.includes("candidato")) fail("00-checklist.md no reporta el wardrobe candidato del pack");
if (!checklist.includes("límite de prueba")) fail("00-checklist.md no reporta los límites conocidos del pack");

if (!fs.existsSync(path.join(outDir, "referencias", "turnaround__frontal.jpg"))) {
  fail("el compilador no copió la referencia de identidad del plano 0");
}

fs.rmSync(dir, { recursive: true, force: true });

if (failures.length) {
  console.error("\nself-test de shot-builder: FALLÓ\n");
  for (const f of failures) console.error(`- ${f}\n`);
  process.exit(1);
}
console.log("self-test de shot-builder: OK");
