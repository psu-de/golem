// E1. Clock and ingest (PD-2, §15.5): drive a stub runtime from Mineflayer's physics tick for N
// minutes, with a kick and a dropped socket, measure tick jitter and drift, validate every TickInput,
// then replay the recording through a fresh stub and compare decisions.
// Usage: node experiments/e1-clock.mjs [--minutes 10]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setup, teardown, sleep, save, resultsDir } from "../lib/harness.mjs";
import { StubRuntime, ReplayBackend } from "../lib/runtime.mjs";
import { ValidationTally } from "../lib/contracts.mjs";

const MINUTES = Number(process.argv[process.argv.indexOf("--minutes") + 1] || 10) || 10;
const A = [40, -60, 40], B = [42, -60, 40], C = [48, -60, 44];
const FINAL = ["Confirmed", "Rejected", "Failed"];

// Deterministic worker: every decision is a function of the TickInput, the confirmed view and its state.
function worker() {
  return {
    init: () => ({ phase: "boot", step: 0, cur: null, wait: 0, cycles: 0, outsideB: 0, rejected: 0, failed: 0, disc: null, paused: 0, predicted: 0, lookAlt: 0 }),
    step(ctx, s) {
      const inp = ctx.input;
      for (const i of inp.infra) {
        if (i.infra === "kicked" || i.infra === "disconnected") { s.disc = inp.tick; s.phase = "offline"; s.cur = null; }
        if (i.infra === "connected") { s.phase = "boot"; s.step = 0; s.cur = null; s.disc = null; }
      }
      for (const c of inp.changes) if (c.key === `block(${B})` && c.cause === "outside") s.outsideB++;
      for (const e of inp.events) {
        if (e.event === "chat" && e.text === "pause" && s.phase === "run") { if (s.cur) ctx.cancel(s.cur); s.cur = null; s.paused++; s.wait = inp.tick + 40; }
      }
      if (s.phase === "offline") { if (s.disc != null && inp.tick - s.disc === 100) ctx.reconnect(); return; }
      if (s.phase === "boot") { if (ctx.view.has("player.position") && inp.tick >= (s.bootAt ??= inp.tick) + 20) s.phase = "run"; else return; }
      if (inp.tick < s.wait) return;
      if (s.cur) {
        const a = ctx.action(s.cur);
        const doneAsync = a.mode === "async" && a.reports.includes("Issued");
        if (!FINAL.includes(a.status) && !doneAsync) {
          if (a.primitive === "sneak" && inp.tick - a.startTick >= 20) { ctx.cancel(s.cur); s.cur = null; s.step++; }
          else if (inp.tick - a.startTick > 600) { ctx.cancel(s.cur); s.cur = null; s.failed++; s.step = 0; }
          return;
        }
        if (a.status === "Rejected") s.rejected++;
        if (a.status === "Failed") s.failed++;
        s.cur = null;
        s.step++;
      }
      const b = ctx.block(B);
      switch (s.step % 6) {
        case 0: s.cur = ctx.start("pathfind", { goal: { Near: { pos: A, radius: 1 } }, limit: 2400, opts: { avoid: null } }); break;
        case 1:
          if (b && !/air$/.test(b)) s.cur = ctx.start("dig", { pos: B });
          else s.step++;
          break;
        case 2: {
          s.cur = ctx.start("place_block", { support: [B[0], B[1] - 1, B[2]], face: "Up" }, "async");
          const d = ctx.action(s.cur).delta ?? [];
          // A decision that depends on the predicted delta (async view): where to look next.
          s.lookAt = d.some((e) => e.key === `block(${B})` && e.value === "minecraft:dirt") ? [B[0] + 0.5, B[1] + 0.5, B[2] + 0.5] : [A[0] + 0.5, A[1] + 1.5, A[2] + 3.5];
          if (d.length) s.predicted++;
          break;
        }
        case 3: s.cur = ctx.start("look_at", { target: s.lookAt ?? [B[0] + 0.5, B[1] + 0.5, B[2] + 0.5] }); break;
        case 4: s.cur = ctx.start("sneak", {}); break;
        case 5: s.cur = ctx.start("pathfind", { goal: { Near: { pos: C, radius: 1 } }, limit: 2400, opts: { avoid: null } }); s.cycles++; break;
      }
    },
  };
}

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
  return { n: s.length, mean: +mean.toFixed(3), sd: +sd.toFixed(3), min: +s[0].toFixed(3), p01: +q(0.01).toFixed(3), p50: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3), p99: +q(0.99).toFixed(3), max: +s[s.length - 1].toFixed(3) };
}

