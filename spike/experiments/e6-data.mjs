// E6. Version data (S-3, question 5, finding 4).
// Part A (offline): inventory the vanilla data generator output for the pinned version and check
// minecraft-data's coverage of the physics data against it.
// Part B (server): validate dig times, can_harvest tier boundaries, furnace burn times and the draft
// placement table against the running server.
// Usage: node experiments/e6-data.mjs [--offline]   (needs server/1.21.4/generated: scripts/datagen.sh)
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Vec3 } from "vec3";
import mcDataLoader from "minecraft-data";
import { SPIKE, MC_VERSION } from "../lib/server.mjs";
import { save } from "../lib/harness.mjs";

const exp = "e6";
const GEN = join(SPIKE, "server", MC_VERSION, "generated");
if (!existsSync(GEN)) { console.error("run scripts/datagen.sh first"); process.exit(1); }
const mcd = mcDataLoader(MC_VERSION);
const json = (p) => JSON.parse(readFileSync(join(GEN, p), "utf8"));
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)).map((x) => `${f}/${x}`) : [f]));
const strip = (s) => s.replace(/^minecraft:/, "");

// ------------------------------------------------------------------ A1. data generator inventory
const blocks = json("reports/blocks.json");
const items = json("reports/items.json");
const registries = json("reports/registries.json");
const tagDir = join(GEN, "data/minecraft/tags");
const tagKinds = Object.fromEntries(readdirSync(tagDir).map((k) => [k, walk(join(tagDir, k)).length]));
const recipes = walk(join(GEN, "data/minecraft/recipe"));
const loot = walk(join(GEN, "data/minecraft/loot_table"));
const states = Object.values(blocks).reduce((n, b) => n + b.states.length, 0);
const itemsWithTool = Object.entries(items).filter(([, v]) => v.components["minecraft:tool"]);
const inventory = {
  blocks: Object.keys(blocks).length, block_states: states, items: Object.keys(items).length, registries: Object.keys(registries).length,
  tags_by_kind: tagKinds, recipes: recipes.length, recipe_types: [...new Set(recipes.map((r) => JSON.parse(readFileSync(join(GEN, "data/minecraft/recipe", r), "utf8")).type))].sort(),
  loot_tables: loot.length, items_with_tool_component: itemsWithTool.length,
  item_components_present: [...new Set(Object.values(items).flatMap((v) => Object.keys(v.components)))].sort(),
  block_definition_types: new Set(Object.values(blocks).map((b) => b.definition.type)).size,
  contains: {
    registries_block_states_tags_recipes: true,
    hardness: false, outline_shapes: false, collision_shapes: false, burn_times: false,
    tool_rules: itemsWithTool.length > 0, mineable_tags: existsSync(join(tagDir, "block/mineable/pickaxe.json")),
    incorrect_for_tier_tags: existsSync(join(tagDir, "block/incorrect_for_wooden_tool.json")),
    item_to_block: false, requires_correct_tool_for_drops: false, menu_registry: !!registries["minecraft:menu"],
  },
};

// Tag resolution over the data generator's tags (nested #tags allowed).
const tagCache = new Map();
function tag(kind, id) {
  const key = `${kind}:${id}`;
  if (tagCache.has(key)) return tagCache.get(key);
  const p = join(tagDir, kind, `${strip(id)}.json`);
  const out = new Set();
  tagCache.set(key, out);
  if (!existsSync(p)) return out;
  for (const v of JSON.parse(readFileSync(p, "utf8")).values) {
    const s = typeof v === "string" ? v : v.id;
    if (s.startsWith("#")) for (const x of tag(kind, s.slice(1))) out.add(x);
    else out.add(s);
  }
  return out;
}
function inBlocks(spec, block) {
  if (Array.isArray(spec)) return spec.includes(block);
  if (spec.startsWith("#")) return tag("block", spec.slice(1)).has(block);
  return spec === block;
}
// Data-generator tool rule for (item, block): first matching rule, as vanilla's Tool component does.
function toolRule(item, block) {
  const t = items[item]?.components["minecraft:tool"];
  if (!t) return { speed: 1, correct: false };
  let speed = t.default_mining_speed ?? 1, correct = null;
  for (const r of t.rules) {
    if (!inBlocks(r.blocks, block)) continue;
    if (r.speed !== undefined && speed === (t.default_mining_speed ?? 1)) speed = r.speed;
    if (r.correct_for_drops !== undefined && correct === null) correct = r.correct_for_drops;
    if (r.speed !== undefined && correct !== null) break;
  }
  return { speed, correct: !!correct };
}

