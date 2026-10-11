#!/usr/bin/env node
// Validates every example against its schema, runs the semantic checks JSON Schema cannot express
// (set and map order, duplicate keys, run-length totals, report sequencing, consistency of the
// Lumberjack session with the Lumberjack IR), runs check-ir on the IR, and confirms that every
// negative fixture in examples/invalid/ fails for exactly the reason its manifest names.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkIr } from "./check-ir.mjs";
import { ROOT, makeAjv, validatorFor } from "./lib/schemas.mjs";
import { WireChecker } from "./lib/wire.mjs";

const EX = join(ROOT, "examples");
const ajv = makeAjv();
const irText = readFileSync(join(EX, "Lumberjack.golem-ir.json"));
const IR = JSON.parse(irText);
const IR_HASH = "sha256:" + createHash("sha256").update(irText).digest("hex");
const wire = new WireChecker(ajv, IR.types);

// file -> [schema file, optional $def, how to read it, semantic file-level checks]
const EXAMPLES = [
  ["Lumberjack.golem-ir.json", "ir.schema.json", null, "json", (v) => checkIr(v, ajv)],
  ["tick-inputs.jsonl", "tick-input.schema.json", null, "jsonl", tickInputs],
  ["deltas.jsonl", "delta.schema.json", null, "jsonl", (vs) => vs.flatMap(delta)],
  ["starts.jsonl", "backend-data.schema.json", "StartRequest", "jsonl", starts],
  ["reports.jsonl", "report.schema.json", null, "jsonl", (vs) => reportStream(vs, IR)],
  ["reports-async.jsonl", "report.schema.json", null, "jsonl", (vs) => reportStream(vs, null)],
  ["commands.jsonl", "command.schema.json", null, "jsonl", () => []],
  ["replies.jsonl", "reply.schema.json", null, "jsonl", replies],
  ["launch.json", "launch.schema.json", null, "json", () => []],
  ["persistence.json", "persistence.schema.json", null, "json", persistence],
  ["diagnostics.jsonl", "diagnostic.schema.json", null, "jsonl", diagnostics],
];

const problem = (code, path, message) => ({ code, path, message });

// ---------- semantic checks ----------

function tickInputs(lines) {
  const out = [];
  let prev = -1;
  lines.forEach((t, i) => {
    if (t.tick <= prev) out.push(problem("tick-order", `[${i}]/tick`, "tick numbers increase from line to line"));
    prev = t.tick;
    out.push(...tickInput(t, `[${i}]`));
  });
  return out;
}

function tickInput(t, at = "") {
  const out = [];
  t.changes.forEach((c, j) => {
    const p = `${at}/changes/${j}`;
    if (c.chunk_load) {
      const l = c.chunk_load;
      const total = 16 * 16 * l.height;
      const sum = (runs) => runs.reduce((n, [, k]) => n + k, 0);
      if (sum(l.runs) !== total) out.push(problem("chunk-runs", p, `runs cover ${sum(l.runs)} positions, the column has ${total}`));
      if (l.runs.some(([i]) => i >= l.palette.length)) out.push(problem("chunk-runs", p, "run index outside the palette"));
      for (const k of ["block_light", "sky_light"]) {
        if (!l[k]) continue;
        if (sum(l[k]) !== total) out.push(problem("chunk-runs", `${p}/${k}`, `${k} covers ${sum(l[k])} positions, the column has ${total}`));
        if (l[k].some(([v]) => v > 15)) out.push(problem("chunk-runs", `${p}/${k}`, "light levels are 0-15"));
      }
    }
    if (typeof c.key === "string" && (c.key.startsWith("world.tag(") || c.key === "world.recipes")) {
      for (const m of wire.check("Set<String>", c.value, `${p}/value`)) out.push(problem("wire-value", p, m));
    }
  });
  return out;
}

function delta(d, i) {
  const seen = new Set();
  const out = [];
  d.forEach((e, j) => {
    if (seen.has(e.key)) out.push(problem("duplicate-key", `[${i}]/${j}`, `key ${e.key} predicted twice`));
    seen.add(e.key);
  });
  return out;
}

function starts(lines) {
  const out = [];
  let prev = 0;
  lines.forEach((s, i) => {
    if (s.action <= prev) out.push(problem("action-order", `[${i}]/action`, "action ids increase (PD-12)"));
    prev = s.action;
  });
  return out;
}

function persistence(s) {
  const out = [];
  const keys = Object.keys(s.instances);
  for (let i = 1; i < keys.length; i++) if (keys[i - 1] >= keys[i]) out.push(problem("section-order", "/instances", "instances are keyed in ascending order"));
  for (const [inst, st] of Object.entries(s.instances)) {
    for (const [name, v] of Object.entries(st.vars)) {
      for (const m of wire.check(v.type, v.value, `/instances/${inst}/vars/${name}`)) out.push(problem("wire-value", `/instances/${inst}/vars/${name}`, m));
    }
  }
  return out;
}