const exp = "e1";
const program = worker();
const ctx = await setup(exp, program, { serverOpts: { name: exp } });
const { server, backend, runtime, tally, launch, rival } = ctx;
server.cmd("tp golem 40 -60 40");
server.cmd("item replace entity golem hotbar.0 with dirt 64");
server.cmd(`setblock ${B.join(" ")} oak_log`);
server.cmd(`fill 36 -60 36 52 -57 48 air replace oak_log`);
await server.sync();

const tickCost = [];
const origTick = runtime.tick.bind(runtime);
runtime.tick = () => { const t0 = performance.now(); origTick(); tickCost.push({ tick: backend.tickNo, ms: performance.now() - t0 }); };

const events = [];
const t0 = performance.now();
const end = t0 + MINUTES * 60000;
let nextPause = t0 + 45000, nextSet = t0 + 70000;
let kicked = false, dropped = false;
while (performance.now() < end) {
  await sleep(50);
  const now = performance.now();
  if (runtime.pendingConnect) {
    runtime.pendingConnect = false;
    events.push({ what: "reconnect", tick: backend.clockDriver.tick, t: now - t0 });
    backend.connect(launch, runtime).then(() => events.push({ what: "connected", tick: backend.clockDriver.tick, t: performance.now() - t0 }))
      .catch((e) => events.push({ what: "connect_failed", err: String(e), t: performance.now() - t0 }));
  }
  if (now > nextPause) { rival.chat("pause"); events.push({ what: "rival chat pause", tick: backend.clockDriver.tick, t: now - t0 }); nextPause += 45000; }
  if (now > nextSet) { server.cmd(`setblock ${B.join(" ")} oak_log`); events.push({ what: "console setblock B", tick: backend.clockDriver.tick, t: now - t0 }); nextSet += 70000; }
  if (!kicked && now - t0 > MINUTES * 60000 * 0.33) { kicked = true; server.cmd("kick golem spike test kick"); events.push({ what: "kick", tick: backend.clockDriver.tick, t: now - t0 }); }
  if (!dropped && now - t0 > MINUTES * 60000 * 0.66 && backend.connected) { dropped = true; backend.bot._client.socket.destroy(); events.push({ what: "socket destroyed", tick: backend.clockDriver.tick, t: now - t0 }); }
}
const live = { decisions: runtime.decisions, state: runtime.state, deltas: runtime.deltas };
const samples = backend.clockDriver.samples;
await teardown(ctx);

// ---- clock analysis
const iv = [];
for (let i = 1; i < samples.length; i++) iv.push({ ms: samples[i].t - samples[i - 1].t, src: samples[i].src, prevSrc: samples[i - 1].src, tick: samples[i].tick });
const elapsed = samples.at(-1).t - samples[0].t;
const drift = elapsed - 50 * (samples.length - 1);
const driftSeries = [];
for (let i = 0; i < samples.length; i += 1200) driftSeries.push({ tick: samples[i].tick, minute: +((samples[i].t - samples[0].t) / 60000).toFixed(2), drift_ms: +((samples[i].t - samples[0].t) - 50 * i).toFixed(1) });
const bySrc = {};
for (const s of samples) bySrc[s.src] = (bySrc[s.src] ?? 0) + 1;
const timerRuns = [];
let run = null;
for (const s of samples) {
  if (s.src === "timer") { if (!run) run = { from: s.tick, n: 0 }; run.n++; run.to = s.tick; }
  else if (run) { timerRuns.push(run); run = null; }
}
if (run) timerRuns.push(run);
const clock = {
  minutes: MINUTES, ticks: samples.length, elapsed_ms: +elapsed.toFixed(1), drift_ms: +drift.toFixed(1), drift_ppm: +((drift / elapsed) * 1e6).toFixed(0),
  ticks_by_source: bySrc, reentrant_calls: backend.clockDriver.reentrant,
  interval_all: stats(iv.map((x) => x.ms)),
  interval_physics: stats(iv.filter((x) => x.src === "physics" && x.prevSrc === "physics").map((x) => x.ms)),
  interval_timer: iv.some((x) => x.src === "timer" && x.prevSrc === "timer") ? stats(iv.filter((x) => x.src === "timer" && x.prevSrc === "timer").map((x) => x.ms)) : null,
  intervals_under_25ms: iv.filter((x) => x.ms < 25).length, intervals_over_75ms: iv.filter((x) => x.ms > 75).length,
  source_switches: iv.filter((x) => x.src !== x.prevSrc).map((x) => ({ tick: x.tick, from: x.prevSrc, to: x.src, ms: +x.ms.toFixed(1) })),
  timer_runs: timerRuns, drift_series: driftSeries,
  tick_cost_ms: stats(tickCost.map((x) => x.ms)), slowest_ticks: [...tickCost].sort((a, b) => b.ms - a.ms).slice(0, 5).map((x) => ({ tick: x.tick, ms: +x.ms.toFixed(1) })),
};

