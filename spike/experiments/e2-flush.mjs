// E2. Packet flushing (S-1, finding 3): when do the packets of each §18.4 mapping leave, relative to
// the tick phases, and can a write gate at bot._client.write defer all of them to flush() (phase 7)?
// Every call is made from inside a tick's phase 6 (as start() would). Each case runs twice: with the
// gate open ("immediate") and closed ("deferred").
// Usage: node experiments/e2-flush.mjs
import { Vec3 } from "vec3";
import pathfinderPkg from "mineflayer-pathfinder";
import { setup, teardown, sleep, save, until, scriptedProgram, verdict } from "../lib/harness.mjs";
import { makeMovements } from "../lib/goals.mjs";

const { goals } = pathfinderPkg;
const exp = "e2";
const program = scriptedProgram();
const ctx = await setup(exp, program, { backendOpts: { flushMode: "immediate", recordWrites: true, recordStacks: true } });
const { server, backend, runtime, rival, tally } = ctx;
const bot = backend.bot;

async function world() {
  server.cmd("tp golem 40 -60 40 0 0");
  server.cmd("tp Rival 44 -60 40");
  server.cmd("clear golem");
  server.cmd("item replace entity golem hotbar.0 with dirt 64");
  server.cmd("item replace entity golem hotbar.1 with bread 8");
  server.cmd("item replace entity golem inventory.0 with oak_planks 16");
  server.cmd("fill 30 -60 30 55 -55 55 air");
  for (const [x, z] of [[41, 40], [41, 41], [41, 39], [39, 41], [39, 39], [42, 40], [42, 41], [42, 39]]) server.cmd(`setblock ${x} -60 ${z} dirt`);
  server.cmd("effect give golem saturation 1 255 true");
  await server.sync();
  await sleep(600);
}

// Runs fn(bot) inside phase 6 of the next tick; returns { result promise, first write index }.
async function inPhase6(fn) {
  let p;
  const from = backend.writes.length;
  await program.run(() => { backend.phase = "start"; try { p = fn(bot); } finally { backend.phase = "tick"; } });
  return { p: Promise.resolve(p), from };
}

// Origin of a write outside the tick: the first library frame that issued it, plus how it was
// scheduled (timer callback, promise continuation after an await, or the physics step).
function origin(rec) {
  if (rec.inTick) return `phase:${rec.phase}`;
  const st = rec.stack ?? [];
  const lib = st.find((f) => /^(mineflayer|mineflayer-pathfinder|minecraft-protocol)\//.test(f.replace(/^.*\(/, "")) || /(mineflayer|minecraft-protocol)\//.test(f));
  const where = lib ? lib.replace(/^(\S+) \((.*)\)$/, "$2 $1").replace(/:\d+\)?$/, "") : st[0] ?? "?";
  const how = st.some((f) => /processTicksAndRejections/.test(f)) ? "promise continuation" : st.some((f) => /listOnTimeout|processTimers/.test(f)) ? "timer" : "event";
  return `outside-tick: ${where} [${how}]`;
}

const results = [];
async function runCase(name, mapping, cls, fn, settle) {
  for (const mode of ["immediate", "deferred"]) {
    await world();
    backend.opts.flushMode = mode;
    const t0 = backend.tickNo;
    let ok = true, err = null;
    const { p, from } = await inPhase6(fn);
    try { await Promise.race([p, sleep(15000).then(() => { throw new Error("timeout"); })]); } catch (e) { ok = false; err = String(e.message ?? e); }
    if (settle) { try { await settle(); } catch (e) { ok = false; err = String(e.message ?? e); } }
    await sleep(300);
    const writes = backend.writes.slice(from).filter((w) => !["keep_alive", "ping_request", "chunk_batch_received", "teleport_confirm"].includes(w.name));
    const byPacket = {};
    for (const w of writes) {
      const k = `${w.name} @ ${origin(w)}`;
      const e = (byPacket[k] ??= { packet: w.name, origin: origin(w), count: 0, firstTickOffset: w.tick - t0, sentInFlush: 0, delayMs: [] });
      e.count++;
      if (w.sentPhase === "flush") e.sentInFlush++;
      if (w.sentAt != null) e.delayMs.push(w.sentAt - w.t);
      if (e.example === undefined) e.example = w.stack?.slice(0, 4);
    }
    for (const e of Object.values(byPacket)) { e.gate_delay_ms = e.delayMs.length ? { mean: +(e.delayMs.reduce((a, b) => a + b, 0) / e.delayMs.length).toFixed(1), max: +Math.max(...e.delayMs).toFixed(1) } : null; delete e.delayMs; }
    const escaped = mode === "deferred" ? writes.filter((w) => w.sentPhase !== "flush").length : null;
    results.push({ case: name, mapping, class: cls, mode, ok, err, writes: writes.length, escaped_gate: escaped, packets: Object.values(byPacket) });
    console.log(`${name} [${mode}] ok=${ok} writes=${writes.length} ${escaped != null ? `escaped=${escaped}` : ""}`);
    for (const e of Object.values(byPacket)) console.log(`   ${e.count}x ${e.packet}  ${e.origin}  (+${e.firstTickOffset}t) gate delay ${JSON.stringify(e.gate_delay_ms)}`);
  }
}

const B = (x, y, z) => bot.blockAt(new Vec3(x, y, z));
const air = (x, y, z) => () => until(() => B(x, y, z)?.name === "air", 8000, "block broken");

