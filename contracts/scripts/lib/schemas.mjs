// Loads every schema under schemas/ into one Ajv instance (JSON Schema 2020-12).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const SCHEMA_DIR = join(ROOT, "schemas");
export const BASE_URI = "https://psu-de.github.io/golem/contracts/0.1/";

export function schemaFiles(dir = SCHEMA_DIR) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...schemaFiles(path));
    else if (name.endsWith(".schema.json")) out.push(path);
  }
  return out;
}

export function loadSchemas() {
  const schemas = new Map();
  for (const path of schemaFiles()) {
    const rel = relative(SCHEMA_DIR, path).split("\\").join("/");
    const schema = JSON.parse(readFileSync(path, "utf8"));
    if (schema.$id !== BASE_URI + rel) {
      throw new Error(`${rel}: $id must be ${BASE_URI + rel}, found ${schema.$id}`);
    }
    schemas.set(rel, schema);
  }
  return schemas;
}

export function makeAjv(schemas = loadSchemas()) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
  for (const schema of schemas.values()) ajv.addSchema(schema);
  return ajv;
}

// Returns a validator for a schema file's root, or for one of its $defs.
export function validatorFor(ajv, rel, def) {
  const id = BASE_URI + rel + (def ? `#/$defs/${def}` : "");
  const v = ajv.getSchema(id);
  if (!v) throw new Error(`no schema ${id}`);
  return v;
}
