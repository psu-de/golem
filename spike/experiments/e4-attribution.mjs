// E4. Attribution (S-2, question 4): scripted scenarios in which the second player and console
// commands change the same keys the bot acts on. Every key change on a scenario key gets a ground
// truth label (causal: Own iff caused by the bot's action and that action was neither cancelled nor
// rolled back, §14.5), and is tagged by three rules (lib/attribution.mjs):
//   provisional  - the review's default (window to verdict + max(4t, 2 x RTT))
//   refined      - verdict-bounded, value-consistent, corrections Outside (backend-side)
//   runtimeSide  - the refined rule recomputed from recorded data after phase 2 (S-2 no-go variant),
//                  without the backend's correction flag
// Usage: node experiments/e4-attribution.mjs [--reps 3]
import { Vec3 } from "vec3";
import { setup, teardown, sleep, save, until, scriptedProgram, verdict } from "../lib/harness.mjs";
import { RULES } from "../lib/attribution.mjs";

const REPS = Number(process.argv[process.argv.indexOf("--reps") + 1] || 3) || 3;
const exp = "e4";
const program = scriptedProgram();
const ctx = await setup(exp, program, { backendOpts: { flushMode: "deferred", keepAttribution: true } });
const { server, backend, runtime, rival, tally } = ctx;
const bot = backend.bot;
const CHEST = [38, -60, 42];
const bk = (p) => `block(${p.join(",")})`;
const tick = () => backend.clockDriver.tick;
async function cmds(...cs) { for (const c of cs) server.cmd(c); await server.sync(); await sleep(300); }
const results = [];

// Runs one scenario: body() performs it and returns { keys, label(change) -> "own"|"outside"|null }.
async function scenario(name, harm, body) {
  for (let rep = 0; rep < REPS; rep++) {
    const from = backend.attrLog.length;
    let info;
    const t0 = backend.tickNo;
    const firstAction = runtime.nextAction;
    try { info = await body(rep); info.since ??= runtime.actions.get(firstAction)?.startTick ?? t0; } catch (e) { results.push({ name, rep, error: String(e.message ?? e) }); console.log(`${name} #${rep}: ERROR ${e.message}`); continue; }
    await sleep(info.tail ?? 600);
    // Only changes from the first start of the scenario on (setup commands land earlier).
    const changes = backend.attrLog.slice(from).filter((c) => info.keys.includes(c.key) && c.tick >= info.since);
    const rows = [];
    for (const c of changes) {
      const truth = info.label(c);
      if (!truth) continue;
      // runtime-side: recomputed with everything the runtime knows at the end of phase 2 of c.tick
      const rs = RULES.runtimeSide(backend.attr, c, c.tick, null);
      const ans = { provisional: c.answers.provisional, refined: c.answers.refined, runtimeSide: rs };
      const verdicts = Object.fromEntries(Object.entries(ans).map(([k, v]) => [k, v === "outside" ? "outside" : "own"]));
      rows.push({ tick: c.tick, key: c.key, value: c.value, correction: c.correction, truth, ...verdicts });
    }
    results.push({ name, harm, rep, notes: info.notes ?? null, changes: rows });
    const err = (r) => rows.filter((x) => x[r] !== x.truth).length;
    console.log(`${name} #${rep}: ${rows.length} changes; errors provisional=${err("provisional")} refined=${err("refined")} runtimeSide=${err("runtimeSide")}`);
  }
}

async function start(primitive, args, mode = "sync", before) {
  return program.run((c) => { before?.(c); return c.start(primitive, args, mode); });
}
const afterVerdict = async (id) => { const v = await verdict(runtime, id, 30000); return v; };

await cmds("gamemode survival golem", "gamemode creative Rival", "tp golem 40 -60 40 0 0", "tp Rival 43 -60 43", "clear golem", "fill 30 -60 30 55 -55 55 air",
  "item replace entity golem hotbar.0 with dirt 64", "item replace entity golem hotbar.1 with stone_pickaxe");

// ---- blocks
await scenario("S1 second player breaks the block being dug (to the predicted value)", "benign: value equals the prediction; dig's BlockChanged invariant fires regardless", async () => {
  const p = [41, -60, 40];
  await cmds(`setblock ${p.join(" ")} oak_log`);
  const id = await start("dig", { pos: p });
  await sleep(500);
  await rival.dig(rival.blockAt(new Vec3(...p)));
  await afterVerdict(id);
  return { keys: [bk(p)], label: () => "outside" };
});

