#!/usr/bin/env node
// Autoprueba de character-pack: un fixture sintético válido tiene que pasar,
// y variantes rotas tienen que fallar — en particular la regla nueva de
// naturaleza/titularidad, que existe para no producir con la imagen de una
// persona real sin confirmar consentimiento.

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "character-pack-self-test-"));
const validador = path.join(HERE, "validate.mjs");

const packValido = {
  contrato: "CHARACTER_PACK",
  version: "1.0.0",
  personaje: {
    nombre: "Fixture Persona",
    naturaleza: "sintetico",
    titularidad: "PRC, sin persona real involucrada",
  },
  mecanismo_identidad: { tipo: "lora_propio", detalle: {}, portabilidad: "alta" },
  activos: {
    turnaround: [{ archivo: "turnaround/frontal.jpg", origen: "existente" }],
    escalas: [{ archivo: "escalas/plano_medio.jpg", origen: "existente" }],
    expresiones: [
      { nombre: "sonrisa", archivo: "expresiones/sonrisa.jpg", origen: "existente", sostiene_identidad: true },
    ],
  },
  wardrobe: { locks: [{ nombre: "casual", descripcion: "look de prueba", estado: "aprobado" }], nota: "aprobado para el fixture" },
  variacion_permitida: ["luz", "ángulo leve"],
  deriva_prohibida: ["estructura facial"],
  limites_conocidos: [],
  ids_por_plataforma: {},
};

const rutaValida = path.join(dir, "CHARACTER_PACK.valido.json");
escribir(rutaValida, packValido);
run([validador, "--pack", rutaValida]);

// --- rota: persona real sin titularidad confirmada --------------------------
const packSinConsentir = {
  ...packValido,
  personaje: { nombre: "Fixture Persona", naturaleza: "persona_real", titularidad: "" },
};
const rutaSinConsentir = path.join(dir, "CHARACTER_PACK.sin-consentir.json");
escribir(rutaSinConsentir, packSinConsentir);
run([validador, "--pack", rutaSinConsentir], { expect: "fail" });

// --- rota: naturaleza ausente (campo ahora obligatorio) ---------------------
const { naturaleza: _n, ...personajeSinNaturaleza } = packValido.personaje;
const packSinNaturaleza = { ...packValido, personaje: personajeSinNaturaleza };
const rutaSinNaturaleza = path.join(dir, "CHARACTER_PACK.sin-naturaleza.json");
escribir(rutaSinNaturaleza, packSinNaturaleza);
run([validador, "--pack", rutaSinNaturaleza], { expect: "fail" });

// --- rota: naturaleza con un valor fuera del enum ---------------------------
const packNaturalezaInvalida = { ...packValido, personaje: { ...packValido.personaje, naturaleza: "robot" } };
const rutaNaturalezaInvalida = path.join(dir, "CHARACTER_PACK.naturaleza-invalida.json");
escribir(rutaNaturalezaInvalida, packNaturalezaInvalida);
run([validador, "--pack", rutaNaturalezaInvalida], { expect: "fail" });

fs.rmSync(dir, { recursive: true, force: true });

if (failures.length) {
  console.error("\nself-test de character-pack: FALLÓ\n");
  for (const f of failures) console.error(`- ${f}\n`);
  process.exit(1);
}
console.log("self-test de character-pack: OK");