// ------------------------------------------------------------------ A2. minecraft-data coverage
const genBlocks = Object.keys(blocks).map(strip);
const mdBlocks = new Set(mcd.blocksArray.map((b) => b.name));
const stateMismatch = [];
for (const [name, b] of Object.entries(blocks)) {
  const m = mcd.blocksByName[strip(name)];
  if (!m) continue;
  const ids = b.states.map((s) => s.id);
  const def = b.states.find((s) => s.default)?.id;
  if (Math.min(...ids) !== m.minStateId || Math.max(...ids) !== m.maxStateId || def !== m.defaultState) stateMismatch.push(strip(name));
}
const hardness = mcd.blocksArray.filter((b) => b.hardness !== null && b.hardness !== undefined);
const shapes = mcd.blockCollisionShapes;
let shapeStates = 0, shapeMissing = [];
for (const [name, b] of Object.entries(blocks)) {
  const s = shapes.blocks[strip(name)];
  if (s === undefined) { shapeMissing.push(strip(name)); continue; }
  shapeStates += Array.isArray(s) ? Math.min(s.length, b.states.length) : b.states.length;
  if (Array.isArray(s) && s.length !== b.states.length) shapeMissing.push(`${strip(name)} (${s.length} of ${b.states.length} states)`);
}
// Tool speed and harvest agreement: minecraft-data (materials + harvestTools) vs the data generator.
const tools = itemsWithTool.map(([k]) => k).filter((k) => /_(pickaxe|axe|shovel|hoe|sword)$|^minecraft:shears$/.test(k));
let speedAgree = 0, speedDisagree = [], harvestAgree = 0, harvestDisagree = [];
for (const b of mcd.blocksArray) {
  const bid = `minecraft:${b.name}`;
  if (!blocks[bid] || b.hardness === null || b.hardness < 0) continue;
  for (const t of tools) {
    const gen = toolRule(t, bid);
    const tId = mcd.itemsByName[strip(t)].id;
    const mdSpeed = mcd.materials[b.material]?.[tId] ?? 1;
    if (Math.abs(mdSpeed - gen.speed) < 1e-6) speedAgree++; else speedDisagree.push(`${b.name}/${strip(t)}: mc-data ${mdSpeed}, datagen ${gen.speed}`);
    if (b.harvestTools) {
      const md = !!b.harvestTools[tId];
      if (md === gen.correct) harvestAgree++; else harvestDisagree.push(`${b.name}/${strip(t)}: mc-data ${md}, datagen ${gen.correct}`);
    }
  }
}
// Item <-> block: how many block items share the block's name (the only mapping either source gives).
const itemNames = Object.keys(items).map(strip);
const sameName = itemNames.filter((n) => mdBlocks.has(n));
const knownDifferent = { torch: ["torch", "wall_torch"], soul_torch: ["soul_torch", "soul_wall_torch"], redstone_torch: ["redstone_torch", "redstone_wall_torch"], wheat_seeds: ["wheat"], beetroot_seeds: ["beetroots"], carrot: ["carrots"], potato: ["potatoes"], melon_seeds: ["melon_stem"], pumpkin_seeds: ["pumpkin_stem"], redstone: ["redstone_wire"], string: ["tripwire"], sweet_berries: ["sweet_berry_bush"], cocoa_beans: ["cocoa"], glow_berries: ["cave_vines"], oak_sign: ["oak_sign", "oak_wall_sign"] };
const coverage = {
  minecraft_data_version: mcd.version.minecraftVersion, protocol: mcd.version.version,
  data_paths: JSON.parse(readFileSync(join(SPIKE, "node_modules/minecraft-data/minecraft-data/data/dataPaths.json"), "utf8")).pc[MC_VERSION],
  blocks: { datagen: genBlocks.length, minecraft_data: mdBlocks.size, missing_in_minecraft_data: genBlocks.filter((n) => !mdBlocks.has(n)), extra_in_minecraft_data: [...mdBlocks].filter((n) => !blocks[`minecraft:${n}`]), state_id_mismatches: stateMismatch.length },
  hardness: { blocks_with_hardness: hardness.length, unbreakable: hardness.filter((b) => b.hardness < 0).map((b) => b.name).length, null_hardness: mcd.blocksArray.filter((b) => b.hardness == null).map((b) => b.name) },
  tool_speed_vs_datagen: { agree: speedAgree, disagree: speedDisagree.length, examples: speedDisagree.slice(0, 15) },
  harvest_tools_vs_datagen: { agree: harvestAgree, disagree: harvestDisagree.length, examples: harvestDisagree.slice(0, 15), blocks_with_harvestTools: mcd.blocksArray.filter((b) => b.harvestTools).length },
  collision_shapes: { states_covered: shapeStates, states_total: states, blocks_missing_or_partial: shapeMissing.slice(0, 20), missing_count: shapeMissing.length },
  outline_shapes: { present: false },
  burn_times: { present: !!mcd.fuels, note: "no fuel data in minecraft-data 3.117.0 for pc 1.21.4 (items.json has id, name, displayName, stackSize only)" },
  item_block: { items: itemNames.length, items_named_like_a_block: sameName.length, known_items_placing_another_block: knownDifferent },
  recipes: { minecraft_data_result_items: Object.keys(mcd.recipes).length, datagen_files: recipes.length },
};

