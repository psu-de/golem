// E5. Pathfinder under runtime control (S-5): mineflayer-pathfinder configured per §18.4 (digging
// off, empty scaffolding list, opts.avoid as an exclusion area). Measures cancel-on-freeze (§15.4),
// path_progress observability per tick, Goal.Clear and Goal.AllOf, and avoid-region compliance.
// Usage: node experiments/e5-pathfinder.mjs
import { Vec3 } from "vec3";
import { setup, teardown, sleep, save, until, scriptedProgram, verdict } from "../lib/harness.mjs";
import { clearReached } from "../lib/goals.mjs";

const exp = "e5";
const program = scriptedProgram();
const ctx = await setup(exp, program, { backendOpts: { flushMode: "deferred", recordWrites: true } });
const { server, backend, runtime, tally } = ctx;
const bot = backend.bot;
async function cmds(...cs) { for (const c of cs) server.cmd(c); await server.sync(); await sleep(400); }
const out = {};

// Per-tick trace of the bot (sampled inside the runtime tick, after ingest).
const trace = [];
const CONTROLS = ["forward", "back", "left", "right", "jump", "sprint", "sneak"];
const activeControls = () => CONTROLS.filter((c) => bot.getControlState(c));
runtime.onInput = (input) => {
  const p = bot.entity.position, v = bot.entity.velocity;
  trace.push({ tick: input.tick, pos: [p.x, p.y, p.z], vel: Math.hypot(v.x, v.z), controls: activeControls(), progress: input.measurements.path_progress, reports: input.reports.map((r) => `${r.action}:${r.status}`) });
};
const movementPackets = (fromTick, toTick) => backend.writes.filter((w) => ["position", "position_look", "look", "flying"].includes(w.name) && w.tick >= fromTick && w.tick <= toTick);

await cmds("gamemode survival golem", "fill 20 -60 20 80 -55 80 air", "tp golem 30 -60 40 -90 0", "effect give golem saturation 100000 255 true");

// ------------------------------------------------------------------ 1. cancel on freeze
const cancels = [];
for (let i = 0; i < 10; i++) {
  await cmds(`tp golem 30 -60 ${30 + i} -90 0`);
  const id = await program.run((c) => c.start("pathfind", { goal: { XZ: { x: 70, z: 30 + i } }, limit: 2400, opts: { avoid: null } }));
  await sleep(600 + i * 137); // vary the moment: accelerating, sprinting, sprint-jumping
  const before = { tick: backend.tickNo, controls: activeControls() };
  let sameTick = null;
  await program.run((c) => { c.cancel(id); sameTick = { controls: activeControls(), goal: bot.pathfinder.goal ? "set" : null }; });
  const ct = backend.cancelLog.at(-1);
  await sleep(1500);
  const after = trace.filter((t) => t.tick > ct.tick);
  const lastMove = (() => { let last = ct.tick; let prev = null; for (const t of after) { if (prev && Math.hypot(t.pos[0] - prev[0], t.pos[2] - prev[2]) > 1e-4) last = t.tick; prev = t.pos; } return last; })();
  const p0 = ct.pos;
  const pEnd = after.at(-1).pos;
  const pk = movementPackets(ct.tick + 1, ct.tick + 30);
  cancels.push({
    run: i, cancel_tick: ct.tick, controls_before: before.controls,
    controls_after_cancel_same_tick: sameTick.controls, pathfinder_goal_after_cancel: sameTick.goal,
    controls_any_later_tick: [...new Set(after.flatMap((t) => t.controls))],
    horizontal_speed_at_cancel: +Math.hypot(ct.vel.x, ct.vel.z).toFixed(3),
    slide_distance: +Math.hypot(pEnd[0] - p0.x, pEnd[2] - p0.z).toFixed(3), ticks_until_still: lastMove - ct.tick,
    movement_packets_next_30_ticks: pk.length, movement_packets_while_sliding: pk.filter((w) => w.tick - ct.tick <= lastMove - ct.tick + 1).length,
    movement_packets_after_still: pk.filter((w) => w.tick - ct.tick > lastMove - ct.tick + 1).map((w) => ({ name: w.name, offset: w.tick - ct.tick })),
    sprint_stop_sent_in_cancel: backend.writes.some((w) => w.tick === ct.tick && w.phase === "cancel" && w.name === "entity_action"),
  });
  console.log(`cancel ${i}: controls same tick ${JSON.stringify(sameTick.controls)}, slide ${cancels.at(-1).slide_distance} in ${cancels.at(-1).ticks_until_still}t, packets ${pk.length}`);
}
// pathfinder.stop() for comparison: graceful stop waits for the next node.
await cmds("tp golem 30 -60 40 -90 0");
await program.run((c) => c.start("pathfind", { goal: { XZ: { x: 70, z: 40 } }, limit: 2400, opts: { avoid: null } }));
await sleep(900);
const stopTick = backend.tickNo;
bot.pathfinder.stop();
await until(() => !bot.getControlState("forward"), 5000, "stop() releases");
const stopRelease = backend.tickNo - stopTick;
await program.run((c) => { for (const [id, a] of runtime.actions) if (a.primitive === "pathfind" && !["Confirmed", "Rejected", "Failed", "Cancelled"].includes(a.status)) c.cancel(id); });
out.cancel = { runs: cancels, pathfinder_stop_release_ticks: stopRelease };

