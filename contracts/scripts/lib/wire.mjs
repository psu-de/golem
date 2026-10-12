// Type-directed check of §6.9 wire values: what JSON Schema cannot say on its own, such as that a
// Set<T> is ascending and duplicate-free or that a struct value has exactly its declared fields.
// Types come from IR TypeRefs; user structs and enums from the IR's types section.
import { parseType, typeToString } from "./names.mjs";
import { validatorFor } from "./schemas.mjs";

const INT_MAX = 9007199254740991;

export class WireChecker {
  constructor(ajv, types = {}) {
    this.types = types;
    this.v = {};
    for (const d of ["ItemFilter", "BlockFilter", "EntityFilter", "ItemStack", "BlockState", "ResourceId", "Tag", "Goal", "Region", "PathOpts", "BuildOpts"]) {
      this.v[d] = validatorFor(ajv, "wire.schema.json", d);
    }
  }

  // Returns a list of error strings (empty when value decodes to type).
  check(type, value, path = "value") {
    const errors = [];
    this.#check(typeof type === "string" ? parseType(type) : type, value, path, errors);
    return errors;
  }

  #schema(def, value, path, errors) {
    if (!this.v[def](value)) errors.push(`${path}: not a ${def}: ${JSON.stringify(value).slice(0, 80)}`);
  }

  #check(t, value, path, errors) {
    if (t.optional) {
      if (value === null) return;
      this.#check({ ...t, optional: false }, value, path, errors);
      return;
    }
    const name = t.name;
    const isInt = (x) => Number.isInteger(x) && Math.abs(x) <= INT_MAX;
    switch (name) {
      case "Unit":
        if (value !== null) errors.push(`${path}: Unit must be null`);
        return;
      case "Bool":
        if (typeof value !== "boolean") errors.push(`${path}: expected Bool`);
        return;
      case "Int":
      case "Duration":
        if (!isInt(value)) errors.push(`${path}: expected ${name} (an integer with |n| <= 2^53 - 1)`);
        return;
      case "Float":
      case "Angle":
        if (typeof value !== "number") errors.push(`${path}: expected ${name}`);
        return;
      case "String":
        if (typeof value !== "string") errors.push(`${path}: expected String`);
        return;
      case "BlockPos":
      case "Range":
        if (!Array.isArray(value) || value.length !== (name === "Range" ? 2 : 3) || !value.every(isInt)) errors.push(`${path}: expected ${name}`);
        return;
      case "Vec3":
        if (!Array.isArray(value) || value.length !== 3 || !value.every((x) => typeof x === "number")) errors.push(`${path}: expected Vec3`);
        return;
      case "ItemType":
      case "BlockType":
      case "EntityType":
        this.#schema("ResourceId", value, path, errors);
        return;
      case "Tag":
      case "Region":
      case "BlockState":
      case "ItemStack":
      case "ItemFilter":
      case "BlockFilter":
      case "EntityFilter":
      case "PathOpts":
      case "BuildOpts":
      case "Goal":
        this.#schema(name, value, path, errors);
        return;
      case "List":
        if (!Array.isArray(value)) errors.push(`${path}: expected List`);
        else value.forEach((x, i) => this.#check(t.args[0], x, `${path}[${i}]`, errors));
        return;
      case "Set":
        if (!Array.isArray(value)) errors.push(`${path}: expected Set`);
        else {
          value.forEach((x, i) => this.#check(t.args[0], x, `${path}[${i}]`, errors));
          this.#ascending(t.args[0], value, path, errors);
        }
        return;
      case "Map": {
        const [k, v] = t.args;
        if (k.name === "String" && !k.optional) {
          if (typeof value !== "object" || value === null || Array.isArray(value)) errors.push(`${path}: Map<String, V> is an object`);
          else for (const [key, x] of Object.entries(value)) this.#check(v, x, `${path}.${key}`, errors);
          return;
        }
        if (!Array.isArray(value) || !value.every((p) => Array.isArray(p) && p.length === 2)) {
          errors.push(`${path}: Map<K, V> is an array of [key, value] pairs`);
          return;
        }
        value.forEach(([key, x], i) => {
          this.#check(k, key, `${path}[${i}][0]`, errors);
          this.#check(v, x, `${path}[${i}][1]`, errors);
        });
        this.#ascending(k, value.map((p) => p[0]), path, errors);
        return;
      }
      case "Entity":
      case "Window":
      case "Inventory":
      case "Bot":
      case "World":
        errors.push(`${path}: ${name} is not a wire type (§6.9)`);
        return;
      default:
        this.#declared(t, value, path, errors);
    }
  }

  #declared(t, value, path, errors) {
    const key = t.args.length ? `${t.name}<${t.args.map(typeToString).join(",")}>` : t.name;
    const decl = this.types[key];
    if (!decl) {
      errors.push(`${path}: unknown type ${key}`);
      return;
    }
    const fieldsOk = (fields, obj, p) => {
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
        errors.push(`${p}: expected an object of fields`);
        return;
      }
      const names = new Set(fields.map((f) => f.name));
      for (const k of Object.keys(obj)) if (!names.has(k)) errors.push(`${p}: unknown field ${k}`);
      for (const f of fields) {
        if (!(f.name in obj)) errors.push(`${p}: missing field ${f.name}`);
        else this.#check(parseType(f.type), obj[f.name], `${p}.${f.name}`, errors);
      }
    };
    if (decl.kind === "struct") fieldsOk(decl.fields, value, path);
    else if (typeof value === "string") {
      const v = decl.variants.find((x) => x.name === value);
      if (!v || v.fields.length > 0) errors.push(`${path}: ${value} is not a field-less variant of ${key}`);
    } else if (typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 1) {
      const [name] = Object.keys(value);
      const v = decl.variants.find((x) => x.name === name);
      if (!v) errors.push(`${path}: ${name} is not a variant of ${key}`);
      else fieldsOk(v.fields, value[name], `${path}.${name}`);
    } else errors.push(`${path}: expected a variant of ${key}`);
  }

  // §6.9: set elements and map keys ascending without duplicates, by the type's Ord (§6.1).
  #ascending(t, items, path, errors) {
    for (let i = 1; i < items.length; i++) {
      const c = this.compare(t, items[i - 1], items[i]);
      if (c === 0) errors.push(`${path}: duplicate element at [${i}]`);
      else if (c > 0) errors.push(`${path}: elements out of ascending order at [${i}]`);
    }
  }

  compare(t, a, b) {
    if (a === null || b === null) return a === b ? 0 : a === null ? -1 : 1;
    switch (t.name) {
      case "Bool":
        return Number(a) - Number(b);
      case "Int":
      case "Duration":
        return a - b;
      case "String":
      case "ItemType":
      case "BlockType":
      case "EntityType":
        // String by code point (§6.1); registry types by their id string (escalation E-10).
        return a < b ? -1 : a > b ? 1 : 0;
      case "BlockPos":
        for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
        return 0;
      default: {
        const decl = this.types[t.name];
        if (decl?.kind === "enum") {
          const idx = (v) => decl.variants.findIndex((x) => x.name === (typeof v === "string" ? v : Object.keys(v)[0]));
          return idx(a) - idx(b);
        }
        const sa = JSON.stringify(a);
        const sb = JSON.stringify(b);
        return sa < sb ? -1 : sa > sb ? 1 : 0;
      }
    }
  }
}