function replies(lines) {
  const out = [];
  lines.forEach((r, i) => {
    if (r.reply === "refused" && ["assign", "cancel", "pause", "resume"].includes(r.command) && !r.job_id) {
      out.push(problem("reply", `[${i}]`, "refusals of job commands carry the command's job_id"));
    }
  });
  return out;
}

function reportStream(lines, ir) {
  const out = [];
  lines.forEach((r, i) => {
    const p = `[${i}]`;
    if (r.seq !== i + 1) out.push(problem("seq", `${p}/seq`, `seq must be ${i + 1} (one per message, from 1)`));
    if (i > 0 && r.tick < lines[i - 1].tick) out.push(problem("tick-order", `${p}/tick`, "ticks never decrease"));
    if (r.bot !== lines[0].bot) out.push(problem("bot", `${p}/bot`, "one bot per stream"));
    if (ir) out.push(...againstIr(r, ir, p));
  });
  return out;
}

// A report of the Lumberjack session must agree with the Lumberjack IR.
function againstIr(r, ir, p) {
  const out = [];
  const wireFailures = new Map(Object.entries(ir.failures).map(([, d]) => [d.wire_name, d]));
  const failure = (f, fp) => {
    const d = wireFailures.get(f.type);
    if (d) {
      const names = d.fields.map((x) => x.name);
      if (Object.keys(f.fields).sort().join() !== [...names].sort().join()) out.push(problem("failure-fields", fp, `${f.type} has fields ${names.join(", ")}`));
      for (const x of d.fields) if (x.name in f.fields) for (const m of wire.check(x.type, f.fields[x.name], `${fp}/fields/${x.name}`)) out.push(problem("wire-value", fp, m));
    } else if (!["Unmet", "Broken", "Stalled", "Timeout", "Rejected", "Unconfirmed", "Interfered", "WindowClosed", "ContractViolation", "Defect", "Disconnected", "Kicked", "Died"].includes(f.type)) {
      out.push(problem("unknown-failure", fp, `${f.type} is not a failure of this bot`));
    }
    for (const fr of f.trace) {
      if (!ir.tasks[fr.task]) out.push(problem("unknown-task", `${fp}/trace`, `${fr.task} is not a task of this bot`));
      if (!ir.header.sources.some((s) => s.path === fr.file)) out.push(problem("unknown-file", `${fp}/trace`, `${fr.file} is not a source of this IR`));
    }
  };
  if (r.failure) failure(r.failure, `${p}/failure`);
  if (r.task && !ir.tasks[r.task]) out.push(problem("unknown-task", `${p}/task`, `${r.task} is not a task of this bot`));
  if (r.instance && r.type !== "state_not_restored" && !ir.activities[r.instance]) out.push(problem("unknown-instance", `${p}/instance`, `no instance ${r.instance}`));
  if (r.type === "hello") {
    if (r.ir_hash !== IR_HASH) out.push(problem("ir-hash", `${p}/ir_hash`, `hello must carry the IR's hash ${IR_HASH}`));
    if (r.jobs.map((j) => j.job).join() !== Object.keys(ir.bot.jobs).join()) out.push(problem("hello", `${p}/jobs`, "jobs differ from the IR"));
    if (r.instances.map((x) => x.instance).join() !== ir.bot.instances.join()) out.push(problem("hello", `${p}/instances`, "instances differ from the IR"));
  }
  if (r.type === "job_started") {
    const j = ir.bot.jobs[r.job];
    if (!j) out.push(problem("unknown-job", `${p}/job`, `${r.job} is not a job of this bot`));
    else for (const prm of j.params) if (prm.name in r.args) for (const m of wire.check(prm.type, r.args[prm.name], `${p}/args/${prm.name}`)) out.push(problem("wire-value", p, m));
  }
  if (r.type === "notice") {
    const n = Object.values(ir.notices).find((d) => d.wire_name === r.name);
    if (!n) out.push(problem("unknown-notice", `${p}/name`, `${r.name} is not a notice of this bot`));
    else for (const x of n.fields) for (const m of wire.check(x.type, r.fields[x.name], `${p}/fields/${x.name}`)) out.push(problem("wire-value", p, m));
  }
  return out;
}

function diagnostics(lines) {
  const out = [];
  const errorsFor = new Set(lines.filter((d) => d.severity === "error").map((d) => d.code.slice(0, 3)));
  for (let c = 0; c <= 14; c++) {
    const code = `C${String(c).padStart(2, "0")}`;
    if (!errorsFor.has(code)) out.push(problem("coverage", "", `no error example for ${code} (finding 15: at least one error per §13.1 check)`));
  }
  const warnings = lines.filter((d) => d.severity === "warning").map((d) => d.code.slice(0, 3)).sort().join();
  if (warnings !== "C01,C07,C08") out.push(problem("coverage", "", "expected one example of each §13.1 warning (C01, C07, C08)"));
  return out;
}