// ---- replay
const recPath = join(resultsDir(exp), "raw", "recording.jsonl");
const recorded = readFileSync(recPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
function replay(rec, deltas) {
  const rb = new ReplayBackend(rec, deltas);
  const rt = new StubRuntime(rb, worker(), { tally: new ValidationTally() });
  while (!rb.done) rt.tick();
  return rt;
}
const rep = replay(recorded, live.deltas);
const eq = JSON.stringify(rep.decisions) === JSON.stringify(live.decisions);
let firstDiff = null;
for (let i = 0; i < Math.max(rep.decisions.length, live.decisions.length); i++) {
  if (JSON.stringify(rep.decisions[i]) !== JSON.stringify(live.decisions[i])) { firstDiff = { i, live: live.decisions[i], replay: rep.decisions[i] }; break; }
}
// Negative controls: the comparison must detect a perturbed input, and async decisions need the deltas.
const perturbed = recorded.map((r) => structuredClone(r));
const victim = perturbed.find((r) => r.input.reports.some((x) => x.status === "Confirmed"));
victim.input.reports = victim.input.reports.map((x) => (x.status === "Confirmed" ? { ...x, status: "Rejected", detail: "perturbed" } : x));
const repP = replay(perturbed, live.deltas);
const repNoDelta = replay(recorded, []);
const ops = (d) => d.filter((x) => x.op);
const replayResult = {
  recorded_ticks: recorded.length,
  live_decisions: live.decisions.length, live_ops: ops(live.decisions).length,
  replay_identical: eq, first_difference: firstDiff,
  control_perturbed_report_detected: JSON.stringify(repP.decisions) !== JSON.stringify(live.decisions),
  control_without_deltas_identical: JSON.stringify(repNoDelta.decisions) === JSON.stringify(live.decisions),
  ops_by_kind: ops(live.decisions).reduce((m, x) => ((m[x.primitive ?? x.op] = (m[x.primitive ?? x.op] ?? 0) + 1), m), {}),
  final_program_state: live.state,
};

// ---- TickInput content inventory
const inv = { ticks: recorded.length, key_changes: 0, own: 0, outside: 0, chunk_load: 0, chunk_unload: 0, events: {}, reports: {}, infra: {}, path_progress_non_null: 0, rtt_non_null: 0, keys_by_family: {} };
const rtts = [];
for (const { input } of recorded) {
  for (const c of input.changes) {
    if (c.chunk_load) inv.chunk_load++;
    else if (c.chunk_unload) inv.chunk_unload++;
    else { inv.key_changes++; if (c.cause === "outside") inv.outside++; else inv.own++; const fam = c.key.replace(/\(.*$/, "").replace(/\..*$/, ""); inv.keys_by_family[fam] = (inv.keys_by_family[fam] ?? 0) + 1; }
  }
  for (const e of input.events) inv.events[e.event] = (inv.events[e.event] ?? 0) + 1;
  for (const r of input.reports) inv.reports[r.status] = (inv.reports[r.status] ?? 0) + 1;
  for (const i of input.infra) inv.infra[i.infra] = (inv.infra[i.infra] ?? 0) + 1;
  if (input.measurements.path_progress != null) inv.path_progress_non_null++;
  if (input.measurements.round_trip_ms != null) { inv.rtt_non_null++; rtts.push(input.measurements.round_trip_ms); }
}
inv.round_trip_ms = rtts.length ? stats(rtts) : null;

// Small committed sample: the ticks around the kick and the first reconnect.
const kickTick = recorded.findIndex((r) => r.input.infra.some((i) => i.infra === "kicked"));
const sample = recorded.filter((r, i) => (i >= kickTick - 2 && i <= kickTick + 2) || r.input.infra.some((x) => x.infra === "connected"))
  .map((r) => ({ ...r, input: { ...r.input, changes: r.input.changes.map((c) => (c.chunk_load ? { chunk_load: { ...c.chunk_load, runs: `[${c.chunk_load.runs.length} runs elided]` } } : c)).slice(0, 40) } }));

const summary = { experiment: "E1 clock and ingest", clock, replay: replayResult, tickinput_inventory: inv, validation: tally.summary(), script_events: events };
save(exp, "summary.json", summary);
save(exp, "sample-ticks.jsonl", sample.map((x) => JSON.stringify(x)).join("\n") + "\n");
console.log(JSON.stringify({ clock: { ...clock, drift_series: undefined, source_switches: clock.source_switches.length, timer_runs: clock.timer_runs }, replay: { ...replayResult, final_program_state: undefined }, validation: tally.summary().counts, inv: { ...inv } }, null, 1));
process.exit(0);
