// §14.1 world-key encoding for the spike backend: canonical key strings (contracts world.schema.json)
// and value conversion from Mineflayer / raw protocol data.
import prismarineBlock from "prismarine-block";
import prismarineItem from "prismarine-item";

export const FACES = ["Down", "Up", "North", "South", "West", "East"]; // protocol direction order 0..5
export const FACE_VEC = { Down: [0, -1, 0], Up: [0, 1, 0], North: [0, 0, -1], South: [0, 0, 1], West: [-1, 0, 0], East: [1, 0, 0] };

export const blockKey = ([x, y, z]) => `block(${x},${y},${z})`;
export const invSlotKey = (i) => `inventory.slot(${i})`;
export const winSlotKey = (i) => `window.slot(${i})`;
export const entityKey = (id, member) => `entity(${id}).${member}`;
export const offset = (p, face) => { const d = FACE_VEC[face]; return [p[0] + d[0], p[1] + d[1], p[2] + d[2]]; };
export const round = (x, n = 4) => Math.round(x * 10 ** n) / 10 ** n;

export function makeCodec(registry) {
  const Block = prismarineBlock(registry);
  const Item = prismarineItem(registry);
  const stateCache = new Map();
  const stats = { componentsDropped: 0 };

  function stateString(stateId) {
    let s = stateCache.get(stateId);
    if (s !== undefined) return s;
    const b = Block.fromStateId(stateId, 0);
    const props = b.getProperties();
    const keys = Object.keys(props).sort();
    s = `minecraft:${b.name}` + (keys.length ? `[${keys.map((k) => `${k}=${String(props[k]).toLowerCase()}`).join(",")}]` : "");
    stateCache.set(stateId, s);
    return s;
  }

  // ItemStack per wire.schema.json. Components: the spike maps only `damage`; everything else in the
  // network component list is dropped (counted) because vanilla's codec JSON is not available here.
  function stack(item) {
    if (!item || item.count <= 0 || item.type == null || item.name === "air") return null;
    const components = {};
    for (const c of item.components ?? []) {
      if (c.type === "damage") components["minecraft:damage"] = c.data;
      else stats.componentsDropped++;
    }
    return { item: `minecraft:${item.name}`, count: item.count, components };
  }

  const fromNotch = (slot) => Item.fromNotch(slot);
  const toNotch = (item) => Item.toNotch(item);
  const itemByName = (name) => registry.itemsByName[name.replace(/^minecraft:/, "")];
  const blockByName = (name) => registry.blocksByName[name.replace(/^minecraft:/, "")];
  const defaultState = (blockName) => stateString(blockByName(blockName).defaultState);
  const newItem = (name, count) => new Item(itemByName(name).id, count);
  return { Block, Item, stateString, stack, fromNotch, toNotch, itemByName, blockByName, defaultState, newItem, stats };
}

export const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