// ------------------------------------------------------------------ 2. path_progress per tick
await cmds("tp golem 30 -60 40 -90 0", "fill 45 -60 30 45 -57 50 stone", "fill 45 -60 39 45 -59 41 air");
let from = trace.length;
let id = await program.run((c) => c.start("pathfind", { goal: { At: { pos: [60, -60, 44] } }, limit: 2400, opts: { avoid: null } }));
let v = await verdict(runtime, id, 30000);
let tr = trace.slice(from).filter((t) => t.tick >= runtime.actions.get(id).startTick + 1 && t.tick <= v.verdictTick);
const gaps = [];
let lastInc = tr[0]?.tick, lastVal = tr[0]?.progress ?? 0, decreases = 0;
for (const t of tr) {
  if (t.progress == null) continue;
  if (t.progress > lastVal) { gaps.push(t.tick - lastInc); lastInc = t.tick; }
  if (t.progress < lastVal) decreases++;
  lastVal = t.progress;
}
out.progress = { verdict: v.status, ticks: tr.length, non_null_ticks: tr.filter((t) => t.progress != null).length, final: lastVal, decreases, max_ticks_between_increments: Math.max(...gaps), mean_ticks_between_increments: +(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(2) };
console.log("progress", out.progress);

// Replanning: block the route mid-path; progress must keep increasing across the replan.
await cmds("tp golem 30 -60 40 -90 0");
from = trace.length;
id = await program.run((c) => c.start("pathfind", { goal: { At: { pos: [60, -60, 40] } }, limit: 2400, opts: { avoid: null } }));
await sleep(1200);
server.cmd("fill 45 -60 39 45 -59 41 stone");
server.cmd("fill 45 -60 30 45 -57 33 air");
const blockTick = backend.tickNo;
v = await verdict(runtime, id, 40000);
tr = trace.slice(from).filter((t) => t.tick <= v.verdictTick);
let stall = 0, cur = 0, lv = -1;
for (const t of tr) { if (t.progress != null && t.progress > lv) { lv = t.progress; cur = 0; } else cur++; stall = Math.max(stall, cur); }
out.progress_replan = { verdict: v.status, final_progress: lv, decreases: tr.filter((t, i) => i && t.progress != null && tr[i - 1].progress != null && t.progress < tr[i - 1].progress).length, longest_stall_ticks: stall, within_5s: stall <= 100, blocked_at_tick: blockTick };
console.log("replan", out.progress_replan);
await cmds("fill 45 -60 30 45 -57 50 air");

// No path: goal inside a closed box. In an open world the A* search times out (thinkTimeout) instead
// of exhausting, so the pathfinder reports partial paths, never "noPath"; observe for 15 s.
await cmds("tp golem 30 -60 40", "fill 55 -60 55 57 -57 57 stone", "setblock 56 -59 56 air", "setblock 56 -60 56 air");
from = trace.length;
id = await program.run((c) => c.start("pathfind", { goal: { At: { pos: [56, -60, 56] } }, limit: 2400, opts: { avoid: null } }));
const pfA = backend.pathfindAction;
await sleep(15000);
const npTrace = trace.slice(from);
let npStall = 0, npCur = 0, npLast = -1;
for (const t of npTrace) { if (t.progress != null && t.progress > npLast) { npLast = t.progress; npCur = 0; } else npCur++; npStall = Math.max(npStall, npCur); }
out.no_path = { status_after_15s: runtime.actions.get(id).status, path_update_statuses: (pfA?.statuses ?? []).reduce((m, x) => ((m[x.status] = (m[x.status] ?? 0) + 1), m), {}),
  final_progress: npLast, longest_progress_stall_ticks: npStall, progress_clause_would_fail: npStall > 100, final_pos: bot.entity.position.toArray().map((x) => +x.toFixed(2)) };
await program.run((c) => c.cancel(id));
console.log("no path", out.no_path);
// No path in a closed area: the bot boxed in, goal outside, so the search space is finite.
await cmds("fill 30 -61 30 34 -57 34 stone", "fill 31 -60 31 33 -58 33 air", "tp golem 32.5 -60 32.5");
id = await program.run((c) => c.start("pathfind", { goal: { At: { pos: [40, -60, 40] } }, limit: 2400, opts: { avoid: null } }));
v = await verdict(runtime, id, 30000).catch(() => ({ status: "none in 30 s" }));
out.no_path_enclosed = { verdict: v.status, detail: v.detail ?? null, ticks: v.verdictTick ? v.verdictTick - runtime.actions.get(id).startTick : null };
console.log("no path enclosed", out.no_path_enclosed);
if (v.status === "none in 30 s") await program.run((c) => c.cancel(id));
await cmds("fill 55 -60 55 57 -57 57 air", "fill 30 -61 30 34 -57 34 air", "fill 30 -61 30 34 -61 34 grass_block");

// ------------------------------------------------------------------ 3. Goal.Clear and Goal.AllOf
await cmds("tp golem 40.5 -60 40.5");
id = await program.run((c) => c.start("pathfind", { goal: { Clear: { pos: [40, -60, 40] } }, limit: 2400, opts: { avoid: null } }));
v = await verdict(runtime, id, 20000);
out.goal_clear = { verdict: v.status, clear_reached_exact: clearReached(bot, [40, -60, 40]), pos: bot.entity.position.toArray().map((x) => +x.toFixed(3)) };
// Standing in a 1-wide corridor: the only way to clear the cell is along the corridor.
await cmds("fill 39 -60 44 41 -59 50 stone", "fill 40 -60 45 40 -59 49 air", "tp golem 40.5 -60 47.5");
id = await program.run((c) => c.start("pathfind", { goal: { Clear: { pos: [40, -60, 47] } }, limit: 2400, opts: { avoid: null } }));
v = await verdict(runtime, id, 20000);
out.goal_clear_corridor = { verdict: v.status, clear_reached_exact: clearReached(bot, [40, -60, 47]), pos: bot.entity.position.toArray().map((x) => +x.toFixed(3)) };
await cmds("fill 39 -60 44 41 -59 50 air");
// AllOf([InReach(support), Clear(target)]): the place composite's spot (decision 92).
await cmds("tp golem 50.5 -60 50.5", "setblock 50 -61 50 stone");
id = await program.run((c) => c.start("pathfind", { goal: { AllOf: { goals: [{ InReach: { pos: [50, -61, 50] } }, { Clear: { pos: [50, -60, 50] } }] } }, limit: 2400, opts: { avoid: null } }));
v = await verdict(runtime, id, 20000);
const eye = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
out.goal_allof = { verdict: v.status, clear_reached_exact: clearReached(bot, [50, -60, 50]), eye_to_support_centre: +eye.distanceTo(new Vec3(50.5, -60.5, 50.5)).toFixed(3), pos: bot.entity.position.toArray().map((x) => +x.toFixed(3)) };
// Unsatisfiable AllOf (two disjoint At goals): no node satisfies it, but in an open world the search
// times out instead of exhausting (SE-9). Observe 10 s, then cancel.
id = await program.run((c) => c.start("pathfind", { goal: { AllOf: { goals: [{ At: { pos: [52, -60, 52] } }, { At: { pos: [54, -60, 54] } }] } }, limit: 2400, opts: { avoid: null } }));
const pfU = backend.pathfindAction;
await sleep(10000);
out.goal_allof_unsatisfiable = { status_after_10s: runtime.actions.get(id).status, path_update_statuses: (pfU?.statuses ?? []).reduce((m, x) => ((m[x.status] = (m[x.status] ?? 0) + 1), m), {}), progress: pfU?.progress() ?? null };
if (!["Confirmed", "Rejected", "Failed"].includes(runtime.actions.get(id).status)) await program.run((c) => c.cancel(id));
console.log("goals", out.goal_clear, out.goal_clear_corridor, out.goal_allof, out.goal_allof_unsatisfiable);

// ------------------------------------------------------------------ 4. avoid region
const avoidRuns = [];
for (const [label, region, goal] of [
  ["slab across the straight line", { min: [44, -61, 36], max: [46, -55, 44] }, { At: { pos: [60, -60, 40] } }],
  ["region around the goal approach", { min: [55, -61, 38], max: [59, -55, 42] }, { At: { pos: [61, -60, 40] } }],
  ["goal inside the region", { min: [58, -61, 38], max: [62, -55, 42] }, { At: { pos: [60, -60, 40] } }],
]) {
  await cmds("tp golem 30.5 -60 40.5");
  from = trace.length;
  id = await program.run((c) => c.start("pathfind", { goal, limit: 2400, opts: { avoid: region } }));
  v = await verdict(runtime, id, 15000).catch(() => ({ status: "no verdict in 15 s (cancelled)" }));
  if (!["Confirmed", "Rejected", "Failed"].includes(runtime.actions.get(id).status)) await program.run((c) => c.cancel(id));
  const inside = trace.slice(from).filter((t) => {
    const p = t.pos, hw = 0.3; // any part of the bounding box in the region
    return p[0] + hw > region.min[0] && p[0] - hw < region.max[0] + 1 && p[2] + hw > region.min[2] && p[2] - hw < region.max[2] + 1 && p[1] < region.max[1] + 1 && p[1] + 1.8 > region.min[1];
  });
  const feetInside = trace.slice(from).filter((t) => { const f = t.pos.map(Math.floor); return f[0] >= region.min[0] && f[0] <= region.max[0] && f[2] >= region.min[2] && f[2] <= region.max[2] && f[1] >= region.min[1] && f[1] <= region.max[1]; });
  avoidRuns.push({ label, region, verdict: v.status, detail: v.detail, ticks_feet_block_inside: feetInside.length, ticks_bbox_overlapping: inside.length });
  console.log("avoid", avoidRuns.at(-1));
}
out.avoid = avoidRuns;

save(exp, "summary.json", { experiment: "E5 pathfinder", ...out, validation: tally.summary() });
await teardown(ctx);
process.exit(0);