// Menu registry ids used by the spike backend vs the data generator.
const MENUS = ["generic_9x1", "generic_9x2", "generic_9x3", "generic_9x4", "generic_9x5", "generic_9x6", "generic_3x3", "crafter_3x3", "anvil", "beacon", "blast_furnace", "brewing_stand", "crafting", "enchantment", "furnace", "grindstone", "hopper", "lectern", "loom", "merchant", "shulker_box", "smithing", "smoker", "cartography_table", "stonecutter"];
const menuIds = Object.fromEntries(Object.entries(registries["minecraft:menu"].entries).map(([k, v]) => [strip(k), v.protocol_id]));
coverage.menu_registry_matches_backend = MENUS.every((m, i) => menuIds[m] === i);

coverage.tool_speed_vs_datagen.relevant = speedDisagree.filter((x) => (mcd.blocksByName[x.split("/")[0]]?.hardness ?? 0) > 0);
coverage.tool_speed_vs_datagen.relevant_count = coverage.tool_speed_vs_datagen.relevant.length;
coverage.tool_speed_vs_datagen.by_material = Object.entries(speedDisagree.reduce((m, x) => { const b = mcd.blocksByName[x.split("/")[0]]; const k = `${b.material} (hardness ${b.hardness > 0 ? ">0" : "0"})`; m[k] = (m[k] ?? 0) + 1; return m; }, {}));
save(exp, "inventory.json", { datagen: inventory, minecraft_data: coverage });
console.log(JSON.stringify({ inventory: { ...inventory, recipe_types: inventory.recipe_types.length, item_components_present: inventory.item_components_present.length }, coverage: { ...coverage, data_paths: undefined } }, null, 1));

export { toolRule, tag, blocks, items, mcd };
if (process.argv.includes("--offline")) process.exit(0);

// ================================================================== Part B: against the server
const { setup, teardown, sleep, scriptedProgram, verdict, until } = await import("../lib/harness.mjs");
const { digModel, matches } = await import("../lib/datagen.mjs");
const { predict, loadTable } = await import("../lib/placement.mjs");
const program = scriptedProgram();
const ctx = await setup(exp, program, { backendOpts: { flushMode: "deferred" }, rival: false, record: false });
const { server, backend, runtime, tally } = ctx;
const bot = backend.bot;
async function cmds(...cs) { for (const c of cs) server.cmd(c); await server.sync(); await sleep(400); }
await cmds("gamemode survival golem", "fill 30 -60 30 55 -55 55 air", "tp golem 40.5 -60 40.5 0 0", "clear golem", "effect clear golem");

