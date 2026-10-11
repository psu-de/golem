#!/usr/bin/env node
// Referential integrity and well-formedness of an IR file beyond its JSON Schema (§18.2-§18.3):
// name and type grammars, state-id grammar and uniqueness, transition targets, call targets and
// arities, expression typing, locals, failures and notices, wire values (set order included),
// contracts consistency, section ordering, and that the IR holds exactly what the bot reaches.
//
//   node scripts/check-ir.mjs <file.golem-ir.json>
//
// Exit code 0 when the IR is clean; 1 with one line per problem otherwise.
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { BUILTIN_TYPES, namedTypes, parseQualified, parseStateId, parseType } from "./lib/names.mjs";
import { makeAjv, validatorFor } from "./lib/schemas.mjs";
import { WireChecker } from "./lib/wire.mjs";

const BUILTIN_FAILURES = new Map([
  ["Unmet", 2], ["Broken", 2], ["Stalled", 1], ["Timeout", 1], ["Rejected", 2], ["Unconfirmed", 1], ["Interfered", 2],
  ["WindowClosed", 1], ["ContractViolation", 2], ["Defect", 2], ["Disconnected", 1], ["Kicked", 1], ["Died", 1],
]);
const CATCHABLE = new Set(["Unmet", "Broken", "Stalled", "Timeout", "Rejected", "Unconfirmed", "Interfered", "WindowClosed"]);
const BUILTIN_CONSTS = new Map([
  ["ItemFilter.ANY", "ItemFilter"], ["ItemFilter.NOTHING", "ItemFilter"], ["BlockFilter.ANY", "BlockFilter"],
  ["BlockFilter.NOTHING", "BlockFilter"], ["EntityFilter.ANY", "EntityFilter"], ["EntityFilter.NOTHING", "EntityFilter"],
]);
const BUILTIN_FIELDS = {
  BlockPos: { x: "Int", y: "Int", z: "Int" },
  Vec3: { x: "Float", y: "Float", z: "Float" },
  Region: { min: "BlockPos", max: "BlockPos" },
  Range: { start: "Int", end: "Int" },
  ItemStack: { item: "ItemType", count: "Int" },
};
const COMPOUND = new Set(["scope", "abort", "try", "retry", "atomic", "async", "with"]);
const RESOURCES = ["legs", "head", "hands", "stance", "inventory", "screen"];
const BUILTIN_OP = /^(\+|-|\*|\/|%|==|!=|<|<=|>|>=|matches|in|\||&|!|\.\.|\.\.=|\[\])\((.*)\)$/;

