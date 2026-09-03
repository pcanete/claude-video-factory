#!/usr/bin/env node
// Valida un SHOT_LIST.json: contra su schema, y contra reglas que un schema no
// puede expresar — coherencia con el CHARACTER_PACK que declara usar, límites
// de duración de clip nativo, y que todo plano en cubeta C tenga alternativa.
//
// uso: node validate-shot-list.mjs --shot-list <archivo> [--limite-nativo-s 10]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function args() {
  const a = process.argv.slice(2);
  const get = (n, def) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] ? a[i + 1] : def; };
  return {
    shotList: get("shot-list", null),
    limiteNativoS: Number(get("limite-nativo-s", "10")),
  };
}

function leerJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// Validador de schema minimalista: sin dependencias (ajv no está disponible sin
// npm install, y este repo no arrastra dependencias de terceros). Cubre lo que
// hace falta: required, enum, const, type, allOf/if/then a un nivel — no es un
// validador JSON Schema completo, es suficiente para este contrato cerrado.
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
    if (schema.minItems && doc.length < schema.minItems) {
      errores.push(`${ruta}: mínimo ${schema.minItems} elementos, tiene ${doc.length}`);
    }
    doc.forEach((item, i) => validarContraSchema(item, schema.items, `${ruta}[${i}]`, errores));
  }
  for (const rama of schema.allOf || []) {
    if (rama.if) {
      const condErrores = [];
      validarContraSchema(doc, rama.if, ruta, condErrores);
      const cumple = condErrores.length === 0 && (rama.if.required || []).every((r) => doc[r] !== undefined);
      if (cumple && rama.then) validarContraSchema(doc, rama.then, ruta, errores);
    }
  }
}

function main() {
  const { shotList, limiteNativoS } = args();
  if (!shotList) {
    console.error("uso: node validate-shot-list.mjs --shot-list <archivo> [--limite-nativo-s 10]");
    process.exit(2);
  }

  const schema = leerJson(path.join(HERE, "..", "schemas", "shot-list.schema.json"));
  const doc = leerJson(shotList);
  const errores = [];
  const avisos = [];

  validarContraSchema(doc, schema, "shotList", errores);

  if (errores.length) {
    console.error("SHOT_LIST inválido contra el schema:\n");
    for (const e of errores) console.error(`  - ${e}`);
    process.exit(1);
  }

  // --- reglas que el schema no puede expresar -------------------------------

  const dirBase = path.dirname(path.resolve(shotList));
  let pack = null;
  const rutaPack = doc.personaje?.character_pack;
  if (rutaPack) {
    const rutaAbs = path.isAbsolute(rutaPack) ? rutaPack : path.join(dirBase, rutaPack);
    if (!fs.existsSync(rutaAbs)) {
      errores.push(`personaje.character_pack no existe: ${rutaPack}`);
    } else {
      pack = leerJson(rutaAbs);
      if (pack.contrato !== "CHARACTER_PACK") {
        errores.push(`personaje.character_pack no es un CHARACTER_PACK válido (contrato: ${pack.contrato})`);
      }
    }
  }

  const archivosDelPack = new Set();
  if (pack) {
    for (const grupo of ["turnaround", "escalas"]) {
      for (const item of pack.activos?.[grupo] || []) archivosDelPack.add(item.archivo);
    }
    for (const item of pack.activos?.expresiones || []) archivosDelPack.add(item.archivo);
  }

  let sumaDuracion = 0;
  for (const p of doc.planos) {
    sumaDuracion += p.duracion_s;

    if (p.duracion_s > limiteNativoS) {
      avisos.push(`plano ${p.indice}: dura ${p.duracion_s}s, por encima del límite nativo asumido de ${limiteNativoS}s — dividir en dos planos o confirmar que la plataforma lo soporta.`);
    }

    if (p.cubeta === "C" && !p.alternativa) {
      errores.push(`plano ${p.indice}: cubeta C sin alternativa (ya debería haber fallado el schema — revisar).`);
    }

    if (p.activo_identidad) {
      if (!pack) {
        errores.push(`plano ${p.indice}: declara activo_identidad ("${p.activo_identidad}") pero personaje.character_pack es null.`);
      } else if (!archivosDelPack.has(p.activo_identidad)) {
        errores.push(`plano ${p.indice}: activo_identidad "${p.activo_identidad}" no está catalogado en el CHARACTER_PACK (turnaround/escalas/expresiones).`);
      } else {
        const expr = (pack.activos.expresiones || []).find((e) => e.archivo === p.activo_identidad);
        if (expr && expr.sostiene_identidad === false) {
          errores.push(`plano ${p.indice}: usa "${p.activo_identidad}", una expresión marcada sostiene_identidad:false en el pack. No usar como ancla.`);
        } else if (expr && expr.sostiene_identidad === null) {
          avisos.push(`plano ${p.indice}: usa "${p.activo_identidad}", una expresión todavía sin probar (sostiene_identidad:null) — riesgo de que no sostenga identidad.`);
        }
      }
    }

    if (p.dialogo && p.destino_lipsync !== false) {
      // Nota informativa, no error: el diálogo con lipsync en Higgsfield (Speak)
      // necesita un audio de referencia grabado, no genera voz desde texto.
      avisos.push(`plano ${p.indice}: tiene diálogo. Si el destino es Higgsfield Speak, hace falta un audio WAV de referencia — Speak sincroniza labios con un audio dado, no genera voz desde texto.`);
    }
  }

  const objetivo = doc.pieza.duracion_objetivo_s;
  if (Math.abs(sumaDuracion - objetivo) > objetivo * 0.15) {
    avisos.push(`la suma de planos (${sumaDuracion.toFixed(1)}s) se aleja más de 15% del objetivo declarado (${objetivo}s).`);
  }

  if (errores.length) {
    console.error("SHOT_LIST con errores:\n");
    for (const e of errores) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`SHOT_LIST válido: ${doc.planos.length} planos, ${sumaDuracion.toFixed(1)}s de suma.`);
  if (avisos.length) {
    console.log("\nAvisos (no bloquean, revisar antes de compilar):");
    for (const a of avisos) console.log(`  - ${a}`);
  }
}

main();