await scenario("S2 console replaces the block being dug with stone", "harmful under provisional: masks interference", async (rep) => {
  const p = [36, -60, 36 + rep * 2];
  await cmds(`tp golem 37 -60 ${37 + rep * 2}`, `setblock ${p.join(" ")} oak_log`);
  const since = backend.tickNo;
  const id = await start("dig", { pos: p });
  await sleep(500);
  server.cmd(`setblock ${p.join(" ")} stone`);
  const v = await afterVerdict(id);
  return { keys: [bk(p)], tail: 4000, since, notes: `verdict ${v.status}`, label: (c) => (c.value === "minecraft:stone" ? "outside" : /air/.test(c.value) ? "own" : "outside") };
});

await scenario("S3 dig confirmed, console puts the block back right after the verdict", "harmful under provisional: a caller's ensures fails as ContractViolation", async () => {
  const p = [41, -60, 39];
  await cmds("tp golem 40 -60 40", `setblock ${p.join(" ")} dirt`, "item replace entity golem hotbar.1 with stone_pickaxe");
  await program.run(() => bot.setQuickBarSlot(1));
  await sleep(300);
  const since = backend.tickNo;
  const id = await start("dig", { pos: p });
  await until(() => runtime.actions.get(id)?.verdictTick != null, 20000, "verdict");
  server.cmd(`setblock ${p.join(" ")} dirt`);
  return { keys: [bk(p), "inventory.slot(37)"], since, label: (c) => (c.key === bk(p) ? (/air/.test(c.value) ? "own" : "outside") : "own") };
});

await scenario("S4 dig confirmed, second player places a block in the cell right after", "harmful under provisional", async () => {
  const p = [42, -60, 39];
  await cmds(`setblock ${p.join(" ")} dirt`, "give Rival cobblestone 64");
  await program.run(() => bot.setQuickBarSlot(1));
  await sleep(300);
  const since = backend.tickNo;
  const id = await start("dig", { pos: p });
  await until(() => runtime.actions.get(id)?.verdictTick != null, 20000, "verdict");
  const it = rival.inventory.items().find((i) => i.name === "cobblestone");
  if (it) await rival.equip(it, "hand");
  await rival.placeBlock(rival.blockAt(new Vec3(p[0], p[1] - 1, p[2])), new Vec3(0, 1, 0)).catch(() => {});
  return { keys: [bk(p), "inventory.slot(37)"], since, label: (c) => (c.key === bk(p) ? (/air/.test(c.value) ? "own" : "outside") : "own") };
});

await scenario("S5 place confirmed, console removes the block right after", "harmful under provisional", async (rep) => {
  const p = [44, -60, 38 + rep];
  await cmds(`setblock ${p.join(" ")} air`);
  await program.run(() => bot.setQuickBarSlot(0));
  const id = await start("place_block", { support: [p[0], p[1] - 1, p[2]], face: "Up" });
  await until(() => runtime.actions.get(id)?.verdictTick != null, 20000, "verdict");
  server.cmd(`setblock ${p.join(" ")} air`);
  return { keys: [bk(p), "inventory.slot(36)"], label: (c) => (c.key === bk(p) ? (c.value === "minecraft:dirt" ? "own" : "outside") : "own") };
});

await scenario("S6 second player fills the target cell just before the place arrives", "harmful under provisional", async (rep) => {
  const p = [45, -60, 38 + rep];
  await cmds(`setblock ${p.join(" ")} air`);
  await program.run(() => bot.setQuickBarSlot(0));
  const id = await start("place_block", { support: [p[0], p[1] - 1, p[2]], face: "Up" }, "sync", () => server.cmd(`setblock ${p.join(" ")} stone`));
  const v = await afterVerdict(id);
  return { keys: [bk(p)], notes: `verdict ${v.status}`, label: (c) => (c.value === "minecraft:dirt" ? "own" : "outside") };
});

// ---- windows
async function openChest(fill = true) {
  if (fill) await cmds(`setblock ${CHEST.join(" ")} air`, `setblock ${CHEST.join(" ")} chest`, `item replace block ${CHEST.join(" ")} container.0 with oak_log 10`, `item replace block ${CHEST.join(" ")} container.1 with oak_log 5`);
  await bot.openContainer(bot.blockAt(new Vec3(...CHEST)));
  await sleep(300);
}
const handle = () => runtime.view.get("window.id");
await cmds("gamemode survival Rival", "tp Rival 37 -60 43", "give Rival oak_log 32");