// ---------- reading and patching ----------

function read(file, how) {
  const text = readFileSync(join(EX, file), "utf8");
  if (how === "json") return JSON.parse(text);
  return text.split("\n").filter((l) => l.trim() !== "").map((l, i) => {
    try {
      return JSON.parse(l);
    } catch (e) {
      throw new Error(`${file}:${i + 1}: ${e.message}`);
    }
  });
}

const unescape = (s) => s.replace(/~1/g, "/").replace(/~0/g, "~");
function pointer(doc, path) {
  const parts = path.split("/").slice(1).map(unescape);
  const key = parts.pop();
  let parent = doc;
  for (const p of parts) {
    parent = parent[p];
    if (parent === undefined) throw new Error(`patch path ${path} does not exist`);
  }
  return [parent, key];
}
// RFC 6902 subset: add, remove, replace, move.
function applyPatch(doc, ops) {
  for (const op of ops) {
    const [parent, key] = pointer(doc, op.path);
    if (op.op === "move") {
      const [fp, fk] = pointer(doc, op.from);
      parent[key] = fp[fk];
      delete fp[fk];
    } else if (op.op === "remove") {
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
    } else if (op.op === "add" || op.op === "replace") {
      if (op.op === "replace" && !(key in parent)) throw new Error(`replace target ${op.path} does not exist`);
      if (Array.isArray(parent) && op.op === "add") parent.splice(key === "-" ? parent.length : Number(key), 0, op.value);
      else parent[key] = op.value;
    } else throw new Error(`unsupported patch op ${op.op}`);
  }
  return doc;
}

// ---------- run ----------

let failures = 0;
const report = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};

for (const [file, rel, def, how, semantic] of EXAMPLES) {
  const v = validatorFor(ajv, rel, def);
  const data = read(file, how);
  const items = how === "jsonl" ? data : [data];
  const schemaErrors = [];
  items.forEach((item, i) => {
    if (!v(item)) schemaErrors.push(`${how === "jsonl" ? `line ${i + 1}` : ""}${v.errors[0].instancePath} ${v.errors[0].message}`);
  });
  const sem = schemaErrors.length ? [] : semantic(how === "jsonl" ? items : data);
  report(schemaErrors.length === 0 && sem.length === 0, `examples/${file} (${items.length} ${how === "jsonl" ? "lines" : "document"})`);
  for (const e of schemaErrors.slice(0, 5)) console.log(`       schema: ${e}`);
  for (const e of sem.slice(0, 10)) console.log(`       [${e.code}] ${e.path}: ${e.message}`);
}

const SEMANTIC = {
  "tick-input.schema.json": (v) => tickInput(v),
  "delta.schema.json": (v) => delta(v, 0),
  "persistence.schema.json": persistence,
};
const manifest = JSON.parse(readFileSync(join(EX, "invalid", "manifest.json"), "utf8"));
const listed = new Set(manifest.map((m) => m.file));
for (const f of readdirSync(join(EX, "invalid"))) {
  if (f !== "manifest.json" && !listed.has(f)) report(false, `examples/invalid/${f} is not listed in manifest.json`);
}
for (const m of manifest) {
  const [rel, def] = m.against.split("#");
  const v = validatorFor(ajv, rel, def);
  let value = JSON.parse(readFileSync(join(EX, "invalid", m.file), "utf8"));
  if (value.patch) value = applyPatch(JSON.parse(readFileSync(join(EX, "invalid", value.base), "utf8")), value.patch);
  const schemaOk = v(value);
  const schemaErrors = schemaOk ? [] : v.errors;
  let codes = [];
  if (schemaOk && rel === "ir.schema.json") codes = checkIr(value, ajv).map((e) => e.code);
  else if (schemaOk && SEMANTIC[rel]) codes = SEMANTIC[rel](value).map((e) => e.code);
  let matched;
  if (m.expect.schema) {
    const x = m.expect.schema;
    matched = schemaErrors.some((e) => e.keyword === x.keyword && e.instancePath === x.path &&
      (!x.param || Object.values(e.params).includes(x.param) || e.propertyName === x.param));
  } else {
    const code = m.expect.semantic ?? m.expect.checkIr;
    matched = schemaOk && codes.includes(code);
  }
  const why = schemaOk ? (codes.length ? codes.join(", ") : "it passed") : `${schemaErrors[0].keyword} at '${schemaErrors[0].instancePath}'`;
  report(matched, `examples/invalid/${m.file} fails as expected (${JSON.stringify(m.expect)})${matched ? "" : `; got ${why}`}`);
}

if (failures) {
  console.error(`validate-all: ${failures} failure(s)`);
  process.exit(1);
}
console.log("validate-all: all examples valid, all negative fixtures rejected for their stated reason");
