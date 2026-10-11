// Authoring helpers for hand-written IR examples. Nothing here lowers source: every state, transition
// and expression in an example is written out by hand. The helpers only locate source text to
// compute exact spans, keep node shapes uniform and print the JSON compactly and deterministically.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---------- sources and spans ----------

export class Source {
  constructor(index, path, text) {
    this.index = index;
    this.path = path;
    this.text = text;
    this.sha256 = createHash("sha256").update(text, "utf8").digest("hex");
    this.lineStarts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === "\n") this.lineStarts.push(i + 1);
  }
  // 1-based line and code-point column of a UTF-16 offset (PD-16).
  pos(off) {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= off) lo = mid;
      else hi = mid - 1;
    }
    const col = [...this.text.slice(this.lineStarts[lo], off)].length + 1;
    return [lo + 1, col];
  }
  // Cursor over the whole file.
  get all() {
    return new Cursor(this, 0, this.text.length);
  }
  at(text, nth = 0) {
    return this.all.sub(text, nth);
  }
}

// A located piece of source text. sub() searches inside it, next() searches forward from it.
export class Cursor {
  constructor(src, off, len) {
    this.src = src;
    this.off = off;
    this.len = len;
  }
  get text() {
    return this.src.text.slice(this.off, this.off + this.len);
  }
  get span() {
    const [l, c] = this.src.pos(this.off);
    const [el, ec] = this.src.pos(this.off + this.len);
    return [this.src.index, l, c, el, ec];
  }
  #find(text, nth, from, to) {
    let at = from - 1;
    for (let i = 0; i <= nth; i++) {
      at = this.src.text.indexOf(text, at + 1);
      if (at < 0 || at + text.length > to) {
        throw new Error(`${this.src.path}: "${text}" (#${nth}) not found in ${JSON.stringify(this.text.slice(0, 60))}`);
      }
    }
    return new Cursor(this.src, at, text.length);
  }
  // Occurrence nth of text inside this cursor's text.
  sub(text, nth = 0) {
    return this.#find(text, nth, this.off, this.off + this.len);
  }
  // Occurrence nth of text at or after this cursor's start, anywhere later in the file.
  next(text, nth = 0) {
    return this.#find(text, nth, this.off, this.src.text.length);
  }
  // The whole line that starts with the next occurrence of prefix.
  line(prefix) {
    const start = this.next(prefix);
    const end = this.src.text.indexOf("\n", start.off);
    return new Cursor(this.src, start.off, (end < 0 ? this.src.text.length : end) - start.off);
  }
  // From this cursor's start to the end of other.
  to(other) {
    return new Cursor(this.src, this.off, other.off + other.len - this.off);
  }
}

export function loadSources(dir, paths) {
  return paths.map((p, i) => new Source(i, p, readFileSync(join(dir, p), "utf8")));
}

export function sourceHash(sources) {
  const h = createHash("sha256");
  for (const s of sources) h.update(s.sha256);
  return "sha256:" + h.digest("hex");
}

// ---------- expressions (schemas/ir/expr.schema.json) ----------

const opTarget = (op, ...types) => `${op}(${types.join(",")})`;
const withOrder = (o, order) => (order ? { ...o, order } : o);

export const E = {
  lit: (k, type, form, value) => ({ kind: "lit", type, form, value, text: k.text, span: k.span }),
  local: (k, name, type) => ({ kind: "local", type, name, span: k.span }),
  param: (k, name, type) => ({ kind: "param", type, name, span: k.span }),
  aparam: (k, name, type) => ({ kind: "aparam", type, name, span: k.span }),
  avar: (k, name, type) => ({ kind: "avar", type, name, span: k.span }),
  cnst: (k, name, type) => ({ kind: "const", type, name, span: k.span }),
  bot: (k) => ({ kind: "ambient", type: "Bot", which: "bot", span: k.sub("bot").span }),
  world: (k) => ({ kind: "ambient", type: "World", which: "world", span: k.sub("world").span }),
  old: (k, slot, type) => ({ kind: "old", type, slot, span: k.span }),
  result: (k, type) => ({ kind: "result", type, span: k.span }),
  field: (k, object, field, type) => ({ kind: "field", type, object, field, span: k.span }),
  opt: (k, value, bind, then, type) => ({ kind: "opt", type, value, bind, then, span: k.span }),
  coalesce: (k, left, right, type) => ({ kind: "coalesce", type, left, right, span: k.span }),
  un: (k, op, operand, type) => ({ kind: "unary", type, op, operand, target: opTarget(op, operand.type), span: k.span }),
  bin: (k, op, left, right, type) => ({
    kind: "binary",
    type,
    op,
    left,
    right,
    target: opTarget(op, left.type, right.type),
    span: k.span,
  }),
  logic: (k, op, left, right) => ({ kind: "logic", type: "Bool", op, left, right, span: k.span }),
  ifx: (k, cond, then, els, type) => ({ kind: "if", type, cond, then, else: els, span: k.span }),
  match: (k, scrutinee, arms, type) => ({ kind: "match", type, scrutinee, arms, span: k.span }),
  struct: (k, type, fields) => ({ kind: "struct", type, fields, span: k.span }),
  variant: (k, type, variant, fields) => ({ kind: "variant", type, variant, fields, span: k.span }),
  unwrap: (k, value, type) => ({ kind: "unwrap", type, value, span: k.span }),
  isNone: (k, value) => ({ kind: "is_none", type: "Bool", value, span: k.span }),
  iterMore: (k, iter) => ({ kind: "iter_more", type: "Bool", iter, span: k.span }),
};
E.call = (k, target, type, form, receiver, args, order) =>
  withOrder({ kind: "call", type, target, form, receiver, args, span: k.span }, order);