await scenario("S7 pick_up of a chest slot the second player emptied a moment before", "benign for the slot (value equals prediction); the cursor correction is Outside under value-consistency", async () => {
  await openChest();
  await rival.openContainer(rival.blockAt(new Vec3(...CHEST)));
  await sleep(300);
  const id = await start("pick_up", { w: handle(), slot: 0, half: false }, "sync", () => { rival.clickWindow(0, 0, 1).catch(() => {}); });
  const v = await afterVerdict(id);
  rival.closeWindow(rival.currentWindow);
  await program.run(() => bot.closeWindow(bot.currentWindow));
  return { keys: ["window.slot(0)", "inventory.cursor"], notes: `verdict ${v.status}`,
    label: (c) => (c.key === "window.slot(0)" ? "outside" : c.value === null ? "outside" : "own") };
});

await scenario("S8 put into a chest slot, second player adds to the same slot right after", "harmful under provisional", async () => {
  await openChest();
  await rival.openContainer(rival.blockAt(new Vec3(...CHEST)));
  await sleep(300);
  const w = rival.currentWindow;
  const src = w.slots.findIndex((s, i) => i >= w.inventoryStart && s?.name === "oak_log");
  await rival.clickWindow(src, 0, 0); // the second player holds logs on its cursor
  await sleep(300);
  await start("pick_up", { w: handle(), slot: 1, half: false });
  await sleep(500);
  const since = backend.tickNo;
  const id = await start("put", { w: handle(), slot: 1, one: false });
  await sleep(60); // about one tick later, before the settle window ends
  rival.clickWindow(1, 1, 0).catch(() => {});
  const v = await afterVerdict(id);
  await sleep(300);
  await rival.clickWindow(src, 0, 0).catch(() => {});
  rival.closeWindow(rival.currentWindow);
  await program.run(() => bot.closeWindow(bot.currentWindow));
  const t = tick();
  return { keys: ["window.slot(1)"], since, notes: `verdict ${v.status}`, label: (c) => (c.value?.count === 5 || c.value === null ? "own" : "outside") };
});

// ---- player position
await cmds("gamemode creative Rival", "tp golem 40 -60 40", "fill 30 -60 30 55 -55 55 air");
await scenario("S9 console teleports the bot during pathfind", "harmful under provisional and runtime-side (no correction flag)", async () => {
  await cmds("tp golem 40 -60 40");
  const id = await start("pathfind", { goal: { Near: { pos: [52, -60, 52], radius: 1 } }, limit: 2400, opts: { avoid: null } });
  await sleep(700);
  server.cmd("tp golem 40 -60 50");
  const v = await afterVerdict(id);
  return { keys: ["player.position"], notes: `verdict ${v.status}`, label: (c) => (c.correction ? "outside" : "own") };
});

await scenario("S9b console teleports the bot right after pathfind is confirmed", "harmful under provisional and runtime-side", async () => {
  await cmds("tp golem 40 -60 40");
  const id = await start("pathfind", { goal: { Near: { pos: [46, -60, 40], radius: 1 } }, limit: 2400, opts: { avoid: null } });
  await until(() => runtime.actions.get(id)?.verdictTick != null, 20000, "verdict");
  server.cmd("tp golem 40 -60 46");
  return { keys: ["player.position"], label: (c) => (c.correction ? "outside" : "own") };
});

const kb = [];
await scenario("S10 second player knocks the bot back during pathfind", "unlabelable per change: physics integrates own input and outside velocity", async () => {
  await cmds("tp golem 40 -60 40", "tp Rival 41 -60 41", "gamemode survival Rival");
  const id = await start("pathfind", { goal: { Near: { pos: [52, -60, 40], radius: 1 } }, limit: 2400, opts: { avoid: null } });
  await sleep(500);
  const hitTick = tick();
  const before = bot.entity.position.clone();
  rival.attack(bot.entity);
  await sleep(400);
  kb.push({ hit_tick: hitTick, displacement_400ms: +bot.entity.position.distanceTo(before).toFixed(2) });
  const v = await afterVerdict(id);
  await cmds("gamemode creative Rival");
  // Ground truth: positions in the 6 ticks after the hit carry the knockback (outside velocity).
  return { keys: ["player.position"], notes: `verdict ${v.status}`, label: (c) => (c.correction ? "outside" : c.tick >= hitTick && c.tick <= hitTick + 6 ? "outside" : "own") };
});

// ---- cancelled and rolled-back actions
await scenario("S11 dig cancelled (freeze), then the second player breaks the block", "none: all rules exclude cancelled actions", async () => {
  const p = [41, -60, 40];
  await cmds("tp golem 40 -60 40", `setblock ${p.join(" ")} oak_log`);
  const id = await start("dig", { pos: p });
  await sleep(400);
  await program.run((c) => c.cancel(id));
  await rival.dig(rival.blockAt(new Vec3(...p)));
  return { keys: [bk(p)], label: () => "outside" };
});