export function checkIr(ir, ajv = makeAjv()) {
  const errors = [];
  const err = (code, path, message) => errors.push({ code, path, message });

  const validate = validatorFor(ajv, "ir.schema.json");
  if (!validate(ir)) {
    for (const e of validate.errors.slice(0, 20)) err("schema", e.instancePath, `${e.keyword}: ${e.message}`);
    return errors;
  }
  const wire = new WireChecker(ajv, ir.types);
  const reached = { types: new Set(), failures: new Set(), notices: new Set(), consts: new Set(), fns: new Set(), tasks: new Set() };

  // ---------- names and types ----------

  const typeOk = (t, path) => {
    let parsed;
    try {
      parsed = parseType(t);
    } catch (e) {
      err("type-syntax", path, `${t}: ${e.message}`);
      return false;
    }
    for (const n of namedTypes(parsed)) {
      if (BUILTIN_TYPES.has(n.name) && n.base === n.name.concat(n.arity ? n.base.slice(n.name.length) : "")) {
        if (BUILTIN_TYPES.get(n.name) !== n.arity) err("unknown-type", path, `${n.name} takes ${BUILTIN_TYPES.get(n.name)} type arguments`);
      } else if (ir.types[n.base]) reached.types.add(n.base);
      else err("unknown-type", path, `${n.base} is neither built in nor in types`);
    }
    return true;
  };
  const nameOk = (n, path) => {
    try {
      return parseQualified(n);
    } catch (e) {
      err("name-syntax", path, `${n}: ${e.message}`);
      return null;
    }
  };
  const assignable = (s, t) => s === t || t === `${s}?`;
  const stripOpt = (t) => (t.endsWith("?") ? t.slice(0, -1) : t);

  const sorted = (obj, path) => {
    const keys = Object.keys(obj);
    for (let i = 1; i < keys.length; i++) if (keys[i - 1] >= keys[i]) err("section-order", path, `keys must be ascending: ${keys[i - 1]} before ${keys[i]}`);
  };
  for (const s of ["types", "failures", "notices", "consts", "fns", "tasks", "activities", "contracts"]) sorted(ir[s], `/${s}`);
  sorted(ir.bot.jobs, "/bot/jobs");

  const spanOk = (span, path) => {
    if (span === null) return;
    const [file, l, c, el, ec] = span;
    if (file >= ir.header.sources.length) err("span", path, `file index ${file} out of range`);
    if (el < l || (el === l && ec < c)) err("span", path, `span ends before it starts`);
  };

  // ---------- failures, notices ----------

  const failureArity = (name, path) => {
    if (BUILTIN_FAILURES.has(name)) return BUILTIN_FAILURES.get(name);
    const d = ir.failures[name];
    if (!d) {
      err("unknown-failure", path, `${name} is neither built in nor in failures`);
      return null;
    }
    reached.failures.add(name);
    return d.fields.length;
  };
  for (const [name, d] of Object.entries(ir.failures)) {
    const q = nameOk(name, `/failures/${name}`);
    if (q && q.member !== d.wire_name) err("name-syntax", `/failures/${name}`, `wire_name ${d.wire_name} must be the simple name ${q.member}`);
    d.fields.forEach((f, i) => typeOk(f.type, `/failures/${name}/fields/${i}`));
  }
  for (const [name, d] of Object.entries(ir.notices)) {
    const q = nameOk(name, `/notices/${name}`);
    if (q && q.member !== d.wire_name) err("name-syntax", `/notices/${name}`, `wire_name ${d.wire_name} must be the simple name ${q.member}`);
    d.fields.forEach((f, i) => typeOk(f.type, `/notices/${name}/fields/${i}`));
  }
  const wireNames = new Map();
  for (const [name, d] of [...Object.entries(ir.failures), ...Object.entries(ir.notices)]) {
    if (wireNames.has(d.wire_name)) err("wire-name-clash", `/failures/${name}`, `wire name ${d.wire_name} also used by ${wireNames.get(d.wire_name)} (escalation E-5)`);
    wireNames.set(d.wire_name, name);
  }
  for (const [name, d] of Object.entries(ir.types)) {
    nameOk(name.replace(/<.*$/, ""), `/types/${name}`);
    const fields = d.kind === "struct" ? d.fields : d.variants.flatMap((v) => v.fields);
    fields.forEach((f, i) => {
      typeOk(f.type, `/types/${name}/fields/${i}`);
      if ("default" in f) for (const m of wire.check(f.type, f.default)) err("wire-value", `/types/${name}`, m);
    });
  }

  // ---------- expressions ----------

  function expr(e, ctx, path) {
    typeOk(e.type, `${path}/type`);
    spanOk(e.span, `${path}/span`);
    const sub = (x, p) => expr(x, ctx, `${path}/${p}`);
    const want = (cond, msg) => cond || err("type-mismatch", path, msg);
    switch (e.kind) {
      case "lit":
        if (e.form === "none") want(e.value === null && e.type.endsWith("?"), "none must be null with an optional type");
        else for (const m of wire.check(e.type, e.value, path)) err("wire-value", path, m);
        break;
      case "local": {
        const t = ctx.scoped.get(e.name) ?? ctx.locals?.[e.name];
        if (t === undefined) err("local-undeclared", path, `local ${e.name} is not declared`);
        else want(t === e.type, `local ${e.name} has type ${t}, node says ${e.type}`);
        break;
      }
      case "param": {
        const p = ctx.params?.find((x) => x.name === e.name);
        if (!p) err("param-unknown", path, `no parameter ${e.name}`);
        else want(p.type === e.type, `parameter ${e.name} has type ${p.type}, node says ${e.type}`);
        break;
      }
      case "aparam": {
        const p = ctx.aparams?.find((x) => x.name === e.name);
        if (!p) err("param-unknown", path, `no activity parameter ${e.name}`);
        else want(p.type === e.type, `activity parameter ${e.name} has type ${p.type}`);
        break;
      }
      case "avar": {
        const v = ctx.avars?.find((x) => x.name === e.name);
        if (!v) err("param-unknown", path, `no activity var ${e.name}`);
        else want(v.type === e.type, `var ${e.name} has type ${v.type}`);
        break;
      }
      case "const": {
        const c = ir.consts[e.name];
        const t = c ? c.type : BUILTIN_CONSTS.get(e.name);
        if (!t) err("unknown-target", path, `no const ${e.name}`);
        else want(t === e.type, `const ${e.name} has type ${t}`);
        if (c) reached.consts.add(e.name);
        break;
      }
      case "ambient":
        want(e.type === (e.which === "bot" ? "Bot" : "World"), "ambient type");
        break;
      case "old":
        if (!ctx.olds) err("old-slot", path, "old(...) is only allowed in ensures, invariant and maintains (§9.4)");
        else if (e.slot >= ctx.olds.length) err("old-slot", path, `old slot ${e.slot} does not exist`);
        else want(ctx.olds[e.slot].type === e.type, `old slot ${e.slot} has type ${ctx.olds[e.slot].type}`);
        break;
      case "result":
        if (!ctx.result) err("result-misplaced", path, "result is only allowed in ensures of a non-Unit task (§9.4)");
        else want(ctx.result === e.type, `result has type ${ctx.result}`);
        break;
      case "self":
        break;
      case "field": {
        sub(e.object, "object");
        const ot = e.object.type;
        const decl = ir.types[ot];
        const ft = BUILTIN_FIELDS[ot]?.[e.field] ?? (decl?.kind === "struct" ? decl.fields.find((f) => f.name === e.field)?.type : undefined);
        if (!ft) err("unknown-field", path, `${ot} has no field ${e.field}`);
        else want(ft === e.type, `field ${ot}.${e.field} has type ${ft}`);
        break;
      }
      case "call": {
        const f = ir.fns[e.target];
        if (!f) {
          err("unknown-target", path, `call target ${e.target} is not in fns`);
          break;
        }
        reached.fns.add(e.target);
        const hasSelf = f.params[0]?.name === "self";
        const ps = hasSelf ? f.params.slice(1) : f.params;
        if (hasSelf !== (e.receiver !== null)) err("call-arity", path, `${e.target}: receiver ${hasSelf ? "required" : "not allowed"}`);
        if (e.receiver) {
          sub(e.receiver, "receiver");
          want(assignable(e.receiver.type, f.params[0].type), `${e.target}: receiver ${e.receiver.type} is not ${f.params[0].type}`);
        }
        if (e.form === "property" && (!hasSelf || ps.length > 0)) err("call-arity", path, `${e.target} is not a property`);
        if (e.args.length !== ps.length) err("call-arity", path, `${e.target} takes ${ps.length} arguments, got ${e.args.length}`);
        e.args.forEach((a, i) => {
          sub(a, `args/${i}`);
          if (ps[i]) want(assignable(a.type, ps[i].type), `${e.target} argument ${ps[i].name}: ${a.type} is not ${ps[i].type}`);
        });
        want(f.result === e.type, `${e.target} returns ${f.result}, node says ${e.type}`);
        break;
      }
      case "opt": {
        sub(e.value, "value");
        want(e.value.type.endsWith("?"), "?. needs an optional operand");
        const inner = { ...ctx, scoped: new Map(ctx.scoped).set(e.bind, stripOpt(e.value.type)) };
        expr(e.then, inner, `${path}/then`);
        want(e.type === `${stripOpt(e.then.type)}?`, `?. yields ${stripOpt(e.then.type)}? (decision 105)`);
        break;
      }
      case "coalesce":
        sub(e.left, "left");
        sub(e.right, "right");
        want(e.left.type.endsWith("?") && e.type === e.right.type && assignable(stripOpt(e.left.type), e.right.type), "?? operand types");
        break;
      case "unary":
      case "binary": {
        const operands = e.kind === "unary" ? [e.operand] : [e.left, e.right];
        operands.forEach((o, i) => sub(o, e.kind === "unary" ? "operand" : ["left", "right"][i]));
        const m = BUILTIN_OP.exec(e.target);
        if (m) {
          if (e.target !== `${e.op}(${operands.map((o) => o.type).join(",")})`) err("type-mismatch", path, `operator target ${e.target} does not match operands`);
        } else if (!ir.fns[e.target]) err("unknown-target", path, `operator target ${e.target} is not in fns`);
        else reached.fns.add(e.target);
        if (["==", "!=", "<", "<=", ">", ">=", "matches", "in"].includes(e.op)) want(e.type === "Bool", "comparison yields Bool");
        break;
      }
      case "logic":
        sub(e.left, "left");
        sub(e.right, "right");
        want(e.left.type === "Bool" && e.right.type === "Bool" && e.type === "Bool", "&& and || take Bool");
        break;
      case "if":
        sub(e.cond, "cond");
        sub(e.then, "then");
        sub(e.else, "else");
        want(e.cond.type === "Bool" && assignable(e.then.type, e.type) && assignable(e.else.type, e.type), "if branches");
        break;
      case "match":
        sub(e.scrutinee, "scrutinee");
        e.arms.forEach((arm, i) => {
          const scoped = new Map(ctx.scoped);
          pattern(arm.pattern, scoped, `${path}/arms/${i}/pattern`);
          const inner = { ...ctx, scoped };
          if (arm.guard) expr(arm.guard, inner, `${path}/arms/${i}/guard`);
          expr(arm.value, inner, `${path}/arms/${i}/value`);
          want(assignable(arm.value.type, e.type), `arm ${i} type`);
        });
        break;
      case "list":
        e.items.forEach((x, i) => {
          sub(x, `items/${i}`);
          want(`List<${x.type}>` === e.type || assignable(x.type, e.type.slice(5, -1)), "list element type");
        });
        break;
      case "set":
      case "map":
        sub(e.kind === "set" ? e.items : e.entries, e.kind === "set" ? "items" : "entries");
        break;
      case "struct": {
        const fields = { BlockPos: ["Int", "Int", "Int"], Vec3: ["Float", "Float", "Float"], Region: ["BlockPos", "BlockPos"], Range: ["Int", "Int"] }[e.type]
          ?? (ir.types[e.type]?.kind === "struct" ? ir.types[e.type].fields.map((f) => f.type) : null);
        if (!fields) err("unknown-type", path, `${e.type} is not a struct`);
        else {
          if (fields.length !== e.fields.length) err("call-arity", path, `${e.type} has ${fields.length} fields`);
          e.fields.forEach((x, i) => {
            sub(x, `fields/${i}`);
            if (fields[i]) want(assignable(x.type, fields[i]), `${e.type} field ${i}: ${x.type} is not ${fields[i]}`);
          });
        }
        break;
      }
      case "variant": {
        const d = ir.types[e.type];
        const v = d?.kind === "enum" ? d.variants.find((x) => x.name === e.variant) : null;
        if (!v) err("unknown-type", path, `${e.type} has no variant ${e.variant}`);
        else {
          if (v.fields.length !== e.fields.length) err("call-arity", path, `${e.type}.${e.variant} has ${v.fields.length} fields`);
          e.fields.forEach((x, i) => {
            sub(x, `fields/${i}`);
            if (v.fields[i]) want(assignable(x.type, v.fields[i].type), `${e.variant} field ${v.fields[i].name}`);
          });
        }
        break;
      }
      case "copy":
        sub(e.object, "object");
        e.set.forEach((s, i) => sub(s.value, `set/${i}/value`));
        break;
      case "index":
        sub(e.object, "object");
        sub(e.index, "index");
        break;
      case "unwrap":
        sub(e.value, "value");
        want(e.value.type === `${e.type}?`, `unwrap of ${e.value.type} yields ${stripOpt(e.value.type)}`);
        break;
      case "is_none":
        sub(e.value, "value");
        want(e.value.type.endsWith("?") && e.type === "Bool", "is_none takes an optional");
        break;
      case "iter_more":
        if (!ctx.locals?.[e.iter]) err("local-undeclared", path, `iterator ${e.iter} is not declared`);
        break;
      case "interp":
        e.parts.forEach((p, i) => p.expr && sub(p.expr, `parts/${i}/expr`));
        break;
      default:
        err("schema", path, `unknown expression kind ${e.kind}`);
    }
  }

  function pattern(p, scoped, path) {
    typeOk(p.type, `${path}/type`);
    if (p.kind === "bind") scoped.set(p.name, p.type);
    if (p.kind === "alt") p.alts.forEach((a, i) => pattern(a, scoped, `${path}/alts/${i}`));
    if (p.kind === "variant") (p.fields ?? []).forEach((a, i) => pattern(a, scoped, `${path}/fields/${i}`));
    if (p.kind === "lit") for (const m of wire.check(p.type, p.value, path)) err("wire-value", path, m);
  }

  function failureCtor(f, ctx, path) {
    const n = failureArity(f.failure, `${path}/failure`);
    if (n !== null && n !== f.fields.length) err("failure-arity", path, `${f.failure} has ${n} fields, got ${f.fields.length}`);
    f.fields.forEach((x, i) => expr(x, ctx, `${path}/fields/${i}`));
  }

  // ---------- fn bodies ----------

  function fnStmts(stmts, ctx, path) {
    stmts.forEach((s, i) => {
      const p = `${path}/${i}`;
      spanOk(s.span, `${p}/span`);
      switch (s.kind) {
        case "bind":
        case "let_else":
          expr(s.value, ctx, `${p}/value`);
          if (s.kind === "let_else") fnStmts(s.else, ctx, `${p}/else`);
          ctx.scoped.set(s.local, s.kind === "let_else" ? stripOpt(s.value.type) : s.value.type);
          break;
        case "assign":
          expr(s.value, ctx, `${p}/value`);
          if (!ctx.scoped.has(s.local)) err("local-undeclared", p, `assignment to undeclared ${s.local}`);
          break;
        case "if":
          s.branches.forEach((b, j) => {
            const inner = { ...ctx, scoped: new Map(ctx.scoped) };
            if ("cond" in b) expr(b.cond, inner, `${p}/branches/${j}/cond`);
            else {
              expr(b.value, inner, `${p}/branches/${j}/value`);
              inner.scoped.set(b.let, stripOpt(b.value.type));
            }
            fnStmts(b.body, inner, `${p}/branches/${j}/body`);
          });
          if (s.else) fnStmts(s.else, { ...ctx, scoped: new Map(ctx.scoped) }, `${p}/else`);
          break;
        case "match":
          expr(s.scrutinee, ctx, `${p}/scrutinee`);
          s.arms.forEach((a, j) => {
            const inner = { ...ctx, scoped: new Map(ctx.scoped) };
            pattern(a.pattern, inner.scoped, `${p}/arms/${j}/pattern`);
            if (a.guard) expr(a.guard, inner, `${p}/arms/${j}/guard`);
            fnStmts(a.body, inner, `${p}/arms/${j}/body`);
          });
          break;
        case "for": {
          expr(s.over, ctx, `${p}/over`);
          const inner = { ...ctx, scoped: new Map(ctx.scoped) };
          const t = s.over.type;
          const elem = t === "Range" ? "Int" : /^(List|Set)<(.*)>$/.exec(t)?.[2] ?? /^Map<([^,]*),/.exec(t)?.[1] ?? null;
          if (!elem) err("type-mismatch", p, `cannot iterate ${t}`);
          if (s.local) inner.scoped.set(s.local, elem);
          fnStmts(s.body, inner, `${p}/body`);
          break;
        }
        case "repeat":
          expr(s.count, ctx, `${p}/count`);
          fnStmts(s.body, { ...ctx, scoped: new Map(ctx.scoped) }, `${p}/body`);
          break;
        case "while":
          expr(s.cond, ctx, `${p}/cond`);
          expr(s.variant, ctx, `${p}/variant`);
          if (s.by) expr(s.by, ctx, `${p}/by`);
          fnStmts(s.body, { ...ctx, scoped: new Map(ctx.scoped) }, `${p}/body`);
          break;
        case "return":
          if (s.value) {
            expr(s.value, ctx, `${p}/value`);
            if (!assignable(s.value.type, ctx.fnResult)) err("type-mismatch", p, `returns ${s.value.type}, fn returns ${ctx.fnResult}`);
          }
          break;
        case "eval":
          expr(s.value, ctx, `${p}/value`);
          break;
      }
    });
  }

  for (const [name, f] of Object.entries(ir.fns)) {
    const path = `/fns/${name}`;
    const q = nameOk(name, path);
    if (q && q.member !== f.name) err("name-syntax", path, `name ${f.name} must be the simple name ${q.member}`);
    f.params.forEach((p, i) => typeOk(p.type, `${path}/params/${i}`));
    typeOk(f.result, `${path}/result`);
    if (f.extern !== (f.body === null)) err("fn-shape", path, "extern fns have no body; other fns have one");
    if (f.body) {
      const ctx = { params: f.params, scoped: new Map(), fnResult: f.result };
      if ("expr" in f.body) {
        expr(f.body.expr, ctx, `${path}/body/expr`);
        if (!assignable(f.body.expr.type, f.result)) err("type-mismatch", path, `body has type ${f.body.expr.type}, fn returns ${f.result}`);
      } else fnStmts(f.body.block, ctx, `${path}/body/block`);
    }
    spanOk(f.span, `${path}/span`);
  }

  // ---------- statecharts ----------

  function chart(c, ctx, path, owner, kind) {
    if (c.owner !== owner) err("state-id", path, `chart owner ${c.owner} must be ${owner}`);
    if (c.root !== c.owner) err("state-id", path, "root must be the owner");
    for (const [l, t] of Object.entries(c.locals)) typeOk(t, `${path}/locals/${l}`);
    const states = c.states;
    const ids = Object.keys(states);
    const ctxc = { ...ctx, locals: c.locals, scoped: new Map() };
    if (!states[c.root] || states[c.root].kind !== "scope" || states[c.root].parent !== null) err("state-id", path, "root must be a scope state without parent");
    for (const id of ids) {
      const sp = `${path}/states/${id}`;
      try {
        const p = parseStateId(id);
        if (p.owner !== c.owner) err("state-id", sp, `state id owner ${p.owner} is not ${c.owner}`);
        if (p.kind !== kind) err("state-id", sp, `owner kind ${p.kind}, expected ${kind}`);
        if ((p.path === "end") !== (states[id].kind === "final")) err("state-id", sp, "#end is exactly the final state");
        if ((p.path === "restart") !== (states[id].kind === "restart")) err("state-id", sp, "#restart is exactly the restart state");
      } catch (e) {
        err("state-id", sp, `${id}: ${e.message}`);
      }
      const s = states[id];
      if (id !== c.root) {
        if (!states[s.parent]) err("state-parent", sp, `parent ${s.parent} does not exist`);
        else if (!COMPOUND.has(states[s.parent].kind)) err("state-parent", sp, `parent ${s.parent} is a ${states[s.parent].kind}, not a compound state`);
        else if (!(s.parent === c.root || id.startsWith(`${s.parent}.`))) err("state-parent", sp, `parent ${s.parent} is not a prefix of the id`);
        const seen = new Set();
        for (let a = s.parent; a; a = states[a]?.parent) {
          if (seen.has(a)) {
            err("state-parent", sp, "parent chain has a cycle");
            break;
          }
          seen.add(a);
        }
      }
      spanOk(s.span, `${sp}/span`);
    }
    const targetOk = (t, p) => {
      if (t !== null && !states[t]) err("state-unknown-target", p, `target ${t} does not exist`);
    };
    const actions = (as, p) => {
      as.forEach((a, i) => {
        const ap = `${p}/actions/${i}`;
        spanOk(a.span, `${ap}/span`);
        const declared = (n) => c.locals[n] ?? err("local-undeclared", ap, `local ${n} is not declared`);
        switch (a.kind) {
          case "bind": {
            expr(a.value, ctxc, `${ap}/value`);
            const t = declared(a.local);
            if (t && !assignable(a.value.type, t)) err("type-mismatch", ap, `bind ${a.local}: ${a.value.type} is not ${t}`);
            break;
          }
          case "assign":
            expr(a.value, ctxc, `${ap}/value`);
            if (a.target.local) declared(a.target.local);
            else if (!ctx.avars?.some((v) => v.name === a.target.var)) err("param-unknown", ap, `no activity var ${a.target.var}`);
            break;
          case "eval":
            expr(a.value, ctxc, `${ap}/value`);
            break;
          case "notify": {
            const n = ir.notices[a.notice];
            if (!n) err("unknown-notice", ap, `${a.notice} is not in notices`);
            else {
              reached.notices.add(a.notice);
              if (n.fields.length !== a.fields.length) err("failure-arity", ap, `${a.notice} has ${n.fields.length} fields`);
            }
            a.fields.forEach((x, j) => expr(x, ctxc, `${ap}/fields/${j}`));
            break;
          }
          case "fail":
            failureCtor(a.failure, ctxc, `${ap}/failure`);
            if (i !== as.length - 1) err("transition-shape", ap, "fail must be the last action");
            break;
          case "return":
            if (a.value) {
              expr(a.value, ctxc, `${ap}/value`);
              if (ctx.result && !assignable(a.value.type, ctx.result)) err("type-mismatch", ap, `returns ${a.value.type}, task returns ${ctx.result}`);
            } else if (ctx.result && ctx.result !== "Unit") err("type-mismatch", ap, `return without a value in a task returning ${ctx.result}`);
            if (i !== as.length - 1) err("transition-shape", ap, "return must be the last action");
            break;
          case "defer": {
            const d = states[a.call];
            if (!d || !["extern_call", "composite_call"].includes(d.kind) || !d.deferred) err("state-unknown-target", ap, `defer target ${a.call} is not a deferred call state`);
            else {
              const callee = ir.tasks[d.callee];
              if (callee && callee.params.length !== a.args.length) err("call-arity", ap, `${d.callee} takes ${callee.params.length} arguments`);
              a.args.forEach((x, j) => {
                expr(x, ctxc, `${ap}/args/${j}`);
                if (callee?.params[j] && !assignable(x.type, callee.params[j].type)) err("type-mismatch", ap, `defer argument ${j}`);
              });
            }
            break;
          }
          case "check":
            expr(a.cond, ctxc, `${ap}/cond`);
            break;
          case "counter_init":
            expr(a.value, ctxc, `${ap}/value`);
            if (declared(a.counter) && c.locals[a.counter] !== "Int") err("type-mismatch", ap, "counters are Int");
            break;
          case "counter_step":
            declared(a.counter);
            break;
          case "iter_init":
            expr(a.over, ctxc, `${ap}/over`);
            declared(a.iter);
            break;
          case "iter_next":
            declared(a.iter);
            if (a.local) declared(a.local);
            break;
          case "variant":
            expr(a.value, ctxc, `${ap}/value`);
            expr(a.by, ctxc, `${ap}/by`);
            declared(a.slot);
            break;
        }
      });
    };
    const transition = (t, p, guardAllowed = true) => {
      if (t.guard) {
        if (!guardAllowed) err("transition-shape", p, "guard not allowed here");
        expr(t.guard, ctxc, `${p}/guard`);
        if (t.guard.type !== "Bool") err("type-mismatch", p, "guards are Bool");
      }
      actions(t.actions, p);
      const last = t.actions.at(-1);
      if ((t.target === null) !== (last?.kind === "fail")) err("transition-shape", p, "target is null exactly when the last action is fail");
      if (last?.kind === "return" && t.target !== null && !["final", "restart"].includes(states[t.target]?.kind)) err("transition-shape", p, "return must lead to #end or #restart");
      targetOk(t.target, `${p}/target`);
    };
    const reachable = new Set([c.root]);
    const queue = [c.root];
    const reach = (id) => {
      if (id && states[id] && !reachable.has(id)) {
        reachable.add(id);
        queue.push(id);
      }
    };
    const follow = (t) => {
      reach(t.target);
      for (const a of t.actions) if (a.kind === "defer") reach(a.call);
    };
    for (const id of ids) {
      const s = states[id];
      const sp = `${path}/states/${id}`;
      switch (s.kind) {
        case "scope":
        case "atomic":
          transition(s.initial, `${sp}/initial`, false);
          break;
        case "abort":
          expr(s.cond, ctxc, `${sp}/cond`);
          transition(s.initial, `${sp}/initial`, false);
          transition(s.on_abort, `${sp}/on_abort`, false);
          break;
        case "try":
        case "retry":
          transition(s.initial, `${sp}/initial`, false);
          s.catches.forEach((ct, i) => {
            ct.on.forEach((pt, j) => {
              if (pt.failure === "_") return;
              const n = failureArity(pt.failure, `${sp}/catches/${i}/on/${j}`);
              if (BUILTIN_FAILURES.has(pt.failure) && !CATCHABLE.has(pt.failure)) err("unknown-failure", `${sp}/catches/${i}`, `${pt.failure} cannot be caught (§10.5)`);
              if (pt.binders && n !== null && pt.binders.length !== n) err("failure-arity", `${sp}/catches/${i}/on/${j}`, `${pt.failure} has ${n} fields (decision 101)`);
              (pt.binders ?? []).forEach((b) => b && !c.locals[b] && err("local-undeclared", `${sp}/catches/${i}`, `binder ${b} is not a declared local`));
            });
            transition(ct, `${sp}/catches/${i}`);
          });
          if (s.kind === "retry" && !s.catches.every((ct) => ct.target === id)) err("transition-shape", sp, "retry catches re-enter the retry state");
          break;
        case "async":
          transition(s.initial, `${sp}/initial`, false);
          if (states[s.barrier]?.kind !== "barrier" || states[s.barrier].parent !== id) err("state-unknown-target", sp, `barrier ${s.barrier} must be a barrier child`);
          break;
        case "with":
          for (const r of ["child", "body"]) {
            const st = states[s[r]];
            if (!st || st.parent !== id || s[r] !== `${id}.with.${r}`) err("state-unknown-target", sp, `${r} region must be ${id}.with.${r}, a child of the with state`);
          }
          if (states[s.child] && !["extern_call", "composite_call"].includes(states[s.child].kind)) err("state-unknown-target", sp, "the child region is an ongoing call");
          reach(s.child);
          reach(s.body);
          break;
        case "extern_call":
        case "composite_call": {
          const callee = ir.tasks[s.callee];
          if (!callee) {
            err("unknown-target", sp, `callee ${s.callee} is not in tasks`);
            break;
          }
          reached.tasks.add(s.callee);
          if ((callee.kind === "extern") !== (s.kind === "extern_call")) err("call-callee-kind", sp, `${s.callee} is ${callee.kind}; use ${callee.kind === "extern" ? "extern_call" : "composite_call"}`);
          if (s.deferred !== (s.args === null)) err("call-arity", sp, "args is null exactly for deferred calls");
          if (s.deferred && s.next !== null) err("transition-shape", sp, "deferred calls have no next");
          if (s.args) {
            if (s.args.length !== callee.params.length) err("call-arity", sp, `${s.callee} takes ${callee.params.length} arguments, got ${s.args.length}`);
            s.args.forEach((a, i) => {
              expr(a, ctxc, `${sp}/args/${i}`);
              if (callee.params[i] && !assignable(a.type, callee.params[i].type)) err("type-mismatch", sp, `${s.callee} argument ${callee.params[i].name}: ${a.type} is not ${callee.params[i].type}`);
            });
          }
          if (s.result !== null) {
            const t = c.locals[s.result];
            if (!t) err("local-undeclared", sp, `result local ${s.result} is not declared`);
            else if (!assignable(callee.result, t)) err("type-mismatch", sp, `${s.callee} returns ${callee.result}, local ${s.result} is ${t}`);
          }
          if (s.next) transition(s.next, `${sp}/next`, false);
          else if (!s.deferred && !callee.modifiers.includes("ongoing")) err("transition-shape", sp, "only ongoing and deferred calls have no next");
          break;
        }
        case "wait":
          expr(s.duration, ctxc, `${sp}/duration`);
          transition(s.next, `${sp}/next`, false);
          break;
        case "wait_until":
          expr(s.cond, ctxc, `${sp}/cond`);
          expr(s.timeout, ctxc, `${sp}/timeout`);
          if (s.else_fail) failureCtor(s.else_fail, ctxc, `${sp}/else_fail`);
          transition(s.next, `${sp}/next`, false);
          break;
        case "pending":
          if (!states[s.call] || states[s.call].kind !== "extern_call") err("state-unknown-target", sp, `pending call ${s.call} is not an extern call`);
          reach(s.call);
          break;
        case "restart":
        case "loop_every":
          if (s.kind === "loop_every") expr(s.period, ctxc, `${sp}/period`);
          transition(s.next, `${sp}/next`, false);
          break;
        case "choice":
          s.transitions.forEach((t, i) => {
            transition(t, `${sp}/transitions/${i}`);
            const last = i === s.transitions.length - 1;
            if (last !== (t.guard === null)) err("transition-shape", `${sp}/transitions/${i}`, "every choice transition but the last has a guard; the last has none");
          });
          break;
      }
    }
    while (queue.length) {
      const s = states[queue.shift()];
      for (const t of [s.initial, s.next, s.on_abort, ...(s.transitions ?? []), ...(s.catches ?? [])]) if (t) follow(t);
      if (s.kind === "with") {
        reach(s.child);
        reach(s.body);
      }
      if (s.kind === "async") reach(s.barrier);
      if (s.kind === "pending") reach(s.call);
    }
    for (const id of ids) {
      if (!reachable.has(id) && !["final", "restart"].includes(states[id].kind)) err("unreachable-state", `${path}/states/${id}`, `state ${id} is unreachable`);
    }
  }

  // ---------- tasks ----------

  for (const [name, t] of Object.entries(ir.tasks)) {
    const path = `/tasks/${name}`;
    const q = nameOk(name, path);
    if (q) {
      if (q.module !== t.module || q.member !== t.name) err("name-syntax", path, `name does not match module ${t.module} and name ${t.name}`);
      if (q.typeArgs.map((x) => x.text).join(",") !== t.type_args.join(",")) err("name-syntax", path, "type arguments do not match type_args");
    }
    t.params.forEach((p, i) => {
      typeOk(p.type, `${path}/params/${i}`);
      if ("default" in p) for (const m of wire.check(p.type, p.default)) err("wire-value", `${path}/params/${i}`, m);
    });
    typeOk(t.result, `${path}/result`);
    const extern = t.kind === "extern";
    if (extern !== (t.chart === null)) err("task-shape", path, "extern tasks have no chart; composites have one");
    if (extern !== ("primitive" in t && "class" in t && "confirm" in t)) err("task-shape", path, "primitive, class and confirm are present exactly on extern tasks");
    if (extern !== t.modifiers.includes("extern")) err("task-shape", path, "modifiers must include extern exactly on extern tasks");
    if (t.uses.join() !== RESOURCES.filter((r) => t.uses.includes(r)).join()) err("section-order", `${path}/uses`, "resources must be in canonical order");
    t.failures.forEach((f, i) => failureArity(f, `${path}/failures/${i}`));
    const base = { params: t.params, scoped: new Map() };
    const olds = t.olds.map((o, i) => (expr(o, base, `${path}/olds/${i}`), o));
    const cl = t.clauses;
    cl.requires.forEach((r, i) => {
      expr(r.expr, base, `${path}/clauses/requires/${i}/expr`);
      if (r.else_fail) failureCtor(r.else_fail, base, `${path}/clauses/requires/${i}/else_fail`);
    });
    const withOld = { ...base, olds };
    for (const k of ["invariants", "maintains"]) {
      cl[k].forEach((r, i) => {
        expr(r.expr, withOld, `${path}/clauses/${k}/${i}/expr`);
        if (r.tolerate) expr(r.tolerate, base, `${path}/clauses/${k}/${i}/tolerate`);
        if (r.else_fail) failureCtor(r.else_fail, base, `${path}/clauses/${k}/${i}/else_fail`);
      });
    }
    cl.ensures.forEach((r, i) => expr(r.expr, { ...withOld, result: t.result === "Unit" ? null : t.result }, `${path}/clauses/ensures/${i}/expr`));
    if (cl.progress) {
      expr(cl.progress.metric, base, `${path}/clauses/progress/metric`);
      expr(cl.progress.within, base, `${path}/clauses/progress/within`);
      if (cl.progress.by) expr(cl.progress.by, base, `${path}/clauses/progress/by`);
    }
    if (cl.timeout) expr(cl.timeout.duration, base, `${path}/clauses/timeout/duration`);
    if (cl.stalls_after) expr(cl.stalls_after.duration, base, `${path}/clauses/stalls_after/duration`);
    cl.fails.forEach((f, i) => failureArity(f, `${path}/clauses/fails/${i}`));
    if (t.chart) chart(t.chart, { params: t.params, result: t.result }, `${path}/chart`, name, "task");
    spanOk(t.span, `${path}/span`);
    const c = ir.contracts[name];
    if (!c) err("contracts-mismatch", path, "task has no contracts entry");
    else {
      const same =
        isDeepStrictEqual(c.params, t.params) && c.result === t.result &&
        isDeepStrictEqual(c.requires.map((r) => [r.expr, r.text, r.point_in_time]), cl.requires.map((r) => [r.expr, r.text, false])) &&
        isDeepStrictEqual(c.ensures.map((r) => [r.expr, r.text, r.point_in_time]), cl.ensures.map((r) => [r.expr, r.text, true]));
      if (!same) err("contracts-mismatch", `/contracts/${name}`, "contract differs from the task's params, result, requires or ensures");
    }
  }
  for (const name of Object.keys(ir.contracts)) if (!ir.tasks[name]) err("contracts-mismatch", `/contracts/${name}`, "no such task");

  // ---------- activities and bot ----------

  for (const [inst, a] of Object.entries(ir.activities)) {
    const path = `/activities/${inst}`;
    nameOk(a.activity, `${path}/activity`);
    a.param_types.forEach((p, i) => typeOk(p.type, `${path}/param_types/${i}`));
    if ((a.attached_to === null) !== (a.params !== null) || (a.attached_to === null) !== (a.attach_args === null)) {
      err("bot", path, "use instances have params; attached instances have attach_args");
    }
    if (a.params) {
      const names = a.param_types.map((p) => p.name).sort();
      if (Object.keys(a.params).sort().join() !== names.join()) err("bot", `${path}/params`, "params must bind exactly the activity's parameters");
      for (const p of a.param_types) if (p.name in a.params) for (const m of wire.check(p.type, a.params[p.name])) err("wire-value", `${path}/params/${p.name}`, m);
    }
    a.vars.forEach((v, i) => {
      typeOk(v.type, `${path}/vars/${i}`);
      for (const m of wire.check(v.type, v.init)) err("wire-value", `${path}/vars/${i}`, m);
    });
    a.handlers.forEach((h, i) => {
      const hp = `${path}/handlers/${i}`;
      if (h.index !== i) err("bot", hp, "handler index must equal its position (§11.6)");
      const ctx = { aparams: a.param_types, avars: a.vars, scoped: new Map() };
      const tg = h.trigger;
      if (tg.kind === "on") {
        tg.binders.forEach((b) => b && ctx.scoped.set(b, "unknown"));
        if (tg.guard) expr(tg.guard, ctx, `${hp}/trigger/guard`);
      }
      if (tg.cond) expr(tg.cond, ctx, `${hp}/trigger/cond`);
      if (tg.until) expr(tg.until, ctx, `${hp}/trigger/until`);
      if (h.footprint.join() !== RESOURCES.filter((r) => h.footprint.includes(r)).join()) err("section-order", `${hp}/footprint`, "resources must be in canonical order");
      const until = tg.kind === "when" && tg.until !== null;
      const restart = `${inst}/${i}#restart`;
      const end = `${inst}/${i}#end`;
      if (until !== Boolean(h.chart.states[restart])) err("state-id", `${hp}/chart`, "a when ... until handler has #restart; other handlers do not");
      if (until && h.chart.states[end]) err("state-id", `${hp}/chart`, "a when ... until handler ends runs at #restart, not #end");
      chart(h.chart, { aparams: a.param_types, avars: a.vars, result: null }, `${hp}/chart`, `${inst}/${i}`, "handler");
    });
  }
  const bot = ir.bot;
  if (bot.name !== ir.header.bot) err("bot", "/bot/name", "bot name differs from header.bot");
  for (const inst of bot.instances) if (!ir.activities[inst] || ir.activities[inst].attached_to !== null) err("bot", "/bot/instances", `${inst} is not a use instance`);
  for (const [inst, a] of Object.entries(ir.activities)) {
    if (a.attached_to === null && !bot.instances.includes(inst)) err("bot", `/activities/${inst}`, "use instance missing from bot.instances");
    if (a.attached_to !== null && !bot.jobs[a.attached_to]?.attaches.includes(inst)) err("bot", `/activities/${inst}`, "attached instance not listed by its job");
  }
  for (const [job, j] of Object.entries(bot.jobs)) {
    const path = `/bot/jobs/${job}`;
    const t = ir.tasks[job];
    if (!t) {
      err("unknown-target", path, `job ${job} is not in tasks`);
      continue;
    }
    reached.tasks.add(job);
    if (!isDeepStrictEqual(j.params, t.params) || j.result !== t.result) err("bot", path, "job signature differs from the task's");
    if (t.type_args.length > 0) err("bot", path, "jobs are not generic (§12.1)");
    j.params.forEach((p, i) => {
      if (["Entity", "Window", "Goal", "Inventory"].includes(p.type.replace(/[<?].*$/, ""))) err("bot", `${path}/params/${i}`, "job parameters must be wire types (§12.1)");
    });
    chart(j.root, { params: j.params, result: j.result }, `${path}/root`, `job:${job}`, "job");
  }
  if (bot.start) {
    const j = bot.jobs[bot.start.job];
    if (!j) err("bot", "/bot/start", `start job ${bot.start.job} is not in jobs`);
    else {
      for (const k of Object.keys(bot.start.args)) if (!j.params.some((p) => p.name === k)) err("bot", "/bot/start/args", `unknown argument ${k}`);
      for (const p of j.params) {
        if (!(p.name in bot.start.args)) err("bot", "/bot/start/args", `missing argument ${p.name} (defaults are filled)`);
        else for (const m of wire.check(p.type, bot.start.args[p.name])) err("wire-value", `/bot/start/args/${p.name}`, m);
      }
    }
  }
  for (const [name, c] of Object.entries(ir.consts)) {
    typeOk(c.type, `/consts/${name}/type`);
    for (const m of wire.check(c.type, c.value)) err("wire-value", `/consts/${name}`, m);
  }

  // ---------- only what the bot reaches (§18.1 step 8) ----------

  // Tasks reached through call states were recorded above; pull in their own charts and clauses
  // transitively by re-walking until the reached set is stable.
  let size = -1;
  while (size !== reached.tasks.size) {
    size = reached.tasks.size;
    for (const name of [...reached.tasks]) {
      for (const s of Object.values(ir.tasks[name]?.chart?.states ?? {})) if (s.callee && ir.tasks[s.callee]) reached.tasks.add(s.callee);
    }
  }
  for (const name of Object.keys(ir.tasks)) if (!reached.tasks.has(name)) err("unreached-entry", `/tasks/${name}`, "task is not reached from the bot");
  for (const name of Object.keys(ir.fns)) if (!reached.fns.has(name)) err("unreached-entry", `/fns/${name}`, "fn is not reached from the bot");
  for (const name of Object.keys(ir.consts)) if (!reached.consts.has(name)) err("unreached-entry", `/consts/${name}`, "const is not read at run time");
  for (const name of Object.keys(ir.failures)) if (!reached.failures.has(name)) err("unreached-entry", `/failures/${name}`, "failure is not reached from the bot");
  for (const name of Object.keys(ir.notices)) if (!reached.notices.has(name)) err("unreached-entry", `/notices/${name}`, "notice is not reached from the bot");
  for (const name of Object.keys(ir.types)) if (!reached.types.has(name)) err("unreached-entry", `/types/${name}`, "type is not referenced");
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: check-ir.mjs <file.golem-ir.json>");
    process.exit(2);
  }
  const errors = checkIr(JSON.parse(readFileSync(file, "utf8")));
  for (const e of errors) console.error(`${file}${e.path}: [${e.code}] ${e.message}`);
  if (errors.length) process.exit(1);
  console.log(`check-ir: ${file} ok`);
}
