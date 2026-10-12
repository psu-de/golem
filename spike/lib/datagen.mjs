// Readers over the vanilla data generator output (server/<version>/generated): tags, tool rules,
// and the dig-time / can_harvest computations built from them plus minecraft-data hardness.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import mcDataLoader from "minecraft-data";
import { SPIKE, MC_VERSION } from "./server.mjs";

export const GEN = join(SPIKE, "server", MC_VERSION, "generated");
const strip = (s) => s.replace(/^minecraft:/, "");
const ns = (s) => (s.includes(":") ? s : `minecraft:${s}`);
let items = null;
const tagCache = new Map();

export function genItems() { return (items ??= JSON.parse(readFileSync(join(GEN, "reports/items.json"), "utf8"))); }

export function tag(kind, id) {
  const key = `${kind}:${id}`;
  if (tagCache.has(key)) return tagCache.get(key);
  const out = new Set();
  tagCache.set(key, out);
  const p = join(GEN, "data/minecraft/tags", kind, `${strip(id.replace(/^#/, ""))}.json`);
  if (!existsSync(p)) return out;
  for (const v of JSON.parse(readFileSync(p, "utf8")).values) {
    const s = typeof v === "string" ? v : v.id;
    if (s.startsWith("#")) for (const x of tag(kind, s)) out.add(x);
    else out.add(s);
  }
  return out;
}

// True when id matches spec: an id, "#tag", or an array of those.
export function matches(kind, spec, id) {
  if (Array.isArray(spec)) return spec.some((s) => matches(kind, s, id));
  if (spec.startsWith("#")) return tag(kind, spec).has(ns(id));
  return ns(spec) === ns(id);
}

// The data generator's minecraft:tool rule for (item, block): vanilla takes the first rule with a
// speed for the speed and the first rule with correct_for_drops for harvesting.
export function toolRule(item, block) {
  const t = item ? genItems()[ns(item)]?.components["minecraft:tool"] : null;
  if (!t) return { speed: 1, correct: false, isTool: false };
  let speed = null, correct = null;
  for (const r of t.rules) {
    if (!matches("block", r.blocks, block)) continue;
    if (r.speed !== undefined && speed === null) speed = r.speed;
    if (r.correct_for_drops !== undefined && correct === null) correct = r.correct_for_drops;
  }
  return { speed: speed ?? t.default_mining_speed ?? 1, correct: !!correct, isTool: true };
}

// §17.2 can_harvest / dig_time for a survival player on the ground, not in water, no effects or
// enchantments. requiresCorrectToolForDrops comes from minecraft-data (a block has harvestTools
// exactly when it requires a correct tool); hardness from minecraft-data.
export function digModel(item, block) {
  const mcd = mcDataLoader(MC_VERSION);
  const b = mcd.blocksByName[strip(block)];
  const rule = toolRule(item, block);
  const requires = !!b.harvestTools;
  const harvest = !requires || rule.correct;
  if (b.hardness < 0) return { hardness: b.hardness, speed: rule.speed, harvest, perTick: 0, clientTicks: Infinity, serverDelayedTicks: Infinity };
  if (b.hardness === 0) return { hardness: 0, speed: rule.speed, harvest, perTick: Infinity, clientTicks: 0, serverDelayedTicks: 0 };
  const perTick = rule.speed / b.hardness / (harvest ? 30 : 100);
  return {
    hardness: b.hardness, speed: rule.speed, harvest, requiresTool: requires, perTick,
    clientTicks: perTick >= 1 ? 0 : Math.ceil(1 / perTick),
    // server delayed destroy (STOP sent early): breaks at the first tick i with (i + 1) * perTick >= 1
    serverDelayedTicks: perTick >= 1 ? 0 : Math.ceil(1 / perTick) - 1,
  };
}
