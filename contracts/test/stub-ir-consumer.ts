// Compile-time test (tsc --noEmit --strict): consumers of the IR and of the supervisor protocol,
// written only against the generated types. Every switch is exhaustive over a closed union, so a
// new expression kind, state kind, action, trigger, report type, command or reply that a consumer
// does not handle is a compile error.

import type {
  Action,
  Command,
  Expr,
  FnStmt,
  Ir,
  Pattern,
  Reply,
  Report,
  State,
  Statechart,
  Transition,
  Trigger,
} from "../types/index.js";

function assertNever(x: never): never {
  throw new Error(`unhandled ${JSON.stringify(x)}`);
}

// Every child expression of a node.
export function children(e: Expr): Expr[] {
  switch (e.kind) {
    case "lit":
    case "local":
    case "param":
    case "aparam":
    case "avar":
    case "const":
    case "self":
    case "ambient":
    case "old":
    case "result":
    case "iter_more":
      return [];
    case "interp":
      return e.parts.flatMap((p) => ("expr" in p ? [p.expr] : []));
    case "field":
      return [e.object];
    case "call":
      return [...(e.receiver ? [e.receiver] : []), ...e.args];
    case "opt":
      return [e.value, e.then];
    case "coalesce":
    case "binary":
    case "logic":
      return [e.left, e.right];
    case "unary":
      return [e.operand];
    case "if":
      return [e.cond, e.then, e.else];
    case "match":
      return [e.scrutinee, ...e.arms.flatMap((a) => [...(a.guard ? [a.guard] : []), a.value])];
    case "list":
      return e.items;
    case "set":
      return [e.items];
    case "map":
      return [e.entries];
    case "struct":
    case "variant":
      return e.fields;
    case "copy":
      return [e.object, ...e.set.map((s) => s.value)];
    case "index":
      return [e.object, e.index];
    case "unwrap":
    case "is_none":
      return [e.value];
    default:
      return assertNever(e);
  }
}

export function binders(p: Pattern): string[] {
  switch (p.kind) {
    case "wild":
    case "none":
    case "lit":
      return [];
    case "bind":
      return [p.name];
    case "variant":
      return (p.fields ?? []).flatMap(binders);
    case "alt":
      return p.alts.flatMap(binders);
    default:
      return assertNever(p);
  }
}

export function actionExprs(a: Action): Expr[] {
  switch (a.kind) {
    case "bind":
    case "eval":
    case "counter_init":
      return [a.value];
    case "assign":
      return [a.value];
    case "notify":
      return a.fields;
    case "fail":
      return a.failure.fields;
    case "return":
      return a.value ? [a.value] : [];
    case "defer":
      return a.args;
    case "check":
      return [a.cond];
    case "variant":
      return [a.value, a.by];
    case "iter_init":
      return [a.over];
    case "heartbeat":
    case "counter_step":
    case "iter_next":
      return [];
    default:
      return assertNever(a);
  }
}

export function stmtCount(s: FnStmt): number {
  switch (s.kind) {
    case "bind":
    case "assign":
    case "return":
    case "break":
    case "continue":
    case "eval":
      return 1;
    case "let_else":
      return 1 + s.else.reduce((n, x) => n + stmtCount(x), 0);
    case "if":
      return 1 + s.branches.reduce((n, b) => n + b.body.reduce((m, x) => m + stmtCount(x), 0), 0) + (s.else ?? []).reduce((n, x) => n + stmtCount(x), 0);
    case "match":
      return 1 + s.arms.reduce((n, a) => n + a.body.reduce((m, x) => m + stmtCount(x), 0), 0);
    case "for":
    case "repeat":
    case "while":
      return 1 + s.body.reduce((n, x) => n + stmtCount(x), 0);
    default:
      return assertNever(s);
  }
}

// The outgoing transitions of a state, as a runtime would collect them.
export function transitions(s: State): Transition[] {
  switch (s.kind) {
    case "scope":
    case "atomic":
    case "async":
      return [s.initial];
    case "abort":
      return [s.initial, s.on_abort];
    case "try":
    case "retry":
      return [s.initial, ...s.catches];
    case "extern_call":
    case "composite_call":
      return s.next ? [s.next] : [];
    case "wait":
    case "wait_until":
    case "restart":
    case "loop_every":
      return [s.next];
    case "choice":
      return s.transitions;
    case "pending":
    case "barrier":
    case "with":
    case "final":
      return [];
    default:
      return assertNever(s);
  }
}