// ---- B1. dig times (server delayed destroy) and harvest drops
const COMBOS_ALL = [["dirt", null], ["oak_log", null], ["oak_log", "stone_axe"], ["stone", null], ["stone", "wooden_pickaxe"], ["iron_ore", "wooden_pickaxe"], ["iron_ore", "stone_pickaxe"],
  ["gold_ore", "stone_pickaxe"], ["gold_ore", "iron_pickaxe"], ["diamond_ore", "stone_pickaxe"], ["diamond_ore", "iron_pickaxe"], ["obsidian", "diamond_pickaxe"], ["oak_leaves", "iron_hoe"], ["oak_leaves", null], ["sand", "wooden_shovel"], ["cobweb", "iron_sword"]];
const COMBOS = process.argv.includes("--quick") ? COMBOS_ALL.slice(0, 1) : COMBOS_ALL;
const EXPECT_DROP = { dirt: "dirt", oak_log: "oak_log", stone: "cobblestone", iron_ore: "raw_iron", gold_ore: "raw_gold", diamond_ore: "diamond", obsidian: "obsidian", sand: "sand", oak_leaves: null, cobweb: "string" };
const digRows = [];
for (const [block, tool] of COMBOS) {
  const pos = [41, -60, 41];
  await cmds("kill @e[type=item]", `setblock ${pos.join(" ")} ${block}`, tool ? `item replace entity golem hotbar.0 with ${tool}` : "item replace entity golem hotbar.0 with air", "tp golem 40.5 -60 40.5");
  await program.run(() => bot.setQuickBarSlot(0));
  await sleep(300);
  const model = digModel(tool, block);
  const mineflayerTicks = Math.ceil(bot.digTime(bot.blockAt(new Vec3(...pos))) / 50);
  const from = backend.blockLog.length;
  // Drops: item entities spawned near the block, or the expected item arriving in the inventory (the
  // bot stands next to the block and picks drops up after vanilla's 10-tick pickup delay).
  const spawned = [];
  const onSpawn = (e) => { if (e.name === "item" && e.position.distanceTo(new Vec3(pos[0] + 0.5, pos[1] + 0.5, pos[2] + 0.5)) < 2) spawned.push(e); };
  bot.on("entitySpawn", onSpawn);
  const invCount = (n) => bot.inventory.items().filter((i) => i.name === n).reduce((a, i) => a + i.count, 0);
  const invBefore = EXPECT_DROP[block] ? invCount(EXPECT_DROP[block]) : 0;
  let ts = null;
  await program.run(() => { // START then STOP at once: the server's delayed destroy breaks it on its own clock
    ts = backend.tickNo;
    bot._client.write("block_dig", { status: 0, location: new Vec3(...pos), face: 1, sequence: backend.nextSeq() });
    bot._client.write("block_dig", { status: 2, location: new Vec3(...pos), face: 1, sequence: backend.nextSeq() });
  });
  let broke = null;
  try { await until(() => (broke = backend.blockLog.slice(from).find((c) => c.pos.join() === pos.join() && /air/.test(c.value))), (model.serverDelayedTicks + 60) * 50, "break"); } catch { broke = null; }
  await sleep(1500);
  bot.removeListener("entitySpawn", onSpawn);
  const dropName = spawned.map((e) => e.getDroppedItem?.()?.name).find(Boolean) ?? (EXPECT_DROP[block] && invCount(EXPECT_DROP[block]) > invBefore ? EXPECT_DROP[block] : null);
  const observed = broke ? broke.tick - ts : null;
  digRows.push({ block, tool: tool ?? "hand", hardness: model.hardness, speed: model.speed, can_harvest_model: model.harvest, model_server_ticks: model.serverDelayedTicks, model_client_ticks: model.clientTicks,
    mineflayer_digTime_ticks: mineflayerTicks, observed_ticks: observed, observed_minus_model: observed == null ? null : observed - model.serverDelayedTicks,
    drop: dropName, harvest_observed: dropName != null, harvest_agrees: (dropName != null) === (model.harvest && EXPECT_DROP[block] !== null) });
  console.log(JSON.stringify(digRows.at(-1)));
}
await cmds("kill @e[type=item]");

