#!/usr/bin/env node
// Compila un SHOT_LIST.json validado a un paquete para pegar en la UI de
// Higgsfield: un archivo de texto por plano con el prompt en la sintaxis que
// ese destino espera, más un checklist de continuidad.
//
// No llama a ninguna API de generación (decisión v1: paquete_para_pegar).
// Cuando exista un segundo destino (Veo, Kling), va otro compilador aparte —
// este archivo solo sabe hablar el dialecto de Higgsfield.
//
// uso: node compilar-higgsfield.mjs --shot-list <archivo> --out <directorio>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function args() {
  const a = process.argv.slice(2);
  const get = (n, def) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] ? a[i + 1] : def; };
  return { shotList: get("shot-list", null), out: get("out", null) };
}

function leerJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

// Mismo vocabulario que emite video-reference-scanner en VIDEO_DNA/motion —
// a propósito: todo el pipeline habla un solo idioma de cámara de punta a
// punta, del escaneo de referencia a la instrucción final.
const TERMINO_MOVIMIENTO = {
  fija: "locked-off shot, static camera",
  push_in: "slow dolly in",
  pull_out: "dolly out revealing",
  paneo: "pan across",
  tilt: "tilt",
  travelling: "tracking shot alongside",
  orbita: "slow orbit",
  handheld: "handheld, subtle camera shake",
  aereo: "aerial drone shot",
  snap_zoom: "fast snap zoom in",
};

const TERMINO_ANGULO = {
  neutro: "eye level",
  contrapicado: "low angle",
  picado: "high angle",
  cenital: "top-down, overhead",
};

const NOTA_EMPALME = {
  corte_duro: "corte duro con el plano siguiente",
  disolvencia: "disolvencia hacia el plano siguiente — dejar 3-4 cuadros de superposición al editar",
  fundido_a_negro: "fundido a negro antes del plano siguiente",
  flash_o_fundido_blanco: "flash/fundido a blanco antes del plano siguiente",
};

// Siete bloques, en orden. Ver references/anatomia-de-prompt.md del skill.
//
// Wardrobe es un bloque explícito a propósito: un mecanismo de identidad
// arrastra el vestuario de su foto de referencia si el prompt no lo
// contradice — verificado con costo real (ver references/lectura-de-director.md).
// "hereda del activo_identidad" es una decisión válida, no una ausencia: en
// ese caso no se agrega la línea, para no competir contra la foto de
// referencia con una descripción redundante del mismo vestuario.
const HEREDA = /^hereda\b/i;

function armarPrompt(p) {
  const camara = [TERMINO_MOVIMIENTO[p.camara.movimiento] || p.camara.movimiento];
  if (p.camara.intensidad) camara.push(p.camara.intensidad);
  if (p.camara.angulo && p.camara.angulo !== "neutro") camara.push(TERMINO_ANGULO[p.camara.angulo]);

  const bloques = [`Subject: ${p.sujeto}`];
  if (!HEREDA.test(p.vestuario)) bloques.push(`Wardrobe: ${p.vestuario}`);
  bloques.push(
    `Action: ${p.accion}`,
    `Camera: ${camara.join(", ")}`,
    `Light: ${p.luz}`,
    `Environment: ${p.entorno}`,
    `Style: ${p.estilo}`,
  );
  if (p.dialogo) bloques.push(`Dialogue (literal, do not paraphrase): "${p.dialogo}"`);
  return bloques.join("\n");
}

function fichaPlano(p, pack) {
  const lineas = [];
  lineas.push(`# Plano ${String(p.indice).padStart(2, "0")} — ${p.funcion}`);
  lineas.push("");
  lineas.push(`**Duración:** ${p.duracion_s}s   **Cubeta:** ${p.cubeta}${p.cubeta === "C" ? ` — ${p.alternativa}` : ""}`);
  lineas.push("");
  lineas.push("## Prompt (pegar en Higgsfield)");
  lineas.push("");
  lineas.push("```");
  lineas.push(armarPrompt(p));
  lineas.push("```");
  lineas.push("");

  if (p.activo_identidad) {
    lineas.push("## Referencia de identidad");
    lineas.push("");
    lineas.push(`Subir como referencia de personaje (Soul / custom reference) antes de generar:`);
    lineas.push(`\`${p.activo_identidad}\` (copiada en \`referencias/\` de este paquete).`);
    if (pack) {
      lineas.push("");
      lineas.push(`Mecanismo de identidad del pack: **${pack.mecanismo_identidad.tipo}** (portabilidad: ${pack.mecanismo_identidad.portabilidad}).`);
      if (pack.mecanismo_identidad.portabilidad === "nula") {
        lineas.push("Este mecanismo queda encerrado en su plataforma de origen — si Higgsfield no lo reconoce, hay que volver a entrenar un Soul ID ahí, o generar la referencia de nuevo con el mecanismo portable del pack antes de subirla.");
      }
    }
    lineas.push("");
  }

  if (p.dialogo) {
    lineas.push("## Diálogo y sincronía de labios");
    lineas.push("");
    lineas.push(`> "${p.dialogo}"`);
    lineas.push("");
    lineas.push("**Nota verificada sobre Higgsfield Speak:** sincroniza labios con un audio que vos subís (WAV), no genera voz a partir del texto. Si esta pieza necesita voz sintética, generarla aparte (TTS) y subir ese audio como referencia — no alcanza con escribir el diálogo en el prompt.");
    lineas.push("");
  }

  lineas.push(`## Empalme al plano siguiente`);
  lineas.push("");
  lineas.push(NOTA_EMPALME[p.empalme_siguiente] || "no declarado");
  lineas.push("");

  return lineas.join("\n");
}

