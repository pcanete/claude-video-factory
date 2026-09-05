#!/usr/bin/env node
// Valida un SISTEMA_DE_PIEZA.json: contra su schema y contra las reglas que
// hacen la diferencia entre un sistema y una lista de impresiones.
//
// El problema que esto ataca: un desglose de planos se puede cumplir ítem por
// ítem y dar una pieza que no se parece al original. Lo que falta siempre es
// lo mismo — las reglas que todos los planos obedecen, y lo que la pieza
// nunca hace. Este validador exige evidencia para las dos cosas.
//
// uso: node validate-sistema.mjs --sistema <archivo>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function args() {
  const a = process.argv.slice(2);
  const get = (n, def) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] ? a[i + 1] : def; };
  return { sistema: get("sistema", null) };
}

function leerJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

// Mismo validador minimalista que usa shot-builder: sin dependencias, cubre
// required/enum/const/type/minItems/additionalProperties, que es lo que estos
// contratos cerrados necesitan.
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
      return;
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
}

export function validarSistema(doc) {
  const schema = leerJson(path.join(HERE, "..", "schemas", "sistema-de-pieza.schema.json"));
  const errores = [];
  const avisos = [];

  validarContraSchema(doc, schema, "sistema", errores);
  if (errores.length) return { errores, avisos };

  const reglas = doc.reglas || [];
  const prohibiciones = doc.prohibiciones || [];
  const porId = new Map([...reglas, ...prohibiciones].map((r) => [r.id, r]));

  if (porId.size !== reglas.length + prohibiciones.length) {
    errores.push("hay ids repetidos entre reglas y prohibiciones: cada una tiene que poder referenciarse sin ambigüedad.");
  }

  // Un cambio deliberado sobre algo que no está declarado no es deliberado:
  // es una regla que nadie escribió.
  for (const c of doc.cambios_deliberados || []) {
    const objetivo = porId.get(c.rompe);
    if (!objetivo) {
      errores.push(`cambios_deliberados: "${c.rompe}" no es ninguna regla ni prohibición declarada. No se puede romper a propósito algo que el sistema no registró.`);
      continue;
    }
    // Romper la columna vertebral está permitido. Hacerlo sin decir qué se
    // gana es exactamente cómo una pieza queda a medias.
    if (objetivo.carga_identidad && !(c.que_gano || "").trim()) {
      errores.push(`cambios_deliberados: romper "${c.rompe}" (carga_identidad: true) exige declarar "que_gano". Es la columna vertebral de la pieza — se puede romper, pero no de taquito.`);
    }
  }

  // La parte que ningún desglose de planos captura. Un sistema sin
  // prohibiciones casi siempre significa que no se fue a buscarlas.
  if (prohibiciones.length === 0) {
    avisos.push("no hay ninguna prohibición declarada. Lo que una pieza nunca hace es la mitad de lo que la define, y es lo que un desglose de planos no puede ver: volver a mirar buscando ausencias sistemáticas (plano general, cuerpo entero, gráfica, diálogo, otra gente).");
  }

  // Sin nada portable, este sistema no sirve para construir otra pieza —
  // que es el único motivo por el que se escribe.
  const portables = reglas.filter((r) => r.sobrevive_cambio_de_sujeto);
  if (portables.length === 0) {
    avisos.push("ninguna regla declara sobrevive_cambio_de_sujeto: true. Así el sistema describe solo a esta pieza y no puede guiar una distinta.");
  }

  const columna = [...reglas, ...prohibiciones].filter((r) => r.carga_identidad);
  if (columna.length === 0) {
    avisos.push("ninguna regla ni prohibición está marcada carga_identidad: true. Si todo es acabado y nada es columna vertebral, probablemente falta el principio real.");
  }

  if ((doc.cobertura.planos_no_vistos || []).length > 0) {
    avisos.push(`lectura parcial: no se miraron los planos ${doc.cobertura.planos_no_vistos.join(", ")}. El sistema puede estar bien igual, pero no presentarlo como completo.`);
  }

  return { errores, avisos };
}

function main() {
  const { sistema } = args();
  if (!sistema) {
    console.error("uso: node validate-sistema.mjs --sistema <archivo>");
    process.exit(2);
  }

  const { errores, avisos } = validarSistema(leerJson(sistema));

  if (errores.length) {
    console.error("SISTEMA_DE_PIEZA con errores:\n");
    for (const e of errores) console.error(`  - ${e}`);
    process.exit(1);
  }

  const doc = leerJson(sistema);
  const portables = (doc.reglas || []).filter((r) => r.sobrevive_cambio_de_sujeto).length;
  console.log(`SISTEMA_DE_PIEZA válido: ${doc.reglas.length} regla(s), ${doc.prohibiciones.length} prohibición(es), ${portables} portable(s) a otro sujeto.`);
  if (avisos.length) {
    console.log("\nAvisos:");
    for (const a of avisos) console.log(`  - ${a}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("validate-sistema.mjs")) main();