// ---- B2. furnace burn times
const burnTable = JSON.parse(readFileSync(join(SPIKE, "data/burn-times.json"), "utf8")).entries;
const burnOf = (item) => { for (const [k, v] of Object.entries(burnTable)) if (matches("item", k, item)) return v; return null; };
const FUELS = ["oak_log", "birch_log", "oak_planks", "stick", "coal", "charcoal", "coal_block", "oak_sapling", "lava_bucket", "blaze_rod", "dried_kelp_block", "bamboo", "oak_slab", "wooden_pickaxe", "crafting_table", "scaffolding", "oak_stairs"];
const FURNACE = [43, -60, 41];
const burnRows = [];
let props = {};
bot._client.on("craft_progress_bar", (p) => { props[p.property] = p.value; });
for (const fuel of FUELS) {
  await cmds(`setblock ${FURNACE.join(" ")} air`, `setblock ${FURNACE.join(" ")} furnace`, `item replace block ${FURNACE.join(" ")} container.0 with raw_iron 1`, `item replace block ${FURNACE.join(" ")} container.1 with ${fuel} 1`);
  await sleep(300);
  props = {};
  const w = await bot.openBlock(bot.blockAt(new Vec3(...FURNACE)));
  await until(() => props[1] !== undefined, 3000, "lit duration").catch(() => {});
  await sleep(200);
  w.close();
  const expected = burnOf(fuel);
  burnRows.push({ fuel, expected_table: expected, observed_lit_duration: props[1] ?? null, agrees: props[1] === expected });
  console.log(JSON.stringify(burnRows.at(-1)));
}
await cmds(`setblock ${FURNACE.join(" ")} air`);