export const P = {
  wild: (k, type) => ({ kind: "wild", type, span: k.span }),
  none: (k, type) => ({ kind: "none", type, span: k.span }),
  bind: (k, name, type) => ({ kind: "bind", type, name, span: k.span }),
};

// ---------- fn statements and transition actions (schemas/ir/stmt-actions.schema.json) ----------

export const S = {
  bind: (k, local, value, mutable = false) => ({ kind: "bind", local, value, mutable, span: k.span }),
  assign: (k, local, op, value) => ({
    kind: "assign",
    local,
    op,
    value,
    op_target: op === "=" ? null : opTarget(op.slice(0, 1), value.type, value.type),
    span: k.span,
  }),
  if: (k, branches, els = null) => ({ kind: "if", branches, else: els, span: k.span }),
  for: (k, local, over, body) => ({ kind: "for", local, over, body, span: k.span }),
  ret: (k, value = null) => ({ kind: "return", value, span: k.span }),
};

export const A = {
  bind: (k, local, value) => ({ kind: "bind", local, value, span: k.span }),
  eval: (k, value) => ({ kind: "eval", value, span: k.span }),
  notify: (k, notice, fields) => ({ kind: "notify", notice, fields, span: k.span }),
  fail: (k, failure, fields = []) => ({ kind: "fail", failure: { failure, fields }, span: k.span }),
  ret: (k, value = null) => ({ kind: "return", value, span: k.span }),
  defer: (k, call, args) => ({ kind: "defer", call, args, span: k.span }),
  counterInit: (k, counter, value, min) => ({ kind: "counter_init", counter, value, min, span: k.span }),
  counterStep: (k, counter) => ({ kind: "counter_step", counter, span: k.span }),
  iterInit: (k, iter, over) => ({ kind: "iter_init", iter, over, span: k.span }),
  iterNext: (k, iter, local) => ({ kind: "iter_next", iter, local, span: k.span }),
};

export const fctor = (failure, fields = []) => ({ failure, fields });

// ---------- statecharts (schemas/ir/statechart.schema.json) ----------

export const tr = (guard, actions, target) => ({ guard, actions, target });
export const ftr = (on, guard, actions, target) => ({ on, guard, actions, target });
export const pat = (failure, binders = null) => ({ failure, binders });

export class Chart {
  constructor(owner, locals = {}) {
    this.owner = owner;
    this.locals = locals;
    this.states = {};
  }
  id(path) {
    return path === "" ? this.owner : `${this.owner}#${path}`;
  }
  add(path, state) {
    const id = this.id(path);
    if (this.states[id]) throw new Error(`duplicate state ${id}`);
    const { kind, parent = this.owner, span = null, ...rest } = state;
    this.states[id] = { kind, parent: path === "" ? null : parent, ...rest, span };
    return id;
  }
  toJSON() {
    const states = {};
    for (const id of Object.keys(this.states).sort(compareIds)) states[id] = this.states[id];
    return { owner: this.owner, root: this.owner, locals: sortKeys(this.locals), states };
  }
}

// State ids sort by their path segments, numerically where both are numbers.
export function compareIds(a, b) {
  const sa = a.split(/[#.]/);
  const sb = b.split(/[#.]/);
  for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
    if (sa[i] === sb[i]) continue;
    const na = /^\d+$/.test(sa[i]);
    const nb = /^\d+$/.test(sb[i]);
    if (na && nb) return Number(sa[i]) - Number(sb[i]);
    return sa[i] < sb[i] ? -1 : 1;
  }
  return sa.length - sb.length;
}

export function sortKeys(o) {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
}

// ---------- output ----------

// JSON with two-space indentation, printing arrays and objects on one line when they fit.
export function stringify(value, indent = "") {
  const flat = JSON.stringify(value);
  if (flat === undefined) throw new Error("cannot stringify undefined");
  if (typeof value !== "object" || value === null) return flat;
  const inner = indent + "  ";
  if (flat.length + indent.length <= 100 && !flat.includes('"kind"')) return inline(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((v) => inner + stringify(v, inner)).join(",\n")}\n${indent}]`;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return "{}";
  return `{\n${keys.map((k) => `${inner}${JSON.stringify(k)}: ${stringify(value[k], inner)}`).join(",\n")}\n${indent}}`;
}

function inline(value) {
  if (typeof value !== "object" || value === null) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  return `{${Object.keys(value).map((k) => `${JSON.stringify(k)}: ${inline(value[k])}`).join(", ")}}`;
}
