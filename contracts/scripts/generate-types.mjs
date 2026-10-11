#!/usr/bin/env node
// Generates types/**/*.d.ts from schemas/**/*.schema.json (the single source of truth for data shapes).
//
//   node scripts/generate-types.mjs          write the .d.ts files
//   node scripts/generate-types.mjs --check  fail if regenerating would change any file
//
// Every $defs entry becomes an exported type alias of the same name; $refs across files become
// type-only imports. Def names are unique across the package, so types/index.d.ts re-exports all.
// The generator supports exactly the keyword subset the schemas use and fails on anything else,
// so a schema change can never be silently dropped from the types.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { ROOT, loadSchemas } from "./lib/schemas.mjs";

const TYPES_DIR = join(ROOT, "types");
const HANDWRITTEN = ["backend.d.ts"];

const IGNORED = new Set([
  "$schema", "$id", "$defs", "title", "description", "pattern", "minimum", "maximum", "minLength", "maxLength",
  "minItems", "maxItems", "minProperties", "maxProperties", "uniqueItems", "multipleOf", "propertyNames",
  "unevaluatedProperties", "default", "required", "not",
]);
const HANDLED = new Set(["$ref", "const", "enum", "oneOf", "anyOf", "allOf", "type", "properties", "additionalProperties", "items", "prefixItems"]);

function fail(msg) {
  throw new Error(msg);
}

function outPath(rel) {
  return rel.replace(/\.schema\.json$/, ".d.ts");
}

function importPath(fromRel, toRel) {
  let p = relative(dirname(fromRel), outPath(toRel)).split("\\").join("/").replace(/\.d\.ts$/, ".js");
  if (!p.startsWith(".")) p = "./" + p;
  return p;
}

function doc(text, indent) {
  if (!text) return "";
  const lines = text.replace(/\*\//g, "*\\/").split("\n");
  return `${indent}/**\n${lines.map((l) => `${indent} * ${l}`.trimEnd()).join("\n")}\n${indent} */\n`;
}

function generateFile(rel, schema, owners) {
  const imports = new Map(); // file -> Set(names)

  function resolveRef(ref) {
    const [file, pointer] = ref.split("#");
    const m = /^\/\$defs\/([A-Za-z0-9_]+)$/.exec(pointer ?? "");
    if (!m) fail(`${rel}: unsupported $ref ${ref}`);
    const name = m[1];
    const target = file ? join(dirname(rel), file).split("\\").join("/") : rel;
    if (owners.get(name) !== target) fail(`${rel}: $ref ${ref} does not resolve to a known def (owner ${owners.get(name)})`);
    if (target !== rel) {
      if (!imports.has(target)) imports.set(target, new Set());
      imports.get(target).add(name);
    }
    return name;
  }

  function ts(s, indent) {
    if (s === true || (typeof s === "object" && Object.keys(s).every((k) => IGNORED.has(k)))) return "unknown";
    if (s === false) return "never";
    for (const k of Object.keys(s)) {
      if (!IGNORED.has(k) && !HANDLED.has(k)) fail(`${rel}: unsupported keyword ${k}`);
    }
    if (s.$ref) return resolveRef(s.$ref);
    if ("const" in s) return JSON.stringify(s.const);
    if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" | ");
    if (s.oneOf || s.anyOf) return union((s.oneOf ?? s.anyOf).map((x) => ts(x, indent)));
    if (s.allOf) {
      const parts = s.allOf.map((x) => ts(x, indent)).filter((t) => t !== "unknown");
      return parts.length === 0 ? "unknown" : parts.map(paren).join(" & ");
    }
    const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : s.properties ? ["object"] : [];
    if (types.length === 0) fail(`${rel}: schema without type: ${JSON.stringify(s).slice(0, 120)}`);
    return union(types.map((t) => typeOf(t, s, indent)));
  }

  function typeOf(t, s, indent) {
    switch (t) {
      case "null":
        return "null";
      case "boolean":
        return "boolean";
      case "integer":
      case "number":
        return "number";
      case "string":
        return "string";
      case "array":
        if (s.prefixItems) {
          if (s.items !== false) fail(`${rel}: prefixItems without items: false`);
          return `[${s.prefixItems.map((x) => ts(x, indent)).join(", ")}]`;
        }
        return `${paren(s.items === undefined ? "unknown" : ts(s.items, indent))}[]`;
      case "object":
        return objectType(s, indent);
      default:
        fail(`${rel}: unsupported type ${t}`);
    }
  }

  function objectType(s, indent) {
    const props = s.properties ?? {};
    const required = new Set(s.required ?? []);
    const inner = indent + "  ";
    const lines = [];
    for (const [name, p] of Object.entries(props)) {
      const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
      lines.push(`${doc(p.description, inner)}${inner}${key}${required.has(name) ? "" : "?"}: ${ts(p, inner)};`);
    }
    const ap = s.additionalProperties;
    if (ap !== undefined && ap !== false) {
      const t = ap === true ? "unknown" : ts(ap, inner);
      if (lines.length > 0) lines.push(`${inner}[k: string]: unknown;`);
      else lines.push(`${inner}[k: string]: ${t};`);
    }
    if (lines.length === 0) return ap === false || s.maxProperties === 0 ? "Record<string, never>" : "{}";
    return `{\n${lines.join("\n")}\n${indent}}`;
  }

  const body = [];
  for (const [name, def] of Object.entries(schema.$defs ?? {})) {
    body.push(`${doc(def.description, "")}export type ${name} = ${ts(def, "")};`);
  }
  const head = [
    "// Generated by scripts/generate-types.mjs from schemas/" + rel + ". Do not edit by hand:",
    "// change the schema and run `npm run generate-types`.",
    "",
  ];
  for (const [file, names] of [...imports].sort(([a], [b]) => a.localeCompare(b))) {
    head.push(`import type { ${[...names].sort().join(", ")} } from "${importPath(rel, file)}";`);
  }
  if (imports.size > 0) head.push("");
  return head.join("\n") + body.join("\n\n") + "\n";
}