// ---- B3. placement table vs server
const table = loadTable();
const mcdShapes = mcd.blockCollisionShapes;
const fullCube = (name) => { const s = mcdShapes.blocks[name]; const id = Array.isArray(s) ? s[0] : s; const b = mcdShapes.shapes[id]; return b?.length === 1 && b[0].join() === "0,0,0,1,1,1"; };
const CASES = [
  { item: "oak_log", prep: ["setblock 41 -61 43 grass_block"], support: [41, -61, 43], face: "Up" },
  { item: "oak_log", prep: ["setblock 43 -60 43 stone"], support: [43, -60, 43], face: "North" },
  { item: "oak_log", prep: ["setblock 43 -60 43 stone"], support: [43, -60, 43], face: "West" },
  { item: "oak_sapling", prep: ["setblock 39 -61 42 grass_block"], support: [39, -61, 42], face: "Up" },
  { item: "oak_sapling", prep: ["setblock 39 -61 43 stone"], support: [39, -61, 43], face: "Up" },
  { item: "torch", prep: ["setblock 42 -60 43 stone"], support: [42, -60, 43], face: "Up" },
  { item: "torch", prep: ["setblock 42 -60 43 stone", "setblock 42 -60 42 air"], support: [42, -60, 43], face: "North" },
  { item: "torch", prep: ["setblock 41 -58 42 stone", "setblock 41 -59 42 air"], support: [41, -58, 42], face: "Down" },
  { item: "torch", prep: ["setblock 38 -60 41 oak_fence", "setblock 38 -59 41 air"], support: [38, -60, 41], face: "Up", note: "fence top: vanilla accepts (center support), v0.1 table refuses (not a full cube)" },
  { item: "wheat_seeds", prep: ["setblock 38 -61 42 farmland"], support: [38, -61, 42], face: "Up" },
  { item: "wheat_seeds", prep: ["setblock 38 -61 43 grass_block"], support: [38, -61, 43], face: "Up" },
  { item: "carrot", prep: ["setblock 38 -61 39 farmland"], support: [38, -61, 39], face: "Up" },
  { item: "oak_slab", prep: ["setblock 39 -61 39 grass_block"], support: [39, -61, 39], face: "Up" },
  { item: "oak_slab", prep: ["setblock 43 -60 39 stone"], support: [43, -60, 39], face: "West", cursor: [0, 0.75, 0.5] },
  { item: "oak_stairs", prep: ["setblock 41 -61 38 grass_block"], support: [41, -61, 38], face: "Up" },
  { item: "oak_stairs", prep: ["setblock 42 -61 38 grass_block"], support: [42, -61, 38], face: "Up", lookMode: "physics", note: "look left to the physics plugin: sent one flush after block_place" },
  { item: "chest", prep: ["setblock 39 -61 38 grass_block"], support: [39, -61, 38], face: "Up" },
  { item: "cobblestone", prep: ["setblock 43 -60 40 stone"], support: [43, -60, 40], face: "East" },
  { item: "dirt", prep: ["setblock 37 -61 40 grass_block"], support: [37, -61, 40], face: "Up" },
];
const placeRows = [];
const FV = { Down: [0, -1, 0], Up: [0, 1, 0], North: [0, 0, -1], South: [0, 0, 1], West: [-1, 0, 0], East: [1, 0, 0] };
for (const c of CASES) {
  const target = c.support.map((v, i) => v + FV[c.face][i]);
  await cmds("tp golem 40.5 -60 40.5 0 0", "fill 36 -60 36 45 -57 45 air", ...c.prep, `setblock ${target.join(" ")} air`, `item replace entity golem hotbar.0 with ${c.item} 4`);
  await program.run(() => bot.setQuickBarSlot(0));
  // A different facing before the placement so a stale rotation is visible.
  await program.run(() => { bot.look(Math.PI / 2, 0, true); });
  await sleep(400);
  const cursor = c.cursor ?? [0.5 + FV[c.face][0] * 0.5, 0.5 + FV[c.face][1] * 0.5, 0.5 + FV[c.face][2] * 0.5];
  const aim = new Vec3(c.support[0] + cursor[0], c.support[1] + cursor[1], c.support[2] + cursor[2]);
  const eye = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
  const d = aim.minus(eye);
  const yawDeg = (180 / Math.PI) * (Math.PI - Math.atan2(-d.x, -d.z));
  const sup = bot.blockAt(new Vec3(...c.support))?.name;
  const below = bot.blockAt(new Vec3(target[0], target[1] - 1, target[2]))?.name;
  const pred = predict(table, c.item, { face: c.face, supportFull: fullCube(sup), below, cursorY: cursor[1], yawDeg });
  backend.opts.lookMode = c.lookMode ?? "direct";
  backend.instrument.nextActionOverrides = c.cursor ? { cursorOverride: c.cursor } : null;
  const id = await program.run((cx) => cx.start("place_block", { support: c.support, face: c.face }));
  await verdict(runtime, id, 10000).catch(() => null);
  await sleep(400);
  backend.opts.lookMode = "direct";
  const sid = bot.world.getBlockStateId(new Vec3(...target));
  const server = /air$/.test(backend.codec.stateString(sid)) ? null : backend.codec.stateString(sid);
  const predicted = pred.refused ? null : pred.state;
  placeRows.push({ item: c.item, support: sup, face: c.face, look: c.lookMode ?? "direct", rule: pred.rule, predicted: predicted ?? "refused", server: server ?? "refused (air)", agrees: predicted === server, note: c.note ?? null });
  console.log(JSON.stringify(placeRows.at(-1)));
}

save(exp, "summary.json", {
  experiment: "E6 version data", dig: digRows, burn: burnRows, placement: placeRows,
  dig_summary: { combos: digRows.length, observed_minus_model: digRows.map((r) => r.observed_minus_model), mineflayer_vs_model_mismatch: digRows.filter((r) => r.mineflayer_digTime_ticks !== r.model_client_ticks).map((r) => `${r.block}/${r.tool}: mineflayer ${r.mineflayer_digTime_ticks}, model ${r.model_client_ticks}`), harvest_agree: digRows.filter((r) => r.harvest_agrees).length },
  burn_summary: { fuels: burnRows.length, agree: burnRows.filter((r) => r.agrees).length },
  placement_summary: { cases: placeRows.length, agree: placeRows.filter((r) => r.agrees).length },
  validation: tally.summary(),
});
await teardown(ctx);
process.exit(0);
