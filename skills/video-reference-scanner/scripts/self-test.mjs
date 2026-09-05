#!/usr/bin/env node
// Autoprueba de los contratos del escáner. Paralela a calibrar.mjs: ese banco
// valida los umbrales de medición, este valida las compuertas de SISTEMA_DE_PIEZA.
//
// Si esto no falla cuando debería fallar, el validador no está haciendo nada.
//
// uso: node self-test.mjs

import { validarSistema } from "./validate-sistema.mjs";

const fallas = [];
const fail = (m) => fallas.push(m);

function esperaOk(nombre, doc) {
  const { errores } = validarSistema(doc);
  if (errores.length) fail(`${nombre}: esperaba válido, dio errores:\n    ${errores.join("\n    ")}`);
}
function esperaError(nombre, doc, fragmento) {
  const { errores } = validarSistema(doc);
  if (!errores.length) return fail(`${nombre}: esperaba error, pasó`);
  if (fragmento && !errores.join(" ").includes(fragmento)) {
    fail(`${nombre}: falló como se esperaba pero por otro motivo: ${errores.join(" | ")}`);
  }
}
function esperaAviso(nombre, doc, fragmento) {
  const { avisos } = validarSistema(doc);
  if (!avisos.join(" ").includes(fragmento)) {
    fail(`${nombre}: esperaba un aviso con "${fragmento}", avisos: ${avisos.join(" | ") || "(ninguno)"}`);
  }
}

const base = () => ({
  contrato: "SISTEMA_DE_PIEZA",
  version: "1.0.0",
  derivado_de: "VIDEO_EVIDENCE.json",
  cobertura: { planos_vistos: [0, 1], planos_no_vistos: [], limitaciones: [] },
  principio_organizador: "nunca se ve el conjunto, así que el espectador lo arma solo",
  reglas: [
    { id: "r-fragmento", enunciado: "todo en primer plano o macro", evidencia: ["planos 0-9"], carga_identidad: true, sobrevive_cambio_de_sujeto: true },
    { id: "r-luz", enunciado: "contraluz en toda la pieza", evidencia: ["0.1s", "16.6s"], carga_identidad: false, sobrevive_cambio_de_sujeto: true },
  ],
  prohibiciones: [
    { id: "p-general", enunciado: "no hay ningún plano general", evidencia: ["revisados los 11 planos"], carga_identidad: true },
  ],
  cambios_deliberados: [],
});

esperaOk("sistema válido", base());

// Una regla sin evidencia es una opinión.
const sinEvidencia = base();
sinEvidencia.reglas[0].evidencia = [];
esperaError("regla sin evidencia", sinEvidencia, "mínimo 1");

// Una ausencia declarada sin haber mirado es una suposición.
const prohibicionSinEvidencia = base();
prohibicionSinEvidencia.prohibiciones[0].evidencia = [];
esperaError("prohibición sin evidencia", prohibicionSinEvidencia, "mínimo 1");

// No se puede romper a propósito algo que el sistema nunca registró.
const rompeFantasma = base();
rompeFantasma.cambios_deliberados = [{ rompe: "r-inexistente", motivo: "porque sí" }];
esperaError("cambio sobre regla inexistente", rompeFantasma, "no es ninguna regla");

// Romper la columna vertebral se puede; hacerlo sin decir qué se gana, no.
const rompeColumna = base();
rompeColumna.cambios_deliberados = [{ rompe: "r-fragmento", motivo: "queremos un establishing" }];
esperaError("rompe carga_identidad sin que_gano", rompeColumna, "que_gano");

const rompeColumnaOk = base();
rompeColumnaOk.cambios_deliberados = [{ rompe: "r-fragmento", motivo: "queremos un establishing", que_gano: "ubicar la locación, a costa del encierro" }];
esperaOk("rompe carga_identidad declarando qué gana", rompeColumnaOk);

// Romper algo accesorio no exige justificar la ganancia.
const rompeAccesorio = base();
rompeAccesorio.cambios_deliberados = [{ rompe: "r-luz", motivo: "rodamos nublado" }];
esperaOk("rompe regla accesoria sin que_gano", rompeAccesorio);

// Ids ambiguos rompen la trazabilidad de los cambios.
const idsRepetidos = base();
idsRepetidos.prohibiciones[0].id = "r-luz";
esperaError("ids repetidos", idsRepetidos, "ids repetidos");

// Avisos: lo que un desglose de planos nunca ve.
const sinProhibiciones = base();
sinProhibiciones.prohibiciones = [];
esperaAviso("sin prohibiciones avisa", sinProhibiciones, "nunca hace");

const nadaPortable = base();
nadaPortable.reglas.forEach((r) => { r.sobrevive_cambio_de_sujeto = false; });
esperaAviso("nada portable avisa", nadaPortable, "no puede guiar una distinta");

const parcial = base();
parcial.cobertura.planos_no_vistos = [7, 8];
esperaAviso("cobertura parcial avisa", parcial, "lectura parcial");

const todoAcabado = base();
todoAcabado.reglas.forEach((r) => { r.carga_identidad = false; });
todoAcabado.prohibiciones.forEach((p) => { p.carga_identidad = false; });
esperaAviso("sin columna vertebral avisa", todoAcabado, "falta el principio real");

if (fallas.length) {
  console.error("\nself-test de video-reference-scanner: FALLÓ\n");
  for (const f of fallas) console.error(`- ${f}\n`);
  process.exit(1);
}
console.log("self-test de video-reference-scanner: OK");
