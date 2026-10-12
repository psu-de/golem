// Stub runtime for the spike: implements the TickClock side of PD-2, keeps a confirmed view from
// TickInput only, runs a deterministic "program" (a function of the view, the TickInput and its own
// state) that starts and cancels actions, and records everything needed to replay (§15.5).
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class StubRuntime {
  constructor(backend, program, { tally, recordPath, onInput } = {}) {
    this.backend = backend;
    this.program = program;
    this.tally = tally;
    this.view = new Map();
    this.chunks = new Map();
    this.nextAction = 1;
    this.actions = new Map(); // id -> { primitive, args, mode, status, reports: [] }
    this.decisions = [];
    this.state = program.init ? program.init() : {};
    this.viewHash = "0";
    this.onInput = onInput;
    this.pendingConnect = null;
    this.ticks = 0;
    this.deltas = [];
    if (recordPath) {
      mkdirSync(dirname(recordPath), { recursive: true });
      this.rec = createWriteStream(recordPath);
    }
  }

  // TickClock.tick(): phases 1 (ingest), 2-6 (program), 7 (flush).
  tick() {
    const input = this.backend.ingest();
    const t = input.tick;
    this.ticks++;
    if (this.tally) this.tally.check("tickInput", input);
    const recorded = { input, commands: [] };
    if (this.tally) this.tally.check("recordedTick", recorded);
    if (this.rec) this.rec.write(JSON.stringify(recorded) + "\n");
    this.apply(input);
    this.onInput?.(input, this);
    const ctx = this.ctx(input);
    this.program.step(ctx, this.state);
    this.decisions.push({ tick: t, state: digest(this.state), view: this.viewHash });
    this.backend.flush();
  }

  apply(input) {
    for (const i of input.infra) if (i.infra === "connected") { this.view.clear(); this.chunks.clear(); }
    for (const c of input.changes) {
      if (c.chunk_load) this.chunks.set(`${c.chunk_load.x},${c.chunk_load.z}`, c.chunk_load);
      else if (c.chunk_unload) this.chunks.delete(`${c.chunk_unload.x},${c.chunk_unload.z}`);
      else this.view.set(c.key, c.value);
    }
    for (const r of input.reports) {
      const a = this.actions.get(r.action);
      if (a) {
        a.reports.push(r.status); a.status = r.status; a.detail = r.detail ?? r.failure?.type;
        if (r.status === "Issued") a.issuedTick ??= input.tick;
        if (["Confirmed", "Rejected", "Failed"].includes(r.status)) a.verdictTick = input.tick;
      }
    }
    this.viewHash = createHash("sha1").update(this.viewHash).update(JSON.stringify(input.changes)).digest("hex").slice(0, 12);
  }

  // Block lookup on the confirmed view: explicit block keys first, then the chunk_load data.
  block([x, y, z]) {
    const k = `block(${x},${y},${z})`;
    if (this.view.has(k)) return this.view.get(k);
    const ch = this.chunks.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
    if (!ch) return null;
    let idx = (y - ch.min_y) * 256 + (((z % 16) + 16) % 16) * 16 + (((x % 16) + 16) % 16);
    for (const [p, n] of ch.runs) { if (idx < n) return ch.palette[p]; idx -= n; }
    return null;
  }

  ctx(input) {
    const rt = this;
    return {
      tick: input.tick,
      input,
      view: this.view,
      block: (p) => this.block(p),
      action: (id) => this.actions.get(id),
      start(primitive, args, mode = "sync") {
        const id = rt.nextAction++;
        const req = { action: id, call: { primitive, args }, mode };
        if (rt.tally) rt.tally.check("startRequest", req);
        rt.actions.set(id, { primitive, args, mode, status: "Started", reports: [], startTick: input.tick });
        rt.decisions.push({ tick: input.tick, op: "start", action: id, primitive, args, mode });
        const delta = rt.backend.start(id, primitive, args, mode);
        if (mode === "async") {
          if (rt.tally) rt.tally.check("delta", delta);
          rt.actions.get(id).delta = delta;
          rt.deltas.push({ action: id, delta });
        }
        return id;
      },
      cancel(id) {
        rt.decisions.push({ tick: input.tick, op: "cancel", action: id });
        rt.backend.cancel(id);
        const a = rt.actions.get(id);
        if (a) a.status = "Cancelled";
      },
      // Reconnect is async and happens outside tick() (PD-2); the decision is recorded here.
      reconnect() {
        rt.decisions.push({ tick: input.tick, op: "connect" });
        rt.pendingConnect = true;
      },
    };
  }

  close() { return new Promise((r) => (this.rec ? this.rec.end(r) : r())); }
}

// Backend that replays a recording: ingest() returns the recorded TickInputs in order; start()
// returns the recorded Delta for async actions (RecordedTick does not carry it: ESCALATIONS SE-4).
export class ReplayBackend {
  constructor(recorded, deltas = []) {
    this.recorded = recorded;
    this.i = 0;
    this.deltas = new Map(deltas.map((d) => [d.action, d.delta]));
  }
  ingest() { return this.recorded[this.i++].input; }
  start(action, _p, _a, mode) { return mode === "async" ? this.deltas.get(action) ?? [] : undefined; }
  cancel() {}
  flush() {}
  get done() { return this.i >= this.recorded.length; }
}

export function digest(o) {
  return createHash("sha1").update(JSON.stringify(o)).digest("hex").slice(0, 12);
}
