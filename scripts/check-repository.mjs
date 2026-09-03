#!/usr/bin/env node
// Validación estructural del repositorio + la calibración de cada skill.
//
// Dos capas, deliberadamente separadas:
//  1. Estructura: ¿el skill está bien formado? (frontmatter, versión, archivos
//     referenciados que existen de verdad, nada bundled y huérfano).
//  2. Comportamiento: ¿el skill mide lo que dice medir? Corriendo su propio
//     banco de calibración contra video sintético de respuesta conocida.
//
// La capa 1 sola no prueba nada sobre la calidad de la medición — un skill
// puede estar perfectamente bien formado y devolver umbrales inventados. Por
// eso el gate real es la capa 2.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const excluded = new Set([".git", "node_modules", ".calibration"]);
const failures = [];

const fail = (message) => failures.push(message);
const read = (file) => fs.readFileSync(file, "utf8");
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(target));
    else files.push(target);
  }
  return files;
}

function runNode(label, args, { expect = "pass", cwd = root } = {}) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: "utf8", stdio: "pipe" });
  const passed = result.status === 0;

  if (expect === "pass" && !passed) {
    fail(`${label}\n${result.stdout || ""}${result.stderr || ""}`);
    return;
  }
  if (expect === "fail" && passed) {
    fail(`${label} (se esperaba que fallara)\n${result.stdout || ""}`);
    return;
  }
  if (expect === "pass" && result.stdout.trim()) console.log(result.stdout.trim());
}

// --- capa 1: bien formado ---------------------------------------------------

const files = walk(root);

for (const file of files.filter((f) => f.endsWith(".json"))) {
  try {
    JSON.parse(read(file));
  } catch (error) {
    fail(`JSON inválido: ${relative(file)}: ${error.message}`);
  }
}

for (const file of files.filter((f) => f.endsWith(".mjs"))) {
  runNode(`JavaScript inválido: ${relative(file)}`, ["--check", file]);
}

const skillNames = fs.existsSync(path.join(root, "skills"))
  ? fs.readdirSync(path.join(root, "skills"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  : [];

if (!skillNames.length) fail("No hay ningún skill en skills/");

const declaredVersions = new Map();

for (const name of skillNames) {
  const skillRoot = path.join(root, "skills", name);
  const skillFile = path.join(skillRoot, "SKILL.md");

  if (!fs.existsSync(skillFile)) {
    fail(`Falta skills/${name}/SKILL.md`);
    continue;
  }

  const markdown = read(skillFile);
  const frontmatter = markdown.match(/^---[\s\S]*?^---/m)?.[0] || "";
  const declared = frontmatter.match(/^name:\s*([^\r\n]+)/m)?.[1]?.trim();

  if (declared !== name) {
    fail(`Nombre de skill inconsistente: carpeta ${name}, frontmatter ${declared || "ausente"}`);
  }

  const description = frontmatter.match(/^description:\s*([^\r\n]+)/m)?.[1]?.trim();
  if (!description) fail(`skills/${name}/SKILL.md no declara description`);
  else if (description.length > 1024) fail(`skills/${name}/SKILL.md: description excede 1024 caracteres`);

  const version = frontmatter.match(/version:\s*"?([0-9]+\.[0-9]+\.[0-9]+)"?/)?.[1];
  if (!version) fail(`skills/${name}/SKILL.md no declara metadata.version`);
  else declaredVersions.set(name, version);

  // Todo archivo bundled tiene que estar referenciado desde algún lado, o es
  // peso muerto que el agente nunca va a abrir.
  const bundled = ["references", "assets", "schemas", "scripts"];
  const prose = [
    markdown,
    ...(fs.existsSync(path.join(skillRoot, "references"))
      ? fs.readdirSync(path.join(skillRoot, "references"))
          .filter((e) => e.endsWith(".md"))
          .map((e) => read(path.join(skillRoot, "references", e)))
      : []),
  ].join("\n");

  for (const folder of bundled) {
    const directory = path.join(skillRoot, folder);
    if (!fs.existsSync(directory)) continue;
    for (const entry of walk(directory)) {
      const base = path.basename(entry);
      if (!prose.includes(base)) {
        fail(`Archivo bundled sin referenciar: ${relative(entry)}`);
      }
    }
  }

  const linkPattern = /`((?:references|assets|schemas|scripts)\/[^`]+)`/g;
  for (const match of markdown.matchAll(linkPattern)) {
    const linked = path.join(skillRoot, ...match[1].split("/"));
    if (!fs.existsSync(linked)) fail(`Referencia rota en skills/${name}/SKILL.md: ${match[1]}`);
  }

  const packageFile = path.join(skillRoot, "package.json");
  if (fs.existsSync(packageFile) && version) {
    const pkg = JSON.parse(read(packageFile));
    if (pkg.version !== version) {
      fail(`Versión desalineada: skills/${name}/SKILL.md dice ${version}, package.json dice ${pkg.version}`);
    }
  }
}

// --- capa 2: comportamiento --------------------------------------------------
// Cada skill que declara un banco de calibración tiene que pasarlo. Este es el
// gate real: la estructura puede estar perfecta con umbrales inventados.

for (const name of skillNames) {
  const calibrador = path.join(root, "skills", name, "scripts", "calibrar.mjs");
  if (!fs.existsSync(calibrador)) continue;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cvf-calib-${name}-`));
  runNode(`Calibración de ${name} no dio 7/7`, [calibrador, "--dir", dir]);
  fs.rmSync(dir, { recursive: true, force: true });
}

if (failures.length) {
  console.error("\nValidación del repositorio: FALLÓ\n");
  for (const issue of failures) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`\nValidación del repositorio: OK (${files.length} archivos revisados, ${skillNames.length} skill(s)).`);