for (const mode of ["deferred", "immediate"]) {
  await scenario(`S11b place started and cancelled in the same tick (${mode} flush)`, "none: §14.5 counts it Outside; deferred flush never sends it", async (rep) => {
    const p = [41 + rep, -60, 43];
    backend.opts.flushMode = mode;
    await cmds("tp golem 41 -60 41", `setblock ${p.join(" ")} air`);
    await program.run(() => bot.setQuickBarSlot(0));
    await program.run((c) => { const id = c.start("place_block", { support: [p[0], p[1] - 1, p[2]], face: "Up" }); c.cancel(id); });
    await sleep(500);
    backend.opts.flushMode = "deferred";
    return { keys: [bk(p)], notes: `placed=${/dirt/.test(runtime.block(p) ?? "")}`, label: () => "outside" };
  });
}

await scenario("S12 async strand: first place rejected (spawn protection), second rolled back in the same tick", "backend-side rules tag the rolled-back action's change Own", async (rep) => {
  // Spawn protection is max(|dx|,|dz|) <= 16 around (0,0): x=15 is protected, x=18 is not.
  const z = 2 + rep;
  await cmds("tp golem 16.5 -60 " + (z + 0.5), `setblock 15 -60 ${z} air`, `setblock 18 -60 ${z} air`);
  await program.run(() => bot.setQuickBarSlot(0));
  // Both issued in one tick; the spawn-protected one is first in the strand.
  const ids = await program.run((c) => [c.start("place_block", { support: [15, -61, z], face: "Up" }, "async"), c.start("place_block", { support: [18, -61, z], face: "Up" }, "async")]);
  let rb = null;
  runtime.onInput = (input) => { // §14.4 rollback in phase 2: later actions of the strand are cancelled and rolled back
    if (input.reports.some((r) => r.action === ids[0] && r.status === "Rejected")) {
      backend.cancel(ids[1]);
      backend.markRolledBack(ids[1]); // the 0.1 interface has no call for this once ids[1] has a verdict (ESCALATIONS SE-5)
      rb = input.tick;
      runtime.decisions.push({ tick: input.tick, op: "rollback", action: ids[1] });
      runtime.onInput = null;
    }
  };
  await sleep(1000);
  runtime.onInput = null;
  const b = runtime.actions.get(ids[1]);
  return { keys: [`block(18,-60,${z})`], notes: `first ${runtime.actions.get(ids[0]).status}, second ${b.status} at ${b.verdictTick}, rollback at ${rb}`, label: () => "outside" };
});
await cmds("tp golem 40 -60 40");

// ---- summary
const RULE_NAMES = ["provisional", "refined", "runtimeSide"];
const byScenario = {};
for (const r of results.filter((r) => r.changes)) {
  const s = (byScenario[r.name] ??= { harm: r.harm, reps: 0, changes: 0, notes: [], ...Object.fromEntries(RULE_NAMES.map((n) => [n, { false_own: 0, false_outside: 0 }])) });
  s.reps++;
  if (r.notes) s.notes.push(r.notes);
  for (const c of r.changes) {
    s.changes++;
    for (const n of RULE_NAMES) {
      if (c[n] === "own" && c.truth === "outside") s[n].false_own++;
      if (c[n] === "outside" && c.truth === "own") s[n].false_outside++;
    }
  }
}
const totals = Object.fromEntries(RULE_NAMES.map((n) => [n, { false_own: 0, false_outside: 0 }]));
let total = 0;
for (const s of Object.values(byScenario)) { total += s.changes; for (const n of RULE_NAMES) { totals[n].false_own += s[n].false_own; totals[n].false_outside += s[n].false_outside; } }
save(exp, "summary.json", { experiment: "E4 attribution", reps: REPS, rtt_ms: backend.rtt, totals: { changes: total, ...totals }, by_scenario: byScenario, knockback: kb, errors: results.filter((r) => r.error), runs: results, validation: tally.summary() });
console.table(Object.fromEntries(Object.entries(byScenario).map(([k, s]) => [k.slice(0, 60), { n: s.changes, "P own": s.provisional.false_own, "P out": s.provisional.false_outside, "R own": s.refined.false_own, "R out": s.refined.false_outside, "A own": s.runtimeSide.false_own, "A out": s.runtimeSide.false_outside }])));
console.log(JSON.stringify({ total, totals, kb }));
await teardown(ctx);
process.exit(0);
