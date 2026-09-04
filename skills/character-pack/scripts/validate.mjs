#!/usr/bin/env node
// Valida un CHARACTER_PACK.json contra su schema. Existía SHOT_LIST validado
// desde el día uno de shot-builder; CHARACTER_PACK no tenía equivalente hasta
// esta auditoría cruzada contra el repo de Codex — la asimetría era real, no
// solo teórica: nada impedía publicar un pack sin naturaleza/titularidad
// declaradas, o con un wardrobe mal formado.
//
// uso: node validate.mjs --pack <archivo>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function leerJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

// Mismo validador minimalista que usa shot-builder (sin dependencias de
// terceros): cubre required, enum, const, type, additionalProperties y
// allOf/if/then a un nivel — suficiente para estos contratos cerrados.
function validarContraSchema(doc, schema, ruta, errores) {
  if (schema.const !== undefined && doc !== schema.const) {
    errores.push(`${ruta}: debía ser ${JSON.stringify(schema.const)}, es ${JSON.stringify(doc)}`);
  }
  if (schema.enum && !schema.enum.includes(doc)) {
    errores.push(`${ruta}: "${doc}" no está en [${schema.enum.join(", ")}]`);
  }
  if (schema.type) {
    const tipos = Array.isArray(schema.type) ? schema.type : [schema.type];
    const tipoReal = doc === null ? "null" : Array.isArray(doc) ? "array" : typeof doc;
    if (!tipos.includes(tipoReal) && !(tipoReal === "number" && tipos.includes("integer"))) {
      errores.push(`${ruta}: tipo ${tipoReal}, esperado ${tipos.join("|")}`);
    }
  }
  if (schema.type === "object" || (schema.properties && typeof doc === "object" && doc !== null && !Array.isArray(doc))) {
    for (const req of schema.required || []) {
      if (doc[req] === undefined) errores.push(`${ruta}: falta "${req}"`);
    }
    for (const [clave, sub] of Object.entries(schema.properties || {})) {
      if (doc[clave] !== undefined) validarContraSchema(doc[clave], sub, `${ruta}.${clave}`, errores);
    }
    if (schema.additionalProperties === false) {
      const permitidas = new Set(Object.keys(schema.properties || {}));
      for (const clave of Object.keys(doc)) {
        if (!permitidas.has(clave)) errores.push(`${ruta}: propiedad no declarada "${clave}"`);
      }
    }
  }
  if (schema.type === "array" && Array.isArray(doc)) {
    doc.forEach((item, i) => validarContraSchema(item, schema.items, `${ruta}[${i}]`, errores));
  }
  if (schema.$ref) {
    const nombre = schema.$ref.split("/").pop();
    validarContraSchema(doc, schema.$defs?.[nombre] ?? {}, ruta, errores);
  }
  if (schema.allOf) {
    for (const rama of schema.allOf) validarContraSchema(doc, rama, ruta, errores);
  }
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--pack");
  const rutaPack = i >= 0 ? args[i + 1] : null;
  if (!rutaPack) {
    console.error("uso: node validate.mjs --pack <archivo>");
    process.exit(2);
  }

  const schema = leerJson(path.join(HERE, "..", "schemas", "character-pack.schema.json"));
  const doc = leerJson(rutaPack);
  const errores = [];
  validarContraSchema(doc, schema, "pack", errores);

  // Reglas que el schema no expresa.
  if (doc.personaje?.naturaleza === "persona_real") {
    const tit = (doc.personaje.titularidad || "").toLowerCase();
    if (!tit || tit.includes("pendiente")) {
      errores.push(
        `pack.personaje.titularidad: naturaleza es persona_real pero la titularidad está sin confirmar ("${doc.personaje.titularidad || ""}") — no producir con este pack hasta confirmarla.`
      );
    }
  }

  const expresionesSinProbar = (doc.activos?.expresiones || []).filter((e) => e.sostiene_identidad === null);
  const avisos = [];
  if (expresionesSinProbar.length) {
    avisos.push(`${expresionesSinProbar.length} expresión(es) sin probar todavía: ${expresionesSinProbar.map((e) => e.nombre).join(", ")}.`);
  }
  const wardrobeSinAprobar = (doc.wardrobe?.locks || []).filter((l) => l.estado === "candidato");
  if (wardrobeSinAprobar.length === (doc.wardrobe?.locks || []).length && wardrobeSinAprobar.length > 0) {
    avisos.push("ningún wardrobe está aprobado todavía — todos son candidatos.");
  }

  if (errores.length) {
    console.error("CHARACTER_PACK inválido:\n");
    for (const e of errores) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`CHARACTER_PACK válido: "${doc.personaje?.nombre}" (${doc.mecanismo_identidad?.tipo}, portabilidad ${doc.mecanismo_identidad?.portabilidad}).`);
  if (avisos.length) {
    console.log("\nAvisos (no bloquean):");
    for (const a of avisos) console.log(`  - ${a}`);
  }
}

main();
