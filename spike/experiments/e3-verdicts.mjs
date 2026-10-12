// E3. Verdicts for representative primitives (§17.1, §14.3): dig (ack + state), place_block (ack +
// state, one use-item-on packet), look_at (settle), pick_up/put/quick_move on a chest (settle), with
// provoked rejections (spawn protection, adventure mode, stale state id, contention, reverts) and
// async mode for dig and place_block (predicted Delta vs what the server confirms).
// Usage: node experiments/e3-verdicts.mjs
import { Vec3 } from "vec3";
import { setup, teardown, sleep, save, until, scriptedProgram, verdict } from "../lib/harness.mjs";

const exp = "e3";
const program = scriptedProgram();
const ctx = await setup(exp, program, { backendOpts: { flushMode: "deferred", keepAttribution: true } });
const { server, backend, runtime, rival, tally } = ctx;
const bot = backend.bot;
const rows = [];
const CHEST = [38, -60, 42];

// Snapshot of the confirmed view for an action's watched keys when its verdict is processed.
runtime.onInput = (input, rt) => {
  for (const r of input.reports) {
    const a = rt.actions.get(r.action);
    if (!a || !["Confirmed", "Rejected", "Failed"].includes(r.status) || !a.watch) continue;
    a.viewAtVerdict = Object.fromEntries(a.watch.map((k) => { const m = /^block\((-?\d+),(-?\d+),(-?\d+)\)$/.exec(k); return [k, m ? rt.block([+m[1], +m[2], +m[3]]) : rt.view.get(k) ?? null]; }));
  }
};

