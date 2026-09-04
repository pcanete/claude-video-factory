#!/usr/bin/env node
// Registra la decisión humana sobre el keyframe de un plano: actualiza
// estado_keyframe en el SHOT_LIST y deja rastro en un log append-only al
// lado — quién decidió qué y cuándo, no solo el estado final. Mismo patrón
// que bus/queues/*.ndjson en el resto del sistema: nunca se reescribe,
// solo se agrega.
//
// Al aprobar, registra además contexto_aprobacion (proveedor/modelo/canal/
// revisión del pack) — adaptado de consistency-test-builder de la edición
// Codex del frente (cruce 2026-09-04): una aprobación vale para el contexto
// exacto en que se hizo, no para siempre. Si no se pasan las banderas de
// contexto, queda "not_recorded" en vez de inventado — compilar-higgsfield.mjs
// solo puede avisar del cambio de contexto si esto está completo.
//
// uso: node marcar-keyframe.mjs --shot-list <archivo> --plano <indice> --estado aprobado|rechazado|pendiente [--nota "..."] [--proveedor "..."] [--modelo "..."] [--canal "..."] [--revision-pack "..."]

import fs from "node:fs";
import path from "node:path";

function args() {
  const a = process.argv.slice(2);
  const get = (n, def) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] ? a[i + 1] : def; };
  return {
    shotList: get("shot-list", null),
    plano: get("plano", null),
    estado: get("estado", null),
    nota: get("nota", null),
    proveedor: get("proveedor", null),
    modelo: get("modelo", null),
    canal: get("canal", null),
    revisionPack: get("revision-pack", null),
  };
}

function main() {
  const { shotList, plano, estado, nota, proveedor, modelo, canal, revisionPack } = args();
  if (!shotList || plano === null || !estado) {
    console.error('uso: node marcar-keyframe.mjs --shot-list <archivo> --plano <indice> --estado aprobado|rechazado|pendiente [--nota "..."] [--proveedor "..."] [--modelo "..."] [--canal "..."] [--revision-pack "..."]');
    process.exit(2);
  }
  if (!["aprobado", "rechazado", "pendiente"].includes(estado)) {
    console.error(`estado inválido: "${estado}". Usar aprobado, rechazado o pendiente.`);
    process.exit(2);
  }

  const rutaAbs = path.resolve(shotList);
  const doc = JSON.parse(fs.readFileSync(rutaAbs, "utf8"));
  const idx = Number(plano);
  const p = doc.planos.find((pl) => pl.indice === idx);
  if (!p) {
    console.error(`no existe el plano ${idx} en ${shotList}`);
    process.exit(1);
  }

  const anterior = p.estado_keyframe || "sin estado";
  p.estado_keyframe = estado;
  if (estado === "aprobado") {
    p.contexto_aprobacion = {
      proveedor: proveedor || "not_recorded",
      modelo: modelo || "not_recorded",
      canal: canal || "not_recorded",
      revision_character_pack: revisionPack || "not_recorded",
    };
  }
  fs.writeFileSync(rutaAbs, JSON.stringify(doc, null, 2) + "\n", "utf8");

  const logPath = path.join(path.dirname(rutaAbs), "decisiones-keyframe.ndjson");
  const entrada = {
    ts: new Date().toISOString(),
    plano: idx,
    estado_anterior: anterior,
    estado_nuevo: estado,
    keyframe_inicial: p.keyframe_inicial || null,
    keyframe_final: p.keyframe_final || null,
    contexto_aprobacion: p.contexto_aprobacion || null,
    nota: nota || null,
  };
  fs.appendFileSync(logPath, JSON.stringify(entrada) + "\n", "utf8");

  console.log(`plano ${idx}: ${anterior} → ${estado}`);
  console.log(`registrado en ${logPath}`);
  if (estado === "rechazado" && !nota) {
    console.log("aviso: rechazado sin nota — dejar escrito por qué, para no repetir el mismo error al regenerar.");
  }
}

main();