function union(parts) {
  const uniq = [...new Set(parts)];
  return uniq.length === 1 ? uniq[0] : uniq.map(paren).join(" | ");
}

// Parenthesises t when it has a top-level union or intersection.
function paren(t) {
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if ("{[(<".includes(c)) depth++;
    else if ("}])>".includes(c)) depth--;
    else if (c === '"') i = t.indexOf('"', i + 1);
    else if (depth === 0 && (c === "|" || c === "&")) return `(${t})`;
  }
  return t;
}

function main() {
  const check = process.argv.includes("--check");
  const schemas = loadSchemas();
  const owners = new Map();
  for (const [rel, schema] of schemas) {
    for (const name of Object.keys(schema.$defs ?? {})) {
      if (owners.has(name)) fail(`def ${name} is defined in both ${owners.get(name)} and ${rel}; def names must be unique`);
      owners.set(name, rel);
    }
  }
  const outputs = new Map();
  for (const [rel, schema] of schemas) outputs.set(outPath(rel), generateFile(rel, schema, owners));
  const index = [
    "// Generated by scripts/generate-types.mjs. Do not edit by hand.",
    "// Every generated data type, plus the hand-written Backend interface.",
    "",
    ...[...outputs.keys()].sort().map((p) => `export type * from "./${p.replace(/\.d\.ts$/, ".js")}";`),
    ...HANDWRITTEN.map((p) => `export type * from "./${p.replace(/\.d\.ts$/, ".js")}";`),
    "",
  ].join("\n");
  outputs.set("index.d.ts", index);

  const stale = [];
  for (const [p, text] of outputs) {
    const file = join(TYPES_DIR, p);
    const current = existsSync(file) ? readFileSync(file, "utf8") : null;
    if (current === text) continue;
    if (check) stale.push(p);
    else {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
      console.log(`wrote types/${p}`);
    }
  }
  if (check) {
    if (stale.length > 0) {
      console.error(`generated types are stale (run npm run generate-types): ${stale.join(", ")}`);
      process.exit(1);
    }
    console.log(`generate-types --check: ${outputs.size} files up to date`);
  }
}

main();