async function act(label, primitive, args, { mode = "sync", watch = [], overrides, before, onVerdict, expect, extra } = {}) {
  const f = { block: backend.blockLog.length, same: backend.sameValueBlockUpdates.length, ack: backend.ackLog.length, slot: backend.slotLog.length, attr: backend.attrLog.length };
  if (overrides) backend.instrument.nextActionOverrides = overrides;
  const id = await program.run((c) => { before?.(c); const id = c.start(primitive, args, mode); runtime.actions.get(id).watch = watch; return id; });
  const a = runtime.actions.get(id);
  const v = await verdict(runtime, id, 30000);
  if (onVerdict) await onVerdict(v);
  await sleep(500);
  const row = {
    label, primitive, mode, expect, verdict: v.status, detail: v.detail ?? null,
    start_tick: a.startTick, issued_tick: a.issuedTick ?? null, verdict_tick: v.verdictTick, latency_ticks: v.verdictTick - a.startTick,
    delta: a.delta ?? null, view_at_verdict: a.viewAtVerdict ?? null,
    server_block_changes: backend.blockLog.slice(f.block), same_value_block_updates: backend.sameValueBlockUpdates.slice(f.same),
    acks: backend.ackLog.slice(f.ack), slot_packets: backend.slotLog.slice(f.slot),
    changes_after: backend.attrLog.slice(f.attr).filter((c) => watch.includes(c.key)).map((c) => ({ tick: c.tick, key: c.key, value: c.value, refined: c.answers.refined, provisional: c.answers.provisional })),
    ...(extra ? extra() : {}),
  };
  if (mode === "async" && a.delta) {
    row.prediction_vs_server = a.delta.map((d) => ({ key: d.key, predicted: d.value, server: row.view_at_verdict?.[d.key] ?? null, exact: JSON.stringify(d.value) === JSON.stringify(row.view_at_verdict?.[d.key]), same_type: String(d.value).replace(/\[.*$/, "") === String(row.view_at_verdict?.[d.key]).replace(/\[.*$/, "") }));
  }
  rows.push(row);
  console.log(`${label}: ${v.status}${v.detail ? ` (${v.detail})` : ""} in ${row.latency_ticks}t ${row.prediction_vs_server ? JSON.stringify(row.prediction_vs_server) : ""}`);
  return row;
}

async function cmds(...cs) { for (const c of cs) server.cmd(c); await server.sync(); await sleep(400); }
const bk = (p) => `block(${p.join(",")})`;

// ------------------------------------------------------------------ world
await cmds("gamemode survival golem", "tp golem 40 -60 40 0 0", "tp Rival 36 -60 44", "clear golem", "fill 30 -60 30 55 -55 55 air",
  "item replace entity golem hotbar.0 with dirt 64", "item replace entity golem hotbar.1 with oak_log 16", "item replace entity golem hotbar.2 with torch 16");
const sel = (slot) => program.run(() => { bot.setQuickBarSlot(slot); });

// ------------------------------------------------------------------ dig
for (const [i, p] of [[41, -60, 40], [41, -60, 41], [41, -60, 39]].entries()) {
  await cmds(`setblock ${p.join(" ")} dirt`);
  await act(`D1.${i + 1} dig dirt (success)`, "dig", { pos: p }, { watch: [bk(p)], expect: "Confirmed" });
}
await cmds("setblock 42 -60 40 oak_log");
await act("D2 dig oak_log by hand (success)", "dig", { pos: [42, -60, 40] }, { watch: [bk([42, -60, 40])], expect: "Confirmed" });
await cmds("tp golem 2 -60 2", "setblock 3 -60 3 dirt");
await act("D3 dig inside spawn protection (non-op)", "dig", { pos: [3, -60, 3] }, { watch: [bk([3, -60, 3])], expect: "Rejected" });
await cmds("tp golem 40 -60 40", "setblock 41 -60 40 dirt", "gamemode adventure golem");
await act("D4 dig in adventure mode", "dig", { pos: [41, -60, 40] }, { watch: [bk([41, -60, 40])], expect: "Rejected" });
await cmds("gamemode survival golem", "setblock 41 -60 41 dirt");
await act("D5 dig, then /setblock reverts the block right after the verdict", "dig", { pos: [41, -60, 41] }, { watch: [bk([41, -60, 41])], expect: "Confirmed, then an Outside change",
  onVerdict: async () => { server.cmd("setblock 41 -60 41 dirt"); await sleep(300); } });
await cmds("setblock 41 -60 39 oak_log");
await act("D6 dig oak_log, /setblock replaces it with stone 10 ticks in", "dig", { pos: [41, -60, 39] }, { watch: [bk([41, -60, 39])], expect: "BlockChanged at the runtime (invariant); verdict per server",
  before: () => setTimeout(() => server.cmd("setblock 41 -60 39 stone"), 500) });
await cmds("setblock 42 -60 41 oak_log", "gamemode creative Rival", "tp Rival 43 -60 42");
await act("D7 dig oak_log while the second player breaks it", "dig", { pos: [42, -60, 41] }, { watch: [bk([42, -60, 41])], expect: "verdict by state; BlockChanged invariant at the runtime",
  before: () => setTimeout(() => rival.dig(rival.blockAt(new Vec3(42, -60, 41))).catch(() => {}), 400) });

// ------------------------------------------------------------------ place_block
await sel(0);
await act("P1 place dirt on grass, face Up (success)", "place_block", { support: [43, -61, 41], face: "Up" }, { watch: [bk([43, -60, 41])], expect: "Confirmed" });
await cmds("tp golem 2 -60 2", "setblock 4 -60 2 air");
await act("P2 place inside spawn protection (non-op)", "place_block", { support: [4, -61, 2], face: "Up" }, { watch: [bk([4, -60, 2])], expect: "Rejected" });
await act("P2c place inside spawn protection where the target already holds dirt (server refuses)", "place_block", { support: [3, -61, 3], face: "Up" }, { watch: [bk([3, -60, 3])], expect: "server refuses; state coincides with the prediction" });
await cmds("tp golem 40 -60 40", "gamemode adventure golem");
await act("P3 place in adventure mode", "place_block", { support: [43, -61, 39], face: "Up" }, { watch: [bk([43, -60, 39])], expect: "Rejected" });
await cmds("gamemode survival golem", "setblock 42 -60 39 stone", "setblock 42 -59 39 stone");
await act("P4 place into an occupied cell (target already stone)", "place_block", { support: [42, -60, 39], face: "Up" }, { watch: [bk([42, -59, 39])], expect: "Rejected",
  before: () => { /* the client would never send this; the server refuses */ } });
await act("P5 place dirt, then /setblock removes it right after the verdict", "place_block", { support: [44, -61, 40], face: "Up" }, { watch: [bk([44, -60, 40])], expect: "Confirmed, then an Outside change",
  onVerdict: async () => { server.cmd("setblock 44 -60 40 air"); await sleep(300); } });
await sel(1);
await act("P6 place oak_log on a side face (axis differs from default)", "place_block", { support: [42, -60, 39], face: "North" }, { watch: [bk([42, -60, 38])], expect: "Confirmed by type; state axis=z" });
await sel(2);
await act("P7 place torch on a side face (becomes wall_torch)", "place_block", { support: [42, -60, 39], face: "East" }, { watch: [bk([43, -60, 39])], expect: "server places wall_torch" });
await act("P8 place torch on top of stone", "place_block", { support: [42, -59, 39], face: "Up" }, { watch: [bk([42, -58, 39])], expect: "Confirmed" });
await sel(0);

// ------------------------------------------------------------------ look_at
await act("L1 look_at (success)", "look_at", { target: [30.5, -58, 50.5] }, { watch: ["player.rotation"], expect: "Confirmed" });
backend.instrument.onLookReached = () => { server.cmd("tp golem 40 -60 40 90 0"); backend.instrument.onLookReached = null; };
await act("L2 look_at, /tp sets the rotation when the aim is reached", "look_at", { target: [50.5, -58, 30.5] }, { watch: ["player.rotation"], expect: "Rejected (correction in settle window)" });

// ------------------------------------------------------------------ windows (chest)
async function openChest(who = bot, fill = true) {
  if (fill) await cmds(`setblock ${CHEST.join(" ")} air`, `setblock ${CHEST.join(" ")} chest`, `item replace block ${CHEST.join(" ")} container.0 with oak_log 10`, `item replace block ${CHEST.join(" ")} container.2 with cobblestone 5`);
  await who.openContainer(who.blockAt(new Vec3(...CHEST)));
  await sleep(400);
}
const handle = () => runtime.view.get("window.id");
await cmds("clear golem", "item replace entity golem hotbar.0 with dirt 16");
await openChest();
const extraWin = () => ({ window_after: { cursor: runtime.view.get("inventory.cursor"), slots: Object.fromEntries([0, 1, 2, 54, 62].map((i) => [i, runtime.view.get(`window.slot(${i})`) ?? null])), state_id: backend.stateId } });
const wkeys = (...ss) => [...ss.map((i) => `window.slot(${i})`), "inventory.cursor"];
await act("W1 pick_up chest slot 0 (whole)", "pick_up", { w: handle(), slot: 0, half: false }, { watch: wkeys(0), expect: "Confirmed", extra: extraWin });
await act("W2 put into empty chest slot 1", "put", { w: handle(), slot: 1, one: false }, { watch: wkeys(1), expect: "Confirmed", extra: extraWin });
await act("W3 pick_up half of slot 1", "pick_up", { w: handle(), slot: 1, half: true }, { watch: wkeys(1), expect: "Confirmed", extra: extraWin });
await act("W4 put one into slot 0", "put", { w: handle(), slot: 0, one: true }, { watch: wkeys(0), expect: "Confirmed", extra: extraWin });
await act("W5 put the rest into slot 0", "put", { w: handle(), slot: 0, one: false }, { watch: wkeys(0), expect: "Confirmed", extra: extraWin });
await act("W6 quick_move chest slot 2 (cobblestone) to the player", "quick_move", { w: handle(), slot: 2 }, { watch: wkeys(2, 62, 61, 54), expect: "Confirmed", extra: extraWin });
await act("W7 quick_move hotbar dirt (window slot 54) into the chest", "quick_move", { w: handle(), slot: 54 }, { watch: wkeys(54, 2), expect: "Confirmed", extra: extraWin });
await act("W8 pick_up slot 0 with a stale state id", "pick_up", { w: handle(), slot: 0, half: false }, { watch: wkeys(0), overrides: { stateIdOverride: Math.max(0, backend.stateId - 3) }, expect: "server applies the click and resyncs", extra: extraWin });
await act("W8b put it back", "put", { w: handle(), slot: 0, one: false }, { watch: wkeys(0), expect: "Confirmed", extra: extraWin });
// Contention: the second player clicks the same slot first.
await cmds("gamemode survival Rival", "tp Rival 37 -60 43");
await rival.openContainer(rival.blockAt(new Vec3(...CHEST)));
await sleep(400);
await act("W9 pick_up slot 0 after the second player quick-moved it away", "pick_up", { w: handle(), slot: 0, half: false }, { watch: wkeys(0), expect: "Rejected", extra: extraWin,
  before: () => { rival.clickWindow(0, 0, 1).catch(() => {}); } });
await act("W9b put the cursor back (if any)", "put", { w: handle(), slot: 3, one: false }, { watch: wkeys(3), expect: "any", extra: extraWin }).catch(() => {});
await cmds(`item replace block ${CHEST.join(" ")} container.1 with oak_log 4`);
{ // the second player holds oak logs on its cursor, then right-clicks one into slot 1 in the golem's tick
  const w = rival.currentWindow;
  const src = w.slots.findIndex((s, i) => i >= w.inventoryStart && s?.name === "oak_log");
  if (src >= 0) await rival.clickWindow(src, 0, 0);
  await sleep(300);
}
await act("W10 pick_up slot 1 after the second player added one to it", "pick_up", { w: handle(), slot: 1, half: false }, { watch: wkeys(1), expect: "Rejected", extra: extraWin,
  before: () => { rival.clickWindow(1, 1, 0).catch(() => {}); } });
await act("W10b put the cursor down", "put", { w: handle(), slot: 4, one: false }, { watch: wkeys(4), expect: "any", extra: extraWin }).catch(() => {});
rival.closeWindow(rival.currentWindow);

// Clicks the server never applies: the window it targets is already closed server-side.
async function truth(item) {
  const line = await server.cmdWait(`clear golem ${item} 0`, /(Found|No items were found)/);
  const m = /Found (\d+)/.exec(line);
  return m ? +m[1] : 0;
}
await cmds("clear golem", "item replace entity golem hotbar.0 with dirt 16");
await openChest();
await act("W11 pick_up chest slot 0 (setup)", "pick_up", { w: handle(), slot: 0, half: false }, { watch: wkeys(0), expect: "Confirmed" });
const closedId = backend.win.id;
await act("W11 put cursor into player slot (window slot 30) to a window id the server has closed", "put", { w: handle(), slot: 30, one: false },
  { watch: wkeys(30), overrides: { windowIdOverride: (closedId % 100) + 1 }, expect: "false Confirmed (the server ignores clicks for another window id)", extra: () => ({ mirror_cursor: backend.cursor, mirror_inv_slot_12: backend.inv[12] }) });
await sleep(500);
const w11 = rows.at(-1);
w11.server_truth = { oak_log_in_inventory: await truth("oak_log"), mirror_inventory_oak_log: backend.inv.filter((s) => s?.item === "minecraft:oak_log").reduce((n, s) => n + s.count, 0) + (backend.cursor?.item === "minecraft:oak_log" ? backend.cursor.count : 0) };
console.log("W11 truth", w11.server_truth);
await program.run(() => { bot.closeWindow(bot.currentWindow); backend.instrument.closedByClient = true; });
await sleep(800);
w11.after_close = { oak_log_server: await truth("oak_log"), oak_log_mirror: backend.inv.filter((s) => s?.item === "minecraft:oak_log").reduce((n, s) => n + s.count, 0) + (backend.cursor?.item === "minecraft:oak_log" ? backend.cursor.count : 0) };
console.log("W11 after close", w11.after_close);

// Probe confirmation: the same two cases with the probe click.
await cmds("clear golem", "item replace entity golem hotbar.0 with dirt 16");
await openChest();
await act("W13 pick_up chest slot 0, confirmed by probe resync", "pick_up", { w: handle(), slot: 0, half: false }, { watch: wkeys(0), overrides: { probe: true }, expect: "Confirmed by state" });
const closedId2 = backend.win.id;
let w14;
try {
  w14 = await act("W14 put to a window id the server has closed, probe", "put", { w: handle(), slot: 30, one: false }, { watch: wkeys(30), overrides: { probe: true, windowIdOverride: (closedId2 % 100) + 1 }, expect: "no verdict (Unconfirmed at confirm_timeout)" });
} catch (e) {
  rows.push({ label: "W14 put to a window id the server has closed, probe", primitive: "put", mode: "sync", expect: "no verdict (Unconfirmed at confirm_timeout)", verdict: "none within 30 s (runtime assigns Unconfirmed)", detail: null, latency_ticks: null, same_value_block_updates: [], slot_packets: [] });
  console.log("W14: no verdict");
}
await program.run(() => { bot.closeWindow(bot.currentWindow); });
await sleep(800);
await cmds("kill @e[type=item]");

// Race: the chest is removed by console in the same tick as the click, 6 times.
const races = [];
for (let i = 0; i < 6; i++) {
  await cmds("clear golem");
  await openChest();
  const r = await act(`W12.${i + 1} pick_up while the chest is removed in the same tick`, "pick_up", { w: handle(), slot: 0, half: false }, { watch: wkeys(0), expect: "race",
    before: () => server.cmd(`setblock ${CHEST.join(" ")} air`), extra: () => ({ window_closed_event: !backend.win }) });
  await sleep(600);
  const logs = await truth("oak_log");
  const mirror = backend.inv.filter((s) => s?.item === "minecraft:oak_log").reduce((n, s) => n + s.count, 0) + (backend.cursor?.item === "minecraft:oak_log" ? backend.cursor.count : 0);
  r.server_truth = { oak_log_in_inventory_or_dropped: logs, mirror_oak_log: mirror, desync: logs !== mirror };
  races.push({ verdict: r.verdict, server: logs, mirror });
  await cmds("kill @e[type=item]");
}

// ------------------------------------------------------------------ async mode (dig, place_block)
await cmds("clear golem", "item replace entity golem hotbar.0 with dirt 64", "item replace entity golem hotbar.1 with oak_log 16", "item replace entity golem hotbar.2 with torch 16",
  "setblock 41 -60 40 dirt", "setblock 41 -60 41 oak_log", "setblock 42 -60 39 stone", "fill 42 -60 38 44 -58 41 air replace oak_log", "fill 43 -60 39 43 -58 39 air", "setblock 42 -59 39 air", "setblock 42 -58 39 air");
await sel(0);
await act("A1 async dig dirt", "dig", { pos: [41, -60, 40] }, { mode: "async", watch: [bk([41, -60, 40])] });
await act("A2 async dig oak_log", "dig", { pos: [41, -60, 41] }, { mode: "async", watch: [bk([41, -60, 41])] });
await act("A3 async place dirt (Up)", "place_block", { support: [43, -61, 42], face: "Up" }, { mode: "async", watch: [bk([43, -60, 42])] });
await sel(1);
await act("A4 async place oak_log on a side face", "place_block", { support: [42, -60, 39], face: "North" }, { mode: "async", watch: [bk([42, -60, 38])] });
await sel(2);
await act("A5 async place torch on a side face", "place_block", { support: [42, -60, 39], face: "East" }, { mode: "async", watch: [bk([43, -60, 39])] });
await act("A6 async place torch on top", "place_block", { support: [42, -60, 39], face: "Up" }, { mode: "async", watch: [bk([42, -59, 39])] });
await sel(0);
await cmds("tp golem 2 -60 2", "setblock 3 -60 3 dirt");
await act("A7 async dig inside spawn protection", "dig", { pos: [3, -60, 3] }, { mode: "async", watch: [bk([3, -60, 3])] });
await act("A8 async place inside spawn protection", "place_block", { support: [4, -61, 3], face: "Up" }, { mode: "async", watch: [bk([4, -60, 3])] });
await cmds("tp golem 40 -60 40");

// ------------------------------------------------------------------ summary
const digs = rows.filter((r) => r.primitive === "dig" && r.verdict === "Confirmed");
const split = digs.map((r) => {
  const last = r.acks.at(-1);
  const ch = r.server_block_changes.find((c) => /air/.test(c.value));
  return { label: r.label, change_tick: ch?.tick ?? null, ack_tick: last?.tick ?? null, same_tickinput: ch && last ? ch.tick === last.tick : null };
});
const table = rows.map((r) => ({ label: r.label, expect: r.expect, verdict: r.verdict, detail: r.detail, latency_ticks: r.latency_ticks, same_value_block_updates: r.same_value_block_updates.length, slot_packets: r.slot_packets.length }));
save(exp, "summary.json", { experiment: "E3 verdicts", table, block_change_vs_ack: split, races, rows, validation: tally.summary(), rtt_ms: backend.rtt });
console.table(table);
console.log(JSON.stringify({ split, races }, null, 1));
await teardown(ctx);
process.exit(0);
