// Evaluator for the draft placement table (data/placement-table.json): predicts the block state that
// clicking `face` of a support with `item` produces at the target cell, or null when vanilla refuses.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GEN, matches } from "./datagen.mjs";
import { SPIKE } from "./server.mjs";

const ns = (s) => (s.includes(":") ? s : `minecraft:${s}`);
let blocks = null;
const genBlocks = () => (blocks ??= JSON.parse(readFileSync(join(GEN, "reports/blocks.json"), "utf8")));
export const loadTable = () => JSON.parse(readFileSync(join(SPIKE, "data/placement-table.json"), "utf8"));

const AXIS = { Up: "y", Down: "y", North: "z", South: "z", East: "x", West: "x" };
const HORIZONTAL = ["south", "west", "north", "east"];
const OPPOSITE = { north: "south", south: "north", east: "west", west: "east" };
const facingFromYaw = (yawDeg) => HORIZONTAL[Math.floor(((yawDeg % 360) + 360 + 45) / 90) % 4];

function itemBlock(rule, item) {
  if (Array.isArray(rule.items)) {
    if (!(rule.items.includes("*") || matches("item", rule.items, item))) return null;
    return { block: ns(item) };
  }
  const v = rule.items[ns(item)];
  if (!v) return null;
  return { block: v, choices: Array.isArray(v) ? v : null };
}

function stateString(block, props) {
  const keys = Object.keys(props).sort();
  return block + (keys.length ? `[${keys.map((k) => `${k}=${props[k]}`).join(",")}]` : "");
}

// ctx: { face, supportFull, below, cursorY, yawDeg }
export function predict(table, item, ctx) {
  for (const rule of table.rules) {
    const ib = itemBlock(rule, item);
    if (!ib) continue;
    const side = ["North", "South", "East", "West"].includes(ctx.face);
    const f = rule.faces[ctx.face] !== undefined ? rule.faces[ctx.face] : side && rule.faces.side !== undefined ? rule.faces.side : rule.faces.any;
    if (f === null || f === undefined) return { refused: true, rule: rule.id };
    if (f.support === "sturdy_face" && !ctx.supportFull) return { refused: true, rule: rule.id };
    if (f.support === "on" && !matches("block", f.on, ctx.below)) return { refused: true, rule: rule.id };
    const block = ib.choices ? ib.choices[f.block] : ib.block;
    const def = genBlocks()[block];
    if (!def) return { refused: true, rule: rule.id, why: `${block} is not a block` };
    const props = { ...(def.states.find((s) => s.default)?.properties ?? {}) };
    for (const [k, v] of Object.entries(f.state ?? {})) {
      if (v === "face_axis") props[k] = AXIS[ctx.face];
      else if (v === "face") props[k] = ctx.face.toLowerCase();
      else if (v === "cursor_y") props[k] = ctx.cursorY > 0.5 ? "top" : "bottom";
      else if (v === "player_facing") props[k] = facingFromYaw(ctx.yawDeg);
      else if (v === "player_facing_opposite") props[k] = OPPOSITE[facingFromYaw(ctx.yawDeg)];
      else props[k] = v;
    }
    return { state: stateString(block, props), rule: rule.id };
  }
  return { refused: true, rule: null };
}