function checklist(doc, pack) {
  const lineas = [];
  lineas.push(`# ${doc.pieza.titulo}`);
  lineas.push("");
  if (doc.pieza.cliente) lineas.push(`**Cliente:** ${doc.pieza.cliente}`);
  if (doc.pieza.objetivo) lineas.push(`**Objetivo:** ${doc.pieza.objetivo}`);
  lineas.push(`**Duración objetivo:** ${doc.pieza.duracion_objetivo_s}s · **Orientación:** ${doc.pieza.orientacion}`);
  lineas.push(`**Destino:** ${doc.destino.plataforma} (${doc.destino.modo})`);
  lineas.push("");

  const cubetaB = doc.planos.filter((p) => p.cubeta === "B");
  const cubetaC = doc.planos.filter((p) => p.cubeta === "C");
  if (cubetaB.length || cubetaC.length) {
    lineas.push("## Antes de producir");
    lineas.push("");
    if (cubetaB.length) {
      lineas.push(`**${cubetaB.length} plano(s) en cubeta B** — necesitan producción real o compuesto cuidadoso, no van a salir bien de un solo intento generativo:`);
      for (const p of cubetaB) lineas.push(`  - plano ${p.indice}: ${p.funcion}`);
      lineas.push("");
    }
    if (cubetaC.length) {
      lineas.push(`**${cubetaC.length} plano(s) en cubeta C** — hoy no se pueden generar como están descritos:`);
      for (const p of cubetaC) lineas.push(`  - plano ${p.indice}: ${p.funcion} → ${p.alternativa}`);
      lineas.push("");
    }
  }

  lineas.push("## Continuidad a revisar al ensamblar");
  lineas.push("");
  lineas.push("Comparar el frame final de cada plano contra el inicial del siguiente:");
  lineas.push("- ¿la cara sigue siendo reconociblemente la misma persona?");
  lineas.push("- ¿el vestuario es el mismo (o el cambio está justificado por el guion)?");
  lineas.push("- ¿la luz y el grado de color no saltan entre planos que deberían ser continuos?");
  lineas.push("");

  if (pack) {
    const candidatos = (pack.wardrobe?.locks || []).filter((l) => l.estado === "candidato");
    if (candidatos.length) {
      lineas.push(`**Wardrobe del pack "${pack.personaje.nombre}" sin aprobar todavía:**`);
      for (const l of candidatos) lineas.push(`  - ${l.nombre} (candidato, no aprobado): ${l.descripcion}`);
      lineas.push("");
    }
    const limites = pack.limites_conocidos || [];
    if (limites.length) {
      lineas.push(`**Límites conocidos del pack de identidad:**`);
      for (const l of limites) lineas.push(`  - [${l.tipo}] ${l.descripcion}`);
      lineas.push("");
    }
  }

  lineas.push("## Planos");
  lineas.push("");
  lineas.push("| # | Función | Duración | Cubeta | Identidad | Vestuario | Empalme siguiente |");
  lineas.push("|---|---|---|---|---|---|---|");
  for (const p of doc.planos) {
    lineas.push(`| ${p.indice} | ${p.funcion} | ${p.duracion_s}s | ${p.cubeta} | ${p.activo_identidad ? "sí" : "—"} | ${p.vestuario} | ${p.empalme_siguiente || "—"} |`);
  }
  lineas.push("");

  return lineas.join("\n");
}

function main() {
  const { shotList, out } = args();
  if (!shotList || !out) {
    console.error("uso: node compilar-higgsfield.mjs --shot-list <archivo> --out <directorio>");
    process.exit(2);
  }

  const doc = leerJson(shotList);
  if (doc.contrato !== "SHOT_LIST") {
    console.error(`ERROR: ${shotList} no es un SHOT_LIST (contrato: ${doc.contrato})`);
    process.exit(1);
  }
  if (doc.destino.plataforma !== "higgsfield") {
    console.error(`ERROR: este compilador solo entiende destino "higgsfield", el SHOT_LIST declara "${doc.destino.plataforma}"`);
    process.exit(1);
  }

  const dirBase = path.dirname(path.resolve(shotList));
  let pack = null;
  if (doc.personaje?.character_pack) {
    const rutaAbs = path.isAbsolute(doc.personaje.character_pack)
      ? doc.personaje.character_pack
      : path.join(dirBase, doc.personaje.character_pack);
    pack = leerJson(rutaAbs);
  }

  const outDir = path.resolve(out);
  const planosDir = path.join(outDir, "planos");
  const refDir = path.join(outDir, "referencias");
  fs.mkdirSync(planosDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, "00-checklist.md"), checklist(doc, pack), "utf8");

  for (const p of doc.planos) {
    const nombre = `plano-${String(p.indice).padStart(2, "0")}.md`;
    fs.writeFileSync(path.join(planosDir, nombre), fichaPlano(p, pack), "utf8");

    if (p.activo_identidad && pack) {
      const packDir = path.dirname(path.isAbsolute(doc.personaje.character_pack)
        ? doc.personaje.character_pack
        : path.join(dirBase, doc.personaje.character_pack));
      const origen = path.join(packDir, p.activo_identidad);
      if (fs.existsSync(origen)) {
        fs.mkdirSync(refDir, { recursive: true });
        const destino = path.join(refDir, p.activo_identidad.replaceAll("/", "__"));
        fs.copyFileSync(origen, destino);
      }
    }
  }

  console.log(`Paquete armado en: ${outDir}`);
  console.log(`  ${doc.planos.length} plano(s), checklist en 00-checklist.md`);
}

main();