// Which states of a chart suspend the strand (§10: suspension points).
export function suspensionPoints(c: Statechart): string[] {
  return Object.entries(c.states)
    .filter(([, s]) => ["extern_call", "composite_call", "wait", "wait_until", "pending", "barrier", "restart", "loop_every"].includes(s.kind))
    .map(([id]) => id);
}

export function triggerText(t: Trigger): string {
  switch (t.kind) {
    case "on":
      return `on ${t.event}`;
    case "enter":
      return "on enter";
    case "exit":
      return "on exit";
    case "when":
      return `when (debounce ${t.debounce}t)${t.until ? " until" : ""}`;
    case "every":
      return `every ${t.period}t`;
    default:
      return assertNever(t);
  }
}

export function summary(ir: Ir): string {
  const nodes = (e: Expr): number => 1 + children(e).reduce((n, c) => n + nodes(c), 0);
  let exprCount = 0;
  for (const t of Object.values(ir.tasks)) {
    for (const r of t.clauses.requires) exprCount += nodes(r.expr);
    for (const s of Object.values(t.chart?.states ?? {})) for (const tr of transitions(s)) for (const a of tr.actions) for (const e of actionExprs(a)) exprCount += nodes(e);
  }
  const handlers = Object.values(ir.activities).flatMap((a) => a.handlers.map((h) => triggerText(h.trigger)));
  return `${ir.header.bot}: ${Object.keys(ir.tasks).length} tasks, ${exprCount} expression nodes, handlers: ${handlers.join("; ")}`;
}

// A supervisor's view of the protocol.
export function describe(r: Report): string {
  switch (r.type) {
    case "hello":
      return `hello ${r.minecraft} with ${r.jobs.length} jobs`;
    case "job_started":
      return `job ${r.job_id} started ${r.job}`;
    case "job_completed":
      return `job ${r.job_id} completed`;
    case "job_failed":
      return `job ${r.job_id} failed: ${r.failure.type} at ${r.failure.trace[0]?.task ?? "?"}`;
    case "job_cancelled":
      return `job ${r.job_id} cancelled`;
    case "thread_started":
      return r.kind === "job" ? `thread ${r.thread} for ${r.job_id}` : `thread ${r.thread} for ${r.instance}/${r.handler}`;
    case "thread_ended":
      return `thread ${r.thread} ${r.outcome}`;
    case "frozen":
      return `thread ${r.thread} frozen by ${r.by}`;
    case "resumed":
      return `thread ${r.thread} resumed`;
    case "task_started":
    case "task_completed":
    case "task_cancelled":
      return `${r.type} ${r.task}`;
    case "task_failed":
      return `task ${r.task} failed: ${r.failure.type}`;
    case "progress":
      return `frame ${r.frame} progress ${r.value}`;
    case "rollback":
      return `rollback of action ${r.action}`;
    case "notice":
      return "job_id" in r ? `${r.name} from ${r.job_id}` : `${r.name} from ${r.instance}/${r.handler}`;
    case "handler_failed":
    case "handler_disabled":
      return `${r.type} ${r.instance}/${r.handler}: ${r.failure.type}`;
    case "handler_backoff":
      return `${r.instance}/${r.handler} backs off ${r.duration}t`;
    case "event_dropped":
      return `${r.event} dropped by ${r.instance}/${r.handler}`;
    case "defer_failed":
      return `deferred call in frame ${r.frame} failed`;
    case "disconnected":
      return `${r.kind}: ${r.reason}${r.final ? " (session ends)" : ""}`;
    case "reconnected":
      return `reconnected, attempt ${r.attempt}`;
    case "died":
    case "respawned":
      return `${r.type}: ${r.reason}`;
    case "state_not_restored":
      return `${r.instance}.${r.name} not restored (${r.reason})`;
    default:
      return assertNever(r);
  }
}

export function commandJob(c: Command): string | null {
  switch (c.command) {
    case "assign":
    case "cancel":
    case "pause":
    case "resume":
      return c.job_id;
    case "snapshot":
      return null;
    default:
      return assertNever(c);
  }
}

export function frames(r: Reply): number {
  if (r.reply === "accepted" && r.command === "snapshot") {
    return r.snapshot.threads.reduce((n, t) => n + t.strands.reduce((m, s) => m + s.frames.length, 0), 0);
  }
  return 0;
}