await runCase("bot.dig(block)", "dig -> bot.dig", "durative", (b) => b.dig(B(41, -60, 40)), air(41, -60, 40));
await runCase("bot.dig(block, forceLook=true)", "dig -> bot.dig", "durative", (b) => b.dig(B(41, -60, 41), true), air(41, -60, 41));
await runCase("bot.lookAt(point)", "look_at -> bot.lookAt", "durative", (b) => b.lookAt(new Vec3(30, -58, 50)));
await runCase("bot.placeBlock(ref, face)", "place_block (not via bot.placeBlock per §18.4)", "instant", (b) => { b.setQuickBarSlot(0); return b.placeBlock(B(43, -61, 43), new Vec3(0, 1, 0)); });
await runCase("bot.clickWindow(9,0,0) inventory", "pick_up -> bot.clickWindow mode 0", "instant", (b) => b.clickWindow(9, 0, 0), async () => { await sleep(200); await program.run(() => { backend.phase = "start"; bot.clickWindow(9, 0, 0); backend.phase = "tick"; }); });
await runCase("bot.clickWindow(36,0,0) hotbar after dig", "pick_up -> bot.clickWindow (hotbar, just dug)", "instant", (b) => { b.lastDigTime = performance.now(); return b.clickWindow(36, 0, 0); }, async () => { await sleep(100); await program.run(() => { backend.phase = "start"; bot.clickWindow(36, 0, 0).catch(() => {}); backend.phase = "tick"; }); await sleep(800); });
await runCase("bot.setControlState sneak/sprint/forward", "sneak, sprint, hold_jump -> bot.setControlState", "ongoing", (b) => { b.setControlState("sneak", true); b.setControlState("forward", true); }, async () => { await sleep(500); await program.run(() => { backend.phase = "cancel"; bot.clearControlStates(); backend.phase = "tick"; }); await sleep(300); });
await runCase("bot.activateItem / deactivateItem", "hold_use -> bot.activateItem", "ongoing", (b) => { b.setQuickBarSlot(1); b.activateItem(); }, async () => { await sleep(300); await program.run(() => { backend.phase = "cancel"; bot.deactivateItem(); backend.phase = "tick"; }); });
await runCase("bot.setQuickBarSlot(2)", "select_hotbar -> bot.setQuickBarSlot", "instant", (b) => b.setQuickBarSlot(2));
await runCase("bot.attack(Rival)", "attack -> bot.attack", "instant", (b) => b.attack(b.players.Rival.entity));
await runCase("bot.chat", "chat -> bot.chat", "instant", (b) => b.chat("e2 chat"));
await runCase("pathfinder.setGoal(GoalNear)", "pathfind -> mineflayer-pathfinder", "durative", (b) => { b.pathfinder.setMovements(makeMovements(b, {})); b.pathfinder.setGoal(new goals.GoalNear(48, -60, 46, 1)); },
  () => until(() => !bot.pathfinder.isMoving() && bot.entity.position.distanceTo(new Vec3(48.5, -60, 46.5)) < 2.5, 15000, "goal reached"));

// Direct-packet primitives through the spike backend's start().
async function direct(name, primitive, args, check) {
  for (const mode of ["immediate", "deferred"]) {
    await world();
    backend.opts.flushMode = mode;
    const from = backend.writes.length;
    const t0 = backend.tickNo;
    const id = await program.run((c) => c.start(primitive, args));
    const v = await verdict(runtime, id);
    await sleep(200);
    const writes = backend.writes.slice(from).filter((w) => !["keep_alive", "ping_request", "chunk_batch_received", "teleport_confirm"].includes(w.name));
    const byPacket = {};
    for (const w of writes) {
      const k = `${w.name} @ ${origin(w)}`;
      const e = (byPacket[k] ??= { packet: w.name, origin: origin(w), count: 0, firstTickOffset: w.tick - t0, sentInFlush: 0 });
      e.count++;
      if (w.sentPhase === "flush") e.sentInFlush++;
    }
    const escaped = mode === "deferred" ? writes.filter((w) => w.sentPhase !== "flush").length : null;
    results.push({ case: name, mapping: `${primitive} -> direct packets (spike backend)`, class: primitive === "place_block" ? "instant" : "durative", mode, ok: v.status === "Confirmed" && (!check || check()), verdict: v.status, writes: writes.length, escaped_gate: escaped, packets: Object.values(byPacket) });
    console.log(`${name} [${mode}] verdict=${v.status} writes=${writes.length} ${escaped != null ? `escaped=${escaped}` : ""}`);
    for (const e of Object.values(byPacket)) console.log(`   ${e.count}x ${e.packet}  ${e.origin}  (+${e.firstTickOffset}t)`);
  }
}
await direct("backend dig (direct)", "dig", { pos: [42, -60, 40] });
await direct("backend place_block (direct)", "place_block", { support: [43, -61, 43], face: "Up" });
await direct("backend look_at (bot.look + physics)", "look_at", { target: [30, -58, 50] });

// Background traffic over 100 idle ticks in each mode: what leaves without any action.
const background = {};
for (const mode of ["immediate", "deferred"]) {
  backend.opts.flushMode = mode;
  const from = backend.writes.length;
  await sleep(5000);
  const ws = backend.writes.slice(from);
  const m = {};
  for (const w of ws) { const k = `${w.name} @ ${origin(w)}`; m[k] = (m[k] ?? 0) + 1; }
  background[mode] = { writes: ws.length, by: m, escaped_gate: mode === "deferred" ? ws.filter((w) => w.sentPhase !== "flush" && w.name !== "ping_request").length : null };
}

save(exp, "summary.json", { experiment: "E2 packet flushing", cases: results, background, validation: tally.summary() });
console.log(JSON.stringify(background, null, 1));
await teardown(ctx);
process.exit(0);
