// §17.3 Goal -> mineflayer-pathfinder goals, and §18.4 Movements configuration for pathfind.
import pathfinderPkg from "mineflayer-pathfinder";
import { Vec3 } from "vec3";

const { goals, Movements } = pathfinderPkg;

// Goal.Clear(pos): the bot's bounding box (0.6 x 1.8, centred in its node's column) does not
// intersect the cell pos. No pathfinder counterpart exists (§18.4), so this is a custom goal.
export class GoalClear extends goals.Goal {
  constructor(pos) { super(); this.pos = pos; }
  intersects(node) {
    const [px, py, pz] = this.pos;
    return node.x === px && node.z === pz && (py === node.y || py === node.y + 1);
  }
  heuristic(node) { return this.intersects(node) ? 1 : 0; }
  isEnd(node) { return !this.intersects(node); }
}

// Exact live test of Goal.Clear against the bot's actual (unfloored) bounding box.
export function clearReached(bot, [px, py, pz]) {
  const p = bot.entity.position;
  const hw = 0.3;
  return !(p.x + hw > px && p.x - hw < px + 1 && p.z + hw > pz && p.z - hw < pz + 1 && p.y + 1.8 > py && p.y < py + 1);
}

export function makeGoal(bot, g) {
  const [tag, a] = Object.entries(g)[0];
  switch (tag) {
    case "At": return new goals.GoalBlock(...a.pos);
    case "Near": return new goals.GoalNear(...a.pos, a.radius);
    case "XZ": return new goals.GoalXZ(a.x, a.z);
    case "Y": return new goals.GoalY(a.y);
    case "InReach": return new goals.GoalLookAtBlock(new Vec3(...a.pos), bot.world, { reach: 4.5 });
    case "NearEntity": return new goals.GoalFollow(bot.entities[a.target.entity], a.radius);
    case "Away": return new goals.GoalInvert(new goals.GoalNear(...a.center.map(Math.floor), a.radius));
    case "AnyOf": return new goals.GoalCompositeAny(a.goals.map((x) => makeGoal(bot, x)));
    case "AllOf": return new goals.GoalCompositeAll(a.goals.map((x) => makeGoal(bot, x)));
    case "Clear": return new GoalClear(a.pos);
    default: throw new Error(`unknown goal ${tag}`);
  }
}

// §18.4: digging off, empty scaffolding list, opts.avoid as an exclusion area.
export function makeMovements(bot, opts = {}) {
  const m = new Movements(bot);
  m.canDig = false;
  m.scafoldingBlocks = [];
  m.allow1by1towers = false;
  m.allowParkour = true;
  m.allowSprinting = true;
  if (opts.avoid) {
    const { min, max } = opts.avoid;
    const inside = (p) => p.x >= min[0] && p.x <= max[0] && p.y >= min[1] && p.y <= max[1] && p.z >= min[2] && p.z <= max[2];
    // A move whose feet or head block lies in the region costs more than the pathfinder's 100 cap.
    m.exclusionAreasStep.push((block) => (inside(block.position) ? 1000 : 0));
  }
  return m;
}
