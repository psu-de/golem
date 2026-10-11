#!/usr/bin/env node
// Keeps the documents honest:
// - COVERAGE.md: no row is blank or TODO, and every definition a row names exists;
// - every PD-n, E-n and S-n referenced anywhere is defined (CONTRACTS.md, ESCALATIONS.md,
//   SPIKE_DEPENDENCIES.md) and listed in the D2 sign-off summary;
// - every source file under examples/lumberjack/ is a verbatim copy of spec code blocks;
// - every schema definition has a description citing its §.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT } from "./lib/schemas.mjs";

const problems = [];
const fail = (msg) => problems.push(msg);
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// GitHub's heading anchors: lowercase, drop everything but letters, digits, spaces, - and _, spaces to -.
const slug = (h) => h.trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, "").replace(/ /g, "-");
const anchors = (file) => new Set(read(file).split("\n").filter((l) => /^#{1,6} /.test(l)).map((l) => slug(l.replace(/^#+ /, ""))));

// ---------- COVERAGE.md ----------

const defsCache = new Map();
function defs(schema) {
  if (!defsCache.has(schema)) {
    const p = join(ROOT, "schemas", `${schema}.schema.json`);
    defsCache.set(schema, existsSync(p) ? new Set(Object.keys(JSON.parse(readFileSync(p, "utf8")).$defs ?? {})) : null);
  }
  return defsCache.get(schema);
}
const backendDecls = new Set([...read("types/backend.d.ts").matchAll(/export (?:type|interface) (\w+)/g)].map((m) => m[1]));
const docAnchors = { "CONTRACTS.md": anchors("CONTRACTS.md"), "ESCALATIONS.md": anchors("ESCALATIONS.md"), "SPIKE_DEPENDENCIES.md": anchors("SPIKE_DEPENDENCIES.md") };

function resolve(ref) {
  let m = /^([a-z/-]+)#\/\$defs\/(\w+)$/.exec(ref);
  if (m) {
    const d = defs(m[1]);
    if (!d) return `no schema ${m[1]}.schema.json`;
    return d.has(m[2]) ? null : `${m[1]}.schema.json has no $defs/${m[2]}`;
  }
  m = /^backend\.d\.ts#(\w+)$/.exec(ref);
  if (m) return backendDecls.has(m[1]) ? null : `types/backend.d.ts exports no ${m[1]}`;
  m = /^(CONTRACTS|ESCALATIONS|SPIKE_DEPENDENCIES)\.md#(.+)$/.exec(ref);
  if (m) return docAnchors[`${m[1]}.md`].has(m[2]) ? null : `${m[1]}.md has no heading #${m[2]}`;
  return `unrecognised reference form ${ref}`;
}

let rows = 0;
for (const [i, line] of read("COVERAGE.md").split("\n").entries()) {
  if (!line.startsWith("| ") || line.startsWith("| Construct") || line.startsWith("| ---")) continue;
  const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
  if (cells.length !== 3) {
    fail(`COVERAGE.md:${i + 1}: expected 3 columns`);
    continue;
  }
  rows++;
  const covered = cells[2];
  const refs = [...covered.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  if (covered === "" || covered === "TODO" || refs.length === 0) fail(`COVERAGE.md:${i + 1}: "${cells[0]}" is not covered`);
  for (const r of refs) {
    const why = resolve(r);
    if (why) fail(`COVERAGE.md:${i + 1}: ${why}`);
  }
}

// ---------- every schema definition cites its section ----------

let defCount = 0;
for (const f of files("schemas")) {
  for (const [name, def] of Object.entries(JSON.parse(read(f)).$defs ?? {})) {
    defCount++;
    if (!/§\d/.test(def.description ?? "")) fail(`${f}: $defs/${name} has no description citing its § (schema style)`);
  }
}

// ---------- PD / E / S references ----------

function files(dir) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = join(dir, name);
    if (name === "node_modules") continue;
    if (statSync(join(ROOT, p)).isDirectory()) out.push(...files(p));
    else if (/\.(json|jsonl|mjs|ts|md)$/.test(name)) out.push(p);
  }
  return out;
}
const contracts = read("CONTRACTS.md");
const summary = contracts.slice(contracts.indexOf("## D2 sign-off summary"), contracts.indexOf("\n---\n"));
const defined = {
  PD: new Set([...contracts.matchAll(/^- \*\*(PD-\d+),/gm)].map((m) => m[1])),
  E: new Set([...read("ESCALATIONS.md").matchAll(/^## (E-\d+):/gm)].map((m) => m[1])),
  S: new Set([...read("SPIKE_DEPENDENCIES.md").matchAll(/^## (S-\d+):/gm)].map((m) => m[1])),
};
const used = new Map();
for (const f of [...files("schemas"), ...files("scripts"), ...files("examples"), ...files("types"), ...files("test"), "CONTRACTS.md", "ESCALATIONS.md", "SPIKE_DEPENDENCIES.md", "COVERAGE.md"]) {
  for (const m of read(f).matchAll(/\b(PD|E|S)-(\d+)\b/g)) {
    const id = `${m[1]}-${m[2]}`;
    if (!used.has(id)) used.set(id, f);
  }
}
for (const [id, f] of used) {
  const kind = id.split("-")[0];
  if (!defined[kind].has(id)) fail(`${id} (used in ${relative(".", f)}) is not defined`);
}
for (const kind of ["PD", "E"]) {
  for (const id of defined[kind]) if (!new RegExp(`^\\| ${id} \\|`, "m").test(summary)) fail(`${id} is missing from the D2 sign-off summary`);
}
for (const id of defined.S) if (!summary.includes(id)) fail(`${id} is missing from the D2 sign-off summary`);
for (const id of defined.S) if (!new RegExp(`^\\| ${id} \\|`, "m").test(read("SPIKE_DEPENDENCIES.md"))) fail(`${id} is missing from the SPIKE_DEPENDENCIES.md table`);

// ---------- example sources are verbatim spec code ----------

const spec = readFileSync(join(ROOT, "..", "docs", "spec", "golem-spec-v0.2.md"), "utf8");
const blocks = [...spec.matchAll(/```golem\n([\s\S]*?)```/g)].map((m) => m[1]);
for (const f of files("examples/lumberjack")) {
  let text = read(f);
  // A file is one block or several blocks joined by a newline.
  while (text.length > 0) {
    const b = blocks.find((x) => text.startsWith(x));
    if (!b) {
      fail(`${f} is not a verbatim copy of spec code blocks (diverges at ${JSON.stringify(text.slice(0, 40))})`);
      break;
    }
    text = text.slice(b.length).replace(/^\n/, "");
  }
}

if (problems.length) {
  for (const p of problems) console.error(`check-docs: ${p}`);
  process.exit(1);
}
console.log(`check-docs: ${rows} coverage rows covered, ${defCount} schema definitions cite their §, ${used.size} PD/E/S references defined, example sources verbatim`);
