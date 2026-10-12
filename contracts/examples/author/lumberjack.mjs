#!/usr/bin/env node
// Hand-written IR of the Lumberjack bot (spec §12, §19), everything it reaches: the woodcutting
// module (§19.1), the std composites goto, mine, collect, open, deposit and their callees (equip,
// consume, fight, free_slot, next_drop, feet_of), the primitives as extern tasks, and the four
// survival activities auto_eat, defend, stay_afloat and auto_respawn (§17.8).
//
// Every state, transition and expression below is written by hand from the source in
// examples/lumberjack/ (verbatim copies of the spec's code blocks). The helpers in lib.mjs only
// locate source text for spans, keep node shapes uniform and print stable JSON.
//
//   node examples/author/lumberjack.mjs          write examples/Lumberjack.golem-ir.json
//   node examples/author/lumberjack.mjs --check  fail if the committed file differs
//
// Lowering choices the spec does not make are proposed decisions in CONTRACTS.md (PD-40 onward)
// and are marked "PD-n" where they are applied.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { A, Chart, E, P, S, fctor, ftr, loadSources, pat, sortKeys, sourceHash, stringify, tr } from "./lib.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT = join(ROOT, "examples", "Lumberjack.golem-ir.json");
const [LJ, WOOD, CORE, FILT, PRIM, SURV, WIN, PRE] = loadSources(join(ROOT, "examples", "lumberjack"), [
  "src/lumberjack.golem",
  "src/woodcutting.golem",
  "std/golem/core.golem",
  "std/golem/filters.golem",
  "std/golem/prim.golem",
  "std/golem/survival.golem",
  "std/golem/windows.golem",
  "std/prelude.golem",
]);
const SOURCES = [LJ, WOOD, CORE, FILT, PRIM, SURV, WIN, PRE];

// ---------- names ----------

const CONTAINER = "golem.windows.Container";
const ANYKIND = "golem.windows.AnyKind";
const PLAYERINV = "golem.windows.PlayerInventory";
const WC = `Window<${CONTAINER}>`;
const WA = `Window<${ANYKIND}>`;
const WP = `Window<${PLAYERINV}>`;
const wm = (kind, member) => `golem.windows.Window<${kind}>.${member}`;

const T = {
  chop: "woodcutting.chop_trees",
  stash: "woodcutting.stash_logs",
  gotoGoal: "golem.core.goto(Goal,Int,PathOpts)",
  gotoEntity: "golem.core.goto(Entity,Float)",
  mine: "golem.core.mine",
  equip: "golem.core.equip",
  collect: "golem.core.collect",
  consume: "golem.core.consume",
  fight: "golem.core.fight",
  open: `golem.core.open<${CONTAINER}>`,
  deposit: `golem.core.deposit<${CONTAINER}>`,
  pathfind: "golem.prim.pathfind",
  dig: "golem.prim.dig",
  interact: "golem.prim.interact(BlockPos,Face)",
  attack: "golem.prim.attack",
  holdUse: "golem.prim.hold_use",
  holdJump: "golem.prim.hold_jump",
  selectHotbar: "golem.prim.select_hotbar",
  swapHands: "golem.prim.swap_hands",
  swapHotbar: `golem.prim.swap_hotbar<${PLAYERINV}>`,
  pickUp: `golem.prim.pick_up<${CONTAINER}>`,
  put: `golem.prim.put<${CONTAINER}>`,
  quickMove: `golem.prim.quick_move<${CONTAINER}>`,
  closeC: `golem.prim.close<${CONTAINER}>`,
  closeA: `golem.prim.close<${ANYKIND}>`,
  respawn: "golem.prim.respawn",
};
const FL = {
  NoPath: "golem.prim.NoPath",
  OutOfReach: "golem.prim.OutOfReach",
  EntityGone: "golem.prim.EntityGone",
  NotBreakable: "golem.prim.NotBreakable",
  BlockChanged: "golem.prim.BlockChanged",
  CannotPut: "golem.prim.CannotPut",
  NoRoom: "golem.prim.NoRoom",
  CursorNotEmpty: "golem.prim.CursorNotEmpty",
  Missing: "golem.core.Missing",
  WrongTool: "golem.core.WrongTool",
  NotHungry: "golem.core.NotHungry",
  ScreenBusy: "golem.core.ScreenBusy",
  NotOpened: "golem.core.NotOpened",
  WrongKind: "golem.core.WrongKind",
  NoTrees: "woodcutting.NoTrees",
  NotEnoughLogs: "woodcutting.NotEnoughLogs",
};

// ---------- extern fns (runtime-implemented; §17.2, §17.4, §17.5, §8, prelude) ----------

const fns = {};
function extern(name, params, result, { module = null, view = true, span = null, typeArgs = [] } = {}) {
  fns[name] = {
    module,
    name: name.replace(/\(.*$/, "").replace(/<[^>]*>$/, "").split(".").pop(),
    type_args: typeArgs,
    params: params.map(([n, t]) => ({ name: n, type: t })),
    result,
    extern: true,
    view_dependent: view,
    body: null,
    span,
  };
}
const self = (t) => ["self", t];
for (const [m, t] of [
  ["dead", "Bool"], ["food", "Int"], ["held", "ItemStack?"], ["offhand", "ItemStack?"], ["held_slot", "Int"],
  ["cursor", "ItemStack?"], ["using_item", "Bool"], ["in_water", "Bool"], ["oxygen", "Int"], ["path_progress", "Int"],
  ["inventory", "Inventory"], ["inventory_window", WP], ["window", `${WA}?`],
]) extern(`Bot.${m}`, [self("Bot")], t);
extern("Bot.in_reach(BlockPos)", [self("Bot"), ["pos", "BlockPos"]], "Bool");
extern("Bot.in_reach(Entity)", [self("Bot"), ["e", "Entity"]], "Bool");
extern("Bot.aim_face", [self("Bot"), ["pos", "BlockPos"]], "Face?");
extern("Bot.can_harvest", [self("Bot"), ["pos", "BlockPos"]], "Bool");
extern("Bot.dig_time", [self("Bot"), ["pos", "BlockPos"]], "Duration");
extern("World.block", [self("World"), ["p", "BlockPos"]], "BlockState?");
extern("World.blocks", [self("World"), ["f", "BlockFilter"], ["area", "Region"]], "List<BlockPos>");
extern("World.entities", [self("World"), ["f", "EntityFilter"]], "List<Entity>");
extern("World.nearest", [self("World"), ["f", "EntityFilter"]], "Entity?");
extern("Entity.alive", [self("Entity")], "Bool");
extern("Entity.id", [self("Entity")], "Int");
extern("Entity.pos", [self("Entity")], "Vec3");
extern("Entity.item", [self("Entity")], "ItemStack?");
extern("Goal.reached", [self("Goal")], "Bool");
extern("List<BlockPos>.first", [self("List<BlockPos>")], "BlockPos?", { view: false });
extern("Inventory.count", [self("Inventory"), ["f", "ItemFilter"]], "Int", { view: false });
extern("ItemFilter.of", [["t", "ItemType"]], "ItemFilter", { view: false });
extern("floor", [["f", "Float"]], "Int", { view: false });
const winDecl = (text) => WIN.at(text).span;
const winMembers = {
  open: [[], "Bool", "pub extern fn open(self) -> Bool"],
  size: [[], "Int", "pub extern fn size(self) -> Int"],
  slot: [[["i", "Int"]], "ItemStack?", "pub extern fn slot(self, i: Int) -> ItemStack?"],
  player_slots: [[], "Range", "pub extern fn player_slots(self) -> SlotRange"],
  hotbar: [[], "Range", "pub extern fn hotbar(self) -> SlotRange"],
  accepts: [[["slot", "Int"], ["s", "ItemStack"]], "Bool", "pub extern fn accepts(self, slot: Int, s: ItemStack) -> Bool"],
  can_quick_move: [[["slot", "Int"]], "Bool", "pub extern fn can_quick_move(self, slot: Int) -> Bool"],
  find: [[["f", "ItemFilter"]], "Int?", "pub extern fn find(self, f: ItemFilter) -> Int?"],
  container: [[], "Range", "pub extern fn container(self) -> SlotRange"],
};
for (const [kind, members] of [
  [CONTAINER, ["open", "size", "slot", "player_slots", "accepts", "can_quick_move", "container"]],
  [PLAYERINV, ["open", "slot", "hotbar", "find"]],
  [ANYKIND, ["open"]],
]) {
  for (const m of members) {
    const [ps, r, decl] = winMembers[m];
    extern(wm(kind, m), [self(`Window<${kind}>`), ...ps], r, { module: "golem.windows", view: true, span: winDecl(decl) });
  }
}
extern(`${wm(ANYKIND, "cast")}<${CONTAINER}>`, [self(WA)], `${WC}?`, {
  module: "golem.windows",
  span: winDecl("pub extern fn cast<J: WindowKind>(self) -> Window<J>?"),
  typeArgs: [CONTAINER],
});
extern("golem.filters.within", [["d", "Float"]], "EntityFilter", { module: "golem.filters", view: false, span: FILT.at("pub extern fn within(d: Float) -> EntityFilter").span });
extern("golem.filters.breakable", [], "BlockFilter", { module: "golem.filters", view: false, span: FILT.at("pub extern fn breakable() -> BlockFilter").span });
extern("golem.core.best_tool", [["pos", "BlockPos"], ["harvest", "Bool"]], "ItemType?", { module: "golem.core", span: CORE.at("pub extern fn best_tool(pos: BlockPos, harvest: Bool) -> ItemType?").span });

// ---------- expression shorthands ----------

// bot.<member> as a property call.
const botProp = (k, member, type) => E.call(k, `Bot.${member}`, type, "property", E.bot(k), []);
// bot.inventory.count(<filter>) where k covers the whole call.
const invCount = (k, filter) =>
  E.call(k, "Inventory.count", "Int", "method", botProp(k.sub("bot.inventory"), "inventory", "Inventory"), [filter]);
const logsItem = (k) => E.lit(k, "ItemFilter", "tag", { tag: "minecraft:logs" });
const int = (k, n) => E.lit(k, "Int", "int", n);
const float = (k, x) => E.lit(k, "Float", "float", x);
const bool = (k, b) => E.lit(k, "Bool", "bool", b);
const none = (k, type) => E.lit(k, type, "none", null);
const constLit = (k, type, value) => E.lit(k, type, "const", value);
const local = (k, name, type) => E.local(k, name, type);
const param = (k, name, type) => E.param(k, name, type);
const gt0 = (k, c) => E.bin(k, ">", local(k, c, "Int"), int(k, 0), "Bool");
// Defaults filled at call sites point at the default expression in the callee's declaration (PD-42).
const DEF = {
  gotoAttempts: CORE.at("attempts: Int = 3").sub("3"),
  gotoOpts: CORE.at("opts: PathOpts = PathOpts()").sub("PathOpts()"),
  pathfindLimit: PRIM.at("pub extern task pathfind(goal: Goal, limit: Duration = 2min").sub("2min"),
  mineHarvest: CORE.at("pub task mine(pos: BlockPos, harvest: Bool = true)").sub("true"),
  equipHand: CORE.at("pub task equip(item: ItemFilter, hand: Hand = Hand.Main)").sub("Hand.Main"),
  depositExact: CORE.at("pub task deposit(w: Window<impl HasContainer>, item: ItemFilter, n: Int, exact: Bool = false)").sub("false"),
  holdUseHand: PRIM.at("pub ongoing extern task hold_use(hand: Hand = Hand.Main)").sub("Hand.Main"),
  pickUpHalf: PRIM.at("pick_up<K: WindowKind>(w: Window<K>, slot: Int, half: Bool = false)").sub("false"),
  putOne: PRIM.at("put<K: WindowKind>(w: Window<K>, slot: Int, one: Bool = false)").sub("false"),
};
const defaultArgs = {
  gotoAttempts: () => constLit(DEF.gotoAttempts, "Int", 3),
  gotoOpts: () => constLit(DEF.gotoOpts, "PathOpts", { avoid: null }),
  pathfindLimit: () => constLit(DEF.pathfindLimit, "Duration", 2400),
  mineHarvest: () => constLit(DEF.mineHarvest, "Bool", true),
  equipHand: () => constLit(DEF.equipHand, "Hand", "Main"),
  depositExact: () => constLit(DEF.depositExact, "Bool", false),
  holdUseHand: () => constLit(DEF.holdUseHand, "Hand", "Main"),
  pickUpHalf: () => constLit(DEF.pickUpHalf, "Bool", false),
  putOne: () => constLit(DEF.putOne, "Bool", false),
};

// ---------- tasks ----------

const tasks = {};
const RESOURCES = ["legs", "head", "hands", "stance", "inventory", "screen"];
const resources = (...rs) => RESOURCES.filter((r) => rs.includes(r));

function clauses(c = {}) {
  return {
    requires: c.requires ?? [],
    invariants: c.invariants ?? [],
    maintains: c.maintains ?? [],
    ensures: c.ensures ?? [],
    progress: c.progress ?? null,
    timeout: c.timeout ?? null,
    stalls_after: null,
    fails: c.fails ?? [],
    attaches: [],
  };
}
// A clause line "@requires <expr> [else fail F(...)]"; k covers the line, x builds the expression.
const req = (k, expr, elseFail = null, implicit = null, text = null) => ({
  expr,
  else_fail: elseFail,
  implicit,
  text: text ?? k.text.replace(/^@requires /, "").replace(/ else fail .*$/, ""),
  span: k.span,
});
const inv = (k, expr, elseFail) => ({ expr, else_fail: elseFail, text: k.text.replace(/^@invariant /, "").replace(/ else fail .*$/, ""), span: k.span });
const ens = (k, expr) => ({ expr, text: k.text.replace(/^@ensures /, ""), span: k.span });
const timeout = (k, duration) => ({ duration, text: k.text.replace(/^@timeout /, ""), span: k.span });
const lineAt = (anchor, prefix) => anchor.line(prefix);

// §9.6 implicit requires !bot.dead, failing Unmet(task, "alive"); its nodes point at the declaration (PD-41).
function alive(decl) {
  const b = { kind: "ambient", type: "Bot", which: "bot", span: decl.span };
  const dead = { kind: "call", type: "Bool", target: "Bot.dead", form: "property", receiver: b, args: [], span: decl.span };
  return req(decl, { kind: "unary", type: "Bool", op: "!", operand: dead, target: "!(Bool)", span: decl.span }, null, "alive", "alive");
}
// §17.1 implicit requires w.open else fail WindowClosed(task).
function windowOpen(decl, kind, taskName) {
  const w = { kind: "param", type: `Window<${kind}>`, name: "w", span: decl.span };
  const open = { kind: "call", type: "Bool", target: wm(kind, "open"), form: "property", receiver: w, args: [], span: decl.span };
  const name = { kind: "lit", type: "String", form: "const", value: taskName, text: taskName, span: decl.span };
  return req(decl, open, fctor("WindowClosed", [name]), "window_open", "w.open");
}

function primitive(name, o) {
  const decl = o.decl;
  tasks[name] = {
    kind: "extern",
    module: "golem.prim",
    name: o.simple,
    type_args: o.typeArgs ?? [],
    params: o.params,
    result: "Unit",
    pub: true,
    modifiers: o.modifiers,
    irreversible: o.modifiers.includes("irreversible"),
    primitive: o.primitive,
    class: o.class,
    confirm: o.confirm,
    clauses: clauses(o.clauses),
    olds: o.olds ?? [],
    uses: o.uses,
    failures: [],
    bounded: o.class !== "ongoing",
    may_pin: o.mayPin ?? false,
    chart: null,
    span: decl.span,
    _calls: [],
  };
}

function composite(name, o) {
  tasks[name] = {
    kind: "composite",
    module: o.module,
    name: o.simple,
    type_args: o.typeArgs ?? [],
    params: o.params,
    result: o.result ?? "Unit",
    pub: true,
    modifiers: o.modifiers ?? [],
    irreversible: false,
    clauses: clauses(o.clauses),
    olds: o.olds ?? [],
    uses: [],
    failures: [],
    bounded: true,
    may_pin: false,
    chart: o.chart.toJSON(),
    span: o.decl.span,
    _calls: o.calls,
  };
}

// ---------- golem.prim (§17.9) ----------

{
  const blk = PRIM.at("// durative; confirmed by state + settle (decision 93)");
  const decl = blk.next("pub extern task pathfind(goal: Goal, limit: Duration = 2min, opts: PathOpts = PathOpts())");
  const e = lineAt(blk, "@ensures goal.reached");
  const p = lineAt(blk, "@progress bot.path_progress increasing within 5s");
  const t = lineAt(blk, "@timeout limit");
  primitive(T.pathfind, {
    decl,
    simple: "pathfind",
    primitive: "pathfind",
    class: "durative",
    confirm: ["settle", "state"],
    modifiers: ["extern"],
    uses: resources("legs", "head"),
    params: [
      { name: "goal", type: "Goal" },
      { name: "limit", type: "Duration", default: 2400 },
      { name: "opts", type: "PathOpts", default: { avoid: null } },
    ],
    clauses: {
      requires: [alive(decl)],
      ensures: [ens(e, E.call(e.sub("goal.reached"), "Goal.reached", "Bool", "property", param(e.sub("goal"), "goal", "Goal"), []))],
      progress: {
        metric: botProp(p.sub("bot.path_progress"), "path_progress", "Int"),
        direction: "increasing",
        by: null,
        within: E.lit(p.sub("5s"), "Duration", "duration", 100),
        text: "bot.path_progress increasing within 5s",
        span: p.span,
      },
      timeout: timeout(t, param(t.sub("limit"), "limit", "Duration")),
      fails: [FL.NoPath],
    },
  });
}
{
  const blk = PRIM.at("// durative; confirmed by ack + state (§9.10)");
  const decl = blk.next("pub extern task dig(pos: BlockPos)");
  const r1 = lineAt(blk, "@requires world.block(pos) matches breakable()");
  const r2 = lineAt(blk, "@requires bot.in_reach(pos)");
  const i1 = lineAt(blk, "@invariant world.block(pos) == old(world.block(pos))");
  const e1 = lineAt(blk, "@ensures world.block(pos) matches CLEARED");
  const t1 = lineAt(blk, "@timeout bot.dig_time(pos) + 2s");
  const block = (k) => E.call(k, "World.block", "BlockState?", "method", E.world(k), [param(k.sub("pos"), "pos", "BlockPos")]);
  const oldK = i1.sub("old(world.block(pos))");
  primitive(T.dig, {
    decl,
    simple: "dig",
    primitive: "dig",
    class: "durative",
    confirm: ["ack", "state"],
    modifiers: ["extern"],
    uses: resources("hands", "head"),
    params: [{ name: "pos", type: "BlockPos" }],
    olds: [block(oldK.sub("world.block(pos)"))],
    clauses: {
      requires: [
        alive(decl),
        req(r1, E.bin(r1.sub("world.block(pos) matches breakable()"), "matches", block(r1.sub("world.block(pos)")),
          E.call(r1.sub("breakable()"), "golem.filters.breakable", "BlockFilter", "free", null, []), "Bool"),
          fctor(FL.NotBreakable, [param(r1.sub("NotBreakable(pos)").sub("pos"), "pos", "BlockPos")])),
        req(r2, E.call(r2.sub("bot.in_reach(pos)"), "Bot.in_reach(BlockPos)", "Bool", "method", E.bot(r2), [param(r2.sub("pos"), "pos", "BlockPos")]),
          fctor(FL.OutOfReach, [param(r2.sub("OutOfReach(pos)").sub("pos"), "pos", "BlockPos")])),
      ],
      invariants: [
        inv(i1, E.bin(i1.sub("world.block(pos) == old(world.block(pos))"), "==", block(i1.sub("world.block(pos)")), E.old(oldK, 0, "BlockState?"), "Bool"),
          fctor(FL.BlockChanged, [param(i1.sub("BlockChanged(pos)").sub("pos"), "pos", "BlockPos")])),
      ],
      ensures: [ens(e1, E.bin(e1.sub("world.block(pos) matches CLEARED"), "matches", block(e1.sub("world.block(pos)")), E.cnst(e1.sub("CLEARED"), "golem.filters.CLEARED", "BlockFilter"), "Bool"))],
      timeout: timeout(t1, E.bin(t1.sub("bot.dig_time(pos) + 2s"), "+",
        E.call(t1.sub("bot.dig_time(pos)"), "Bot.dig_time", "Duration", "method", E.bot(t1), [param(t1.sub("pos"), "pos", "BlockPos")]),
        E.lit(t1.sub("2s"), "Duration", "duration", 40), "Duration")),
    },
  });
}
const timeout1min = (blk) => {
  const t = lineAt(blk, "@timeout 1min");
  return timeout(t, E.lit(t.sub("1min"), "Duration", "duration", 1200));
};
{
  const blk = PRIM.at("// instant; confirmed by ack\n@uses hands, head");
  const decl = blk.next("pub unchecked extern task interact(pos: BlockPos, face: Face)");
  const r = lineAt(blk, "@requires bot.in_reach(pos)");
  primitive(T.interact, {
    decl,
    simple: "interact",
    primitive: "interact(BlockPos,Face)",
    class: "instant",
    confirm: ["ack"],
    modifiers: ["unchecked", "extern"],
    uses: resources("hands", "head"),
    params: [{ name: "pos", type: "BlockPos" }, { name: "face", type: "Face" }],
    clauses: {
      requires: [alive(decl), req(r, E.call(r.sub("bot.in_reach(pos)"), "Bot.in_reach(BlockPos)", "Bool", "method", E.bot(r), [param(r.sub("pos"), "pos", "BlockPos")]),
        fctor(FL.OutOfReach, [param(r.sub("OutOfReach(pos)").sub("pos"), "pos", "BlockPos")]))],
      timeout: timeout1min(blk),
    },
  });
}
{
  const top = PRIM.at("pub unchecked extern task interact(target: Entity)").next("// instant; confirmed when sent");
  const head = top.next("pub unchecked extern task attack(target: Entity)");
  const r1 = lineAt(top, "@requires target.alive");
  const r2 = lineAt(top, "@requires bot.in_reach(target)");
  const tgt = (k) => param(k.sub("target"), "target", "Entity");
  primitive(T.attack, {
    decl: head,
    simple: "attack",
    primitive: "attack",
    class: "instant",
    confirm: ["sent"],
    modifiers: ["unchecked", "extern"],
    uses: resources("hands", "head"),
    params: [{ name: "target", type: "Entity" }],
    clauses: {
      requires: [
        alive(head),
        req(r1, E.call(r1.sub("target.alive"), "Entity.alive", "Bool", "property", tgt(r1), []),
          fctor(FL.EntityGone, [E.call(r1.sub("target.id"), "Entity.id", "Int", "property", tgt(r1.sub("target.id")), [])])),
        req(r2, E.call(r2.sub("bot.in_reach(target)"), "Bot.in_reach(Entity)", "Bool", "method", E.bot(r2), [tgt(r2.sub("in_reach(target)"))]),
          fctor(FL.OutOfReach, [E.call(r2.sub("feet_of(target)"), "golem.prim.feet_of", "BlockPos", "free", null, [tgt(r2.sub("feet_of(target)"))])])),
      ],
      timeout: timeout1min(top),
    },
  });
}
{
  const blk = PRIM.at("// ongoing; confirmed by settle\n@uses hands");
  const decl = blk.next("pub ongoing extern task hold_use(hand: Hand = Hand.Main)");
  const m = lineAt(blk, "@maintains bot.using_item tolerate 10t");
  primitive(T.holdUse, {
    decl,
    simple: "hold_use",
    primitive: "hold_use",
    class: "ongoing",
    confirm: ["settle"],
    modifiers: ["ongoing", "extern"],
    uses: resources("hands"),
    params: [{ name: "hand", type: "Hand", default: "Main" }],
    clauses: {
      requires: [alive(decl)],
      maintains: [{
        expr: botProp(m.sub("bot.using_item"), "using_item", "Bool"),
        tolerate: E.lit(m.sub("10t"), "Duration", "duration", 10),
        else_fail: null,
        text: "bot.using_item tolerate 10t",
        span: m.span,
      }],
    },
  });
}
{
  const decl = PRIM.at("pub ongoing extern task hold_jump()");
  primitive(T.holdJump, {
    decl,
    simple: "hold_jump",
    primitive: "hold_jump",
    class: "ongoing",
    confirm: ["sent"],
    modifiers: ["ongoing", "extern"],
    uses: resources("legs"),
    params: [],
    clauses: { requires: [alive(decl)] },
  });
}
{
  const blk = PRIM.at("// instant; confirmed by settle\n@uses hands\n@ensures bot.held == old(bot.offhand)");
  const decl = blk.next("pub extern task swap_hands()");
  const e = lineAt(blk, "@ensures");
  const o1 = e.sub("old(bot.offhand)");
  const o2 = e.sub("old(bot.held)");
  primitive(T.swapHands, {
    decl,
    simple: "swap_hands",
    primitive: "swap_hands",
    class: "instant",
    confirm: ["settle"],
    modifiers: ["extern"],
    uses: resources("hands"),
    params: [],
    olds: [botProp(o1.sub("bot.offhand"), "offhand", "ItemStack?"), botProp(o2.sub("bot.held"), "held", "ItemStack?")],
    clauses: {
      requires: [alive(decl)],
      ensures: [ens(e, E.logic(e.sub("bot.held == old(bot.offhand) && bot.offhand == old(bot.held)"), "&&",
        E.bin(e.sub("bot.held == old(bot.offhand)"), "==", botProp(e.sub("bot.held"), "held", "ItemStack?"), E.old(o1, 0, "ItemStack?"), "Bool"),
        E.bin(e.sub("bot.offhand == old(bot.held)"), "==", botProp(e.sub("bot.offhand =="), "offhand", "ItemStack?"), E.old(o2, 1, "ItemStack?"), "Bool")))],
      timeout: timeout1min(blk),
    },
  });
}
{
  const blk = PRIM.at("// instant; confirmed by settle\n@uses hands\n@requires slot in 0..9");
  const decl = blk.next("pub extern task select_hotbar(slot: Int)");
  const r = lineAt(blk, "@requires slot in 0..9");
  const e = lineAt(blk, "@ensures bot.held_slot == slot");
  primitive(T.selectHotbar, {
    decl,
    simple: "select_hotbar",
    primitive: "select_hotbar",
    class: "instant",
    confirm: ["settle"],
    modifiers: ["extern"],
    uses: resources("hands"),
    params: [{ name: "slot", type: "Int" }],
    clauses: {
      requires: [alive(decl), req(r, E.bin(r.sub("slot in 0..9"), "in", param(r.sub("slot"), "slot", "Int"),
        E.bin(r.sub("0..9"), "..", int(r.sub("0"), 0), int(r.sub("9"), 9), "Range"), "Bool"))],
      ensures: [ens(e, E.bin(e.sub("bot.held_slot == slot"), "==", botProp(e.sub("bot.held_slot"), "held_slot", "Int"), param(e.sub("slot", 1), "slot", "Int"), "Bool"))],
      timeout: timeout1min(blk),
    },
  });
}
// Window primitives are monomorphized per window kind; k is the kind, n the instance name.
function windowPrim(kind, n, o) {
  const decl = o.decl;
  primitive(n, {
    ...o,
    typeArgs: [kind],
    modifiers: o.modifiers ?? ["extern"],
    uses: resources("inventory", "screen"),
    clauses: { ...o.clauses, requires: [alive(decl), ...(o.windowOpen === false ? [] : [windowOpen(decl, kind, n)]), ...(o.clauses.requires ?? [])] },
  });
}
const wParam = (k, kind) => param(k.sub("w"), "w", `Window<${kind}>`);
const wSlot = (k, kind, idx) => E.call(k, wm(kind, "slot"), "ItemStack?", "method", wParam(k, kind), [idx]);
const countIn = (k, arg) => E.call(k, "golem.prim.count_in", "Int", "free", null, [arg]);
{
  const kind = PLAYERINV;
  const blk = PRIM.at("// instant; confirmed by settle\n@uses inventory, screen\n@requires hotbar in 0..9");
  const decl = blk.next("pub extern task swap_hotbar<K: WindowKind>(w: Window<K>, slot: Int, hotbar: Int)");
  const r = lineAt(blk, "@requires hotbar in 0..9");
  const e = lineAt(blk, "@ensures");
  const hot = (k) => E.bin(k, "+", E.field(k.sub("w.hotbar.start"), E.call(k.sub("w.hotbar"), wm(kind, "hotbar"), "Range", "property", wParam(k, kind), []), "start", "Int"),
    param(k.sub("hotbar", 1), "hotbar", "Int"), "Int");
  const o1 = e.sub("old(w.slot(w.hotbar.start + hotbar))");
  const o2 = e.sub("old(w.slot(slot))");
  const slotP = (k) => param(k.sub("slot"), "slot", "Int");
  const lhs1 = e.sub("w.slot(slot)");
  const lhs2 = e.sub("w.slot(w.hotbar.start + hotbar) == old(w.slot(slot))").sub("w.slot(w.hotbar.start + hotbar)");
  windowPrim(kind, T.swapHotbar, {
    decl,
    simple: "swap_hotbar",
    primitive: "swap_hotbar",
    class: "instant",
    confirm: ["settle"],
    params: [{ name: "w", type: WP }, { name: "slot", type: "Int" }, { name: "hotbar", type: "Int" }],
    olds: [
      wSlot(o1.sub("w.slot(w.hotbar.start + hotbar)"), kind, hot(o1.sub("w.hotbar.start + hotbar"))),
      wSlot(o2.sub("w.slot(slot)"), kind, slotP(o2.sub("(slot)"))),
    ],
    clauses: {
      requires: [req(r, E.bin(r.sub("hotbar in 0..9"), "in", param(r.sub("hotbar"), "hotbar", "Int"),
        E.bin(r.sub("0..9"), "..", int(r.sub("0"), 0), int(r.sub("9"), 9), "Range"), "Bool"))],
      ensures: [ens(e, E.logic(e.sub("w.slot(slot) == old(w.slot(w.hotbar.start + hotbar)) && w.slot(w.hotbar.start + hotbar) == old(w.slot(slot))"), "&&",
        E.bin(e.sub("w.slot(slot) == old(w.slot(w.hotbar.start + hotbar))"), "==", wSlot(lhs1, kind, slotP(lhs1.sub("(slot)"))), E.old(o1, 0, "ItemStack?"), "Bool"),
        E.bin(e.sub("w.slot(w.hotbar.start + hotbar) == old(w.slot(slot))"), "==", wSlot(lhs2, kind, hot(lhs2.sub("w.hotbar.start + hotbar"))), E.old(o2, 1, "ItemStack?"), "Bool")))],
      timeout: timeout1min(blk),
    },
  });
}
{
  const kind = CONTAINER;
  const blk = PRIM.at("// ---------- windows (implicit: requires w.open else WindowClosed) ----------");
  const decl = blk.next("pub extern task pick_up<K: WindowKind>(w: Window<K>, slot: Int, half: Bool = false)");
  const r1 = lineAt(blk, "@requires bot.cursor == none");
  const r2 = lineAt(blk, "@requires w.slot(slot) != none");
  const e1 = lineAt(blk, "@ensures bot.cursor?.item == old(w.slot(slot)?.item)");
  const e2 = lineAt(blk, "@ensures count_in(bot.cursor) == (if half");
  const slotP = (k) => param(k.sub("slot"), "slot", "Int");
  const slotOf = (k) => wSlot(k.sub("w.slot(slot)"), kind, slotP(k.sub("(slot)")));
  const itemOpt = (k, value, bind) => E.opt(k, value, bind, E.field(k, local(k, bind, "ItemStack"), "item", "ItemType"), "ItemType?");
  const oA = e1.sub("old(w.slot(slot)?.item)");
  const oB = e2.sub("old(count_in(w.slot(slot)))");
  const oC = e2.sub("old(count_in(w.slot(slot)))", 1);
  const countOfSlot = (k) => countIn(k.sub("count_in(w.slot(slot))"), slotOf(k.sub("w.slot(slot)")));
  windowPrim(kind, T.pickUp, {
    decl,
    simple: "pick_up",
    primitive: "pick_up",
    class: "instant",
    confirm: ["settle"],
    mayPin: true,
    params: [{ name: "w", type: WC }, { name: "slot", type: "Int" }, { name: "half", type: "Bool", default: false }],
    olds: [itemOpt(oA.sub("w.slot(slot)?.item"), slotOf(oA), "$o1"), countOfSlot(oB), countOfSlot(oC)],
    clauses: {
      requires: [
        req(r1, E.bin(r1.sub("bot.cursor == none"), "==", botProp(r1.sub("bot.cursor"), "cursor", "ItemStack?"), none(r1.sub("none"), "ItemStack?"), "Bool")),
        req(r2, E.bin(r2.sub("w.slot(slot) != none"), "!=", slotOf(r2), none(r2.sub("none"), "ItemStack?"), "Bool")),
      ],
      ensures: [
        ens(e1, E.bin(e1.sub("bot.cursor?.item == old(w.slot(slot)?.item)"), "==", itemOpt(e1.sub("bot.cursor?.item"), botProp(e1.sub("bot.cursor"), "cursor", "ItemStack?"), "$o0"), E.old(oA, 0, "ItemType?"), "Bool")),
        ens(e2, E.bin(e2.sub(e2.text.replace("@ensures ", "")), "==", countIn(e2.sub("count_in(bot.cursor)"), botProp(e2.sub("bot.cursor"), "cursor", "ItemStack?")),
          E.ifx(e2.sub("if half then (old(count_in(w.slot(slot))) + 1) / 2 else old(count_in(w.slot(slot)))"),
            param(e2.sub("half"), "half", "Bool"),
            E.bin(e2.sub("(old(count_in(w.slot(slot))) + 1) / 2"), "/",
              E.bin(e2.sub("old(count_in(w.slot(slot))) + 1"), "+", E.old(oB, 1, "Int"), int(e2.sub("1)").sub("1"), 1), "Int"),
              int(e2.sub("/ 2").sub("2"), 2), "Int"),
            E.old(oC, 2, "Int"), "Int"), "Bool")),
      ],
      timeout: timeout1min(blk),
    },
  });
}
{
  const kind = CONTAINER;
  const blk = PRIM.at("// instant; confirmed by settle; never swaps (decision 15)");
  const decl = blk.next("pub extern task put<K: WindowKind>(w: Window<K>, slot: Int, one: Bool = false)");
  const r1 = lineAt(blk, "@requires bot.cursor != none");
  const r2 = lineAt(blk, "@requires match bot.cursor");
  const e1 = lineAt(blk, "@ensures count_in(w.slot(slot)) - old(count_in(w.slot(slot)))");
  const e2 = lineAt(blk, "@ensures !one ||");
  const slotP = (k) => param(k.sub("slot"), "slot", "Int");
  const slotCount = (k) => countIn(k, wSlot(k.sub("w.slot(slot)"), kind, slotP(k.sub("(slot)"))));
  const cursorCount = (k) => countIn(k, botProp(k.sub("bot.cursor"), "cursor", "ItemStack?"));
  const oA = e1.sub("old(count_in(w.slot(slot)))");
  const oB = e1.sub("old(count_in(bot.cursor))");
  const oC = e2.sub("old(count_in(bot.cursor))");
  const m = r2.sub("match bot.cursor { none => false, c => w.accepts(slot, c) }");
  windowPrim(kind, T.put, {
    decl,
    simple: "put",
    primitive: "put",
    class: "instant",
    confirm: ["settle"],
    mayPin: true,
    params: [{ name: "w", type: WC }, { name: "slot", type: "Int" }, { name: "one", type: "Bool", default: false }],
    olds: [slotCount(oA.sub("count_in(w.slot(slot))")), cursorCount(oB.sub("count_in(bot.cursor)")), cursorCount(oC.sub("count_in(bot.cursor)"))],
    clauses: {
      requires: [
        req(r1, E.bin(r1.sub("bot.cursor != none"), "!=", botProp(r1.sub("bot.cursor"), "cursor", "ItemStack?"), none(r1.sub("none"), "ItemStack?"), "Bool")),
        req(r2, E.match(m, botProp(m.sub("bot.cursor"), "cursor", "ItemStack?"), [
          { pattern: P.none(m.sub("none"), "ItemStack?"), guard: null, value: bool(m.sub("false"), false) },
          { pattern: P.bind(m.sub("c =>").sub("c"), "c", "ItemStack"), guard: null,
            value: E.call(m.sub("w.accepts(slot, c)"), wm(kind, "accepts"), "Bool", "method", wParam(m.sub("w.accepts"), kind),
              [slotP(m.sub("(slot, c)")), local(m.sub(", c)").sub("c"), "c", "ItemStack")]) },
        ], "Bool"), fctor(FL.CannotPut, [slotP(r2.sub("CannotPut(slot)"))])),
      ],
      ensures: [
        ens(e1, E.bin(e1.sub(e1.text.replace("@ensures ", "")), "==",
          E.bin(e1.sub("count_in(w.slot(slot)) - old(count_in(w.slot(slot)))"), "-", slotCount(e1.sub("count_in(w.slot(slot))")), E.old(oA, 0, "Int"), "Int"),
          E.bin(e1.sub("old(count_in(bot.cursor)) - count_in(bot.cursor)"), "-", E.old(oB, 1, "Int"), cursorCount(e1.sub("count_in(bot.cursor)", 1)), "Int"), "Bool")),
        ens(e2, E.logic(e2.sub(e2.text.replace("@ensures ", "")), "||", E.un(e2.sub("!one"), "!", param(e2.sub("one"), "one", "Bool"), "Bool"),
          E.bin(e2.sub("old(count_in(bot.cursor)) - count_in(bot.cursor) == 1"), "==",
            E.bin(e2.sub("old(count_in(bot.cursor)) - count_in(bot.cursor)"), "-", E.old(oC, 2, "Int"), cursorCount(e2.sub("count_in(bot.cursor)", 1)), "Int"),
            int(e2.sub("== 1").sub("1"), 1), "Bool"))),
      ],
      timeout: timeout1min(blk),
    },
  });
}
{
  const kind = CONTAINER;
  const blk = PRIM.at("// instant; confirmed by settle\n@uses inventory, screen\n@requires w.slot(slot) != none\n@requires w.can_quick_move");
  const decl = blk.next("pub extern task quick_move<K: WindowKind>(w: Window<K>, slot: Int)");
  const r1 = lineAt(blk, "@requires w.slot(slot) != none");
  const r2 = lineAt(blk, "@requires w.can_quick_move(slot)");
  const e1 = lineAt(blk, "@ensures count_in(w.slot(slot)) <");
  const e2 = lineAt(blk, "@ensures window_total(w) == old(window_total(w))");
  const slotP = (k) => param(k.sub("slot"), "slot", "Int");
  const slotCount = (k) => countIn(k, wSlot(k.sub("w.slot(slot)"), kind, slotP(k.sub("(slot)"))));
  const total = (k) => E.call(k, `golem.prim.window_total<${kind}>`, "Int", "free", null, [wParam(k.sub("(w)"), kind)]);
  const oA = e1.sub("old(count_in(w.slot(slot)))");
  const oB = e2.sub("old(window_total(w))");
  windowPrim(kind, T.quickMove, {
    decl,
    simple: "quick_move",
    primitive: "quick_move",
    class: "instant",
    confirm: ["settle"],
    params: [{ name: "w", type: WC }, { name: "slot", type: "Int" }],
    olds: [slotCount(oA.sub("count_in(w.slot(slot))")), total(oB.sub("window_total(w)"))],
    clauses: {
      requires: [
        req(r1, E.bin(r1.sub("w.slot(slot) != none"), "!=", wSlot(r1.sub("w.slot(slot)"), kind, slotP(r1.sub("(slot)"))), none(r1.sub("none"), "ItemStack?"), "Bool")),
        req(r2, E.call(r2.sub("w.can_quick_move(slot)"), wm(kind, "can_quick_move"), "Bool", "method", wParam(r2, kind), [slotP(r2.sub("(slot)"))]),
          fctor(FL.NoRoom, [slotP(r2.sub("NoRoom(slot)"))])),
      ],
      ensures: [
        ens(e1, E.bin(e1.sub("count_in(w.slot(slot)) < old(count_in(w.slot(slot)))"), "<", slotCount(e1.sub("count_in(w.slot(slot))")), E.old(oA, 0, "Int"), "Bool")),
        ens(e2, E.bin(e2.sub("window_total(w) == old(window_total(w))"), "==", total(e2.sub("window_total(w)")), E.old(oB, 1, "Int"), "Bool")),
      ],
      timeout: timeout1min(blk),
    },
  });
}
for (const [kind, name] of [[CONTAINER, T.closeC], [ANYKIND, T.closeA]]) {
  const blk = PRIM.at("// instant; confirmed when sent; no implicit `requires w.open`");
  const decl = blk.next("pub extern task close(w: Window<impl Screen>)");
  const r = lineAt(blk, "@requires !w.open || bot.cursor == none");
  const e = lineAt(blk, "@ensures !w.open");
  const open = (k) => E.call(k.sub("w.open"), wm(kind, "open"), "Bool", "property", wParam(k, kind), []);
  windowPrim(kind, name, {
    decl,
    simple: "close",
    primitive: "close",
    class: "instant",
    confirm: ["sent"],
    windowOpen: false,
    params: [{ name: "w", type: `Window<${kind}>` }],
    clauses: {
      requires: [req(r, E.logic(r.sub("!w.open || bot.cursor == none"), "||", E.un(r.sub("!w.open"), "!", open(r), "Bool"),
        E.bin(r.sub("bot.cursor == none"), "==", botProp(r.sub("bot.cursor"), "cursor", "ItemStack?"), none(r.sub("none"), "ItemStack?"), "Bool")),
        fctor(FL.CursorNotEmpty, []))],
      ensures: [ens(e, E.un(e.sub("!w.open"), "!", open(e), "Bool"))],
      timeout: timeout1min(blk),
    },
  });
}
{
  const blk = PRIM.at("// instant; confirmed by state; the only primitive without the implicit");
  const decl = blk.next("pub extern task respawn()");
  const r = lineAt(blk, "@requires bot.dead");
  const e = lineAt(blk, "@ensures !bot.dead");
  primitive(T.respawn, {
    decl,
    simple: "respawn",
    primitive: "respawn",
    class: "instant",
    confirm: ["state"],
    modifiers: ["extern"],
    uses: [],
    params: [],
    clauses: {
      requires: [req(r, botProp(r.sub("bot.dead"), "dead", "Bool"))],
      ensures: [ens(e, E.un(e.sub("!bot.dead"), "!", botProp(e.sub("bot.dead"), "dead", "Bool"), "Bool"))],
      timeout: timeout1min(blk),
    },
  });
}

// ---------- fns with bodies ----------

function fn(name, o) {
  fns[name] = {
    module: o.module,
    name: o.simple,
    type_args: o.typeArgs ?? [],
    params: o.params.map(([n, t]) => ({ name: n, type: t })),
    result: o.result,
    extern: false,
    view_dependent: o.view,
    body: o.body,
    span: o.decl.span,
  };
}
{
  // woodcutting.next_log: fn next_log(area: Region) -> BlockPos? = world.blocks(#minecraft:logs, area).first
  const d = WOOD.at("fn next_log(area: Region) -> BlockPos? = world.blocks(#minecraft:logs, area).first");
  const x = d.sub("world.blocks(#minecraft:logs, area).first");
  const blocks = d.sub("world.blocks(#minecraft:logs, area)");
  fn("woodcutting.next_log", {
    module: "woodcutting", simple: "next_log", decl: d, params: [["area", "Region"]], result: "BlockPos?", view: true,
    body: { expr: E.call(x, "List<BlockPos>.first", "BlockPos?", "property",
      E.call(blocks, "World.blocks", "List<BlockPos>", "method", E.world(blocks),
        [E.lit(blocks.sub("#minecraft:logs"), "BlockFilter", "tag", { tag: "minecraft:logs" }), param(blocks.sub("area"), "area", "Region")]), []) },
  });
}
function feetOf(src, module) {
  const d = src.at("fn feet_of(e: Entity) -> BlockPos = BlockPos(floor(e.pos.x), floor(e.pos.y), floor(e.pos.z))");
  const b = d.sub("BlockPos(floor(e.pos.x), floor(e.pos.y), floor(e.pos.z))");
  const axis = (a) => {
    const k = b.sub(`floor(e.pos.${a})`);
    const f = k.sub(`e.pos.${a}`);
    return E.call(k, "floor", "Int", "free", null, [E.field(f, E.call(f.sub("e.pos"), "Entity.pos", "Vec3", "property", param(f.sub("e"), "e", "Entity"), []), a, "Float")]);
  };
  fn(`${module}.feet_of`, {
    module, simple: "feet_of", decl: d, params: [["e", "Entity"]], result: "BlockPos", view: true,
    body: { expr: E.struct(b, "BlockPos", ["x", "y", "z"].map(axis)) },
  });
}
feetOf(CORE, "golem.core");
feetOf(PRIM, "golem.prim");
{
  const d = PRIM.at("fn count_in(s: ItemStack?) -> Int = s?.count ?? 0");
  const x = d.sub("s?.count ?? 0");
  const o = x.sub("s?.count");
  fn("golem.prim.count_in", {
    module: "golem.prim", simple: "count_in", decl: d, params: [["s", "ItemStack?"]], result: "Int", view: false,
    body: { expr: E.coalesce(x, E.opt(o, param(o.sub("s"), "s", "ItemStack?"), "$o0", E.field(o, local(o.sub("s"), "$o0", "ItemStack"), "count", "Int"), "Int?"), int(x.sub("0"), 0), "Int") },
  });
}
{
  const d = PRIM.at("fn window_total<K: WindowKind>(w: Window<K>) -> Int {");
  const s0 = d.next("var n = 0");
  const s1 = d.next("for i in 0..w.size {");
  const s2 = d.next("n += count_in(w.slot(i))");
  const s3 = d.next("return n");
  const r = s1.sub("0..w.size");
  const slotI = s2.sub("w.slot(i)");
  fn(`golem.prim.window_total<${CONTAINER}>`, {
    module: "golem.prim", simple: "window_total", typeArgs: [CONTAINER], decl: d, params: [["w", WC]], result: "Int", view: true,
    body: { block: [
      S.bind(s0, "n", int(s0.sub("0"), 0), true),
      S.for(s1, "i", E.bin(r, "..", int(r.sub("0"), 0), E.call(r.sub("w.size"), wm(CONTAINER, "size"), "Int", "property", wParam(r, CONTAINER), []), "Range"), [
        S.assign(s2, "n", "+=", countIn(s2.sub("count_in(w.slot(i))"), wSlot(slotI, CONTAINER, local(slotI.sub("i"), "i", "Int")))),
      ]),
      S.ret(s3, local(s3.sub("n"), "n", "Int")),
    ] },
  });
}
{
  const d = CORE.at("fn free_slot<K: WindowKind>(w: Window<K>, r: SlotRange) -> Int? {");
  const s0 = d.next("for i in r {");
  const s1 = d.next("if w.slot(i) == none {");
  const s2 = d.next("return i");
  const s3 = d.next("return none");
  const c = s1.sub("w.slot(i) == none");
  fn(`golem.core.free_slot<${CONTAINER}>`, {
    module: "golem.core", simple: "free_slot", typeArgs: [CONTAINER], decl: d, params: [["w", WC], ["r", "Range"]], result: "Int?", view: true,
    body: { block: [
      S.for(s0, "i", param(s0.sub("r"), "r", "Range"), [
        S.if(s1, [{ cond: E.bin(c, "==", wSlot(c.sub("w.slot(i)"), CONTAINER, local(c.sub("(i)").sub("i"), "i", "Int")), none(c.sub("none"), "ItemStack?"), "Bool"),
          body: [S.ret(s2, local(s2.sub("i"), "i", "Int"))] }]),
      ]),
      S.ret(s3, none(s3.sub("none"), "Int?")),
    ] },
  });
}
{
  const d = CORE.at("fn next_drop(f: ItemFilter, radius: Float) -> Entity? {");
  const s0 = d.next("for e in world.entities(minecraft:item & within(radius)) {");
  const s1 = d.next("if e.item matches f {");
  const s2 = d.next("return e");
  const s3 = d.next("return none");
  const q = s0.sub("world.entities(minecraft:item & within(radius))");
  const flt = q.sub("minecraft:item & within(radius)");
  const c = s1.sub("e.item matches f");
  fn("golem.core.next_drop", {
    module: "golem.core", simple: "next_drop", decl: d, params: [["f", "ItemFilter"], ["radius", "Float"]], result: "Entity?", view: true,
    body: { block: [
      S.for(s0, "e", E.call(q, "World.entities", "List<Entity>", "method", E.world(q), [
        E.bin(flt, "&", E.lit(flt.sub("minecraft:item"), "EntityFilter", "resource", { entity: "minecraft:item" }),
          E.call(flt.sub("within(radius)"), "golem.filters.within", "EntityFilter", "free", null, [param(flt.sub("radius"), "radius", "Float")]), "EntityFilter"),
      ]), [
        S.if(s1, [{ cond: E.bin(c, "matches", E.call(c.sub("e.item"), "Entity.item", "ItemStack?", "property", local(c.sub("e"), "e", "Entity"), []), param(c.sub("f", 0).next(" f").sub("f"), "f", "ItemFilter"), "Bool"),
          body: [S.ret(s2, local(s2.sub("e"), "e", "Entity"))] }]),
      ]),
      S.ret(s3, none(s3.sub("none"), "Entity?")),
    ] },
  });
}
{
  const d = SURV.at("fn threat(f: EntityFilter, d: Float) -> Entity? = world.nearest(f & within(d))");
  const x = d.sub("world.nearest(f & within(d))");
  const a = x.sub("f & within(d)");
  fn("golem.survival.threat", {
    module: "golem.survival", simple: "threat", decl: d, params: [["f", "EntityFilter"], ["d", "Float"]], result: "Entity?", view: true,
    body: { expr: E.call(x, "World.nearest", "Entity?", "method", E.world(x), [
      E.bin(a, "&", param(a.sub("f"), "f", "EntityFilter"), E.call(a.sub("within(d)"), "golem.filters.within", "EntityFilter", "free", null, [param(a.sub("(d)").sub("d"), "d", "Float")]), "EntityFilter"),
    ]) },
  });
}

// ---------- composite tasks ----------
// Each chart lists its states by id. Straight-line statements become actions on the transitions
// that reach the next state; branching statements and loop heads become choice states (PD-40).

// goto(Goal,Int,PathOpts) is called from several places; the default arguments are filled in (PD-42).
const gotoGoalArgs = (goalNode) => [goalNode, defaultArgs.gotoAttempts(), defaultArgs.gotoOpts()];
const variantGoal = (k, variant, fields) => E.variant(k, "Goal", variant, fields);

{
  // woodcutting.chop_trees (§19.1)
  const d = WOOD.at("pub task chop_trees(area: Region, target: Int) -> Int {");
  const rq = WOOD.at("@requires target > 0");
  const en = WOOD.at("@ensures result >= target");
  const s0 = d.next("repeat 4 * target {");
  const b0 = d.next("let have = bot.inventory.count(#minecraft:logs)");
  const b1 = d.next("if have >= target {");
  const b1r = d.next("return have");
  const b2 = d.next("let log = next_log(area) else fail NoTrees(area)");
  const b3 = d.next("mine(log) catch {");
  const b3arm = d.next("Interfered(_, _) | Rejected(_, _) => { continue }");
  const b4 = d.next("collect(#minecraft:logs, 6.0) catch { _ => 0 }");
  const b5 = d.next("notify LogMined(log)");
  const s1 = d.next("fail NotEnoughLogs(bot.inventory.count(#minecraft:logs))");
  const c = new Chart(T.chop, { $c0: "Int", $t0: "BlockPos?", have: "Int", log: "BlockPos" });
  const notify = A.notify(b5, "woodcutting.LogMined", [local(b5.sub("log"), "log", "BlockPos")]);
  const four = s0.sub("4 * target");
  c.add("", {
    kind: "scope",
    defers: false,
    initial: tr(null, [A.counterInit(s0, "$c0", E.bin(four, "*", int(four.sub("4"), 4), param(four.sub("target"), "target", "Int"), "Int"), 0)], c.id("0")),
    span: d.span,
  });
  c.add("0", {
    kind: "choice",
    transitions: [
      tr(gt0(s0, "$c0"), [A.counterStep(s0, "$c0"), A.bind(b0, "have", invCount(b0.sub("bot.inventory.count(#minecraft:logs)"), logsItem(b0.sub("#minecraft:logs"))))], c.id("0.repeat.body.1")),
      tr(null, [A.fail(s1, FL.NotEnoughLogs, [invCount(s1.sub("bot.inventory.count(#minecraft:logs)"), logsItem(s1.sub("#minecraft:logs")))])], null),
    ],
    span: s0.span,
  });
  c.add("0.repeat.body.1", {
    kind: "choice",
    transitions: [
      tr(E.bin(b1.sub("have >= target"), ">=", local(b1.sub("have"), "have", "Int"), param(b1.sub("target"), "target", "Int"), "Bool"),
        [A.ret(b1r, local(b1r.sub("have"), "have", "Int"))], c.id("end")),
      tr(null, [A.bind(b2, "$t0", E.call(b2.sub("next_log(area)"), "woodcutting.next_log", "BlockPos?", "free", null, [param(b2.sub("area"), "area", "Region")]))], c.id("0.repeat.body.2")),
    ],
    span: b1.span,
  });
  c.add("0.repeat.body.2", {
    kind: "choice",
    transitions: [
      tr(E.isNone(b2, local(b2, "$t0", "BlockPos?")), [A.fail(b2.sub("fail NoTrees(area)"), FL.NoTrees, [param(b2.sub("NoTrees(area)").sub("area"), "area", "Region")])], null),
      tr(null, [A.bind(b2, "log", E.unwrap(b2, local(b2, "$t0", "BlockPos?"), "BlockPos"))], c.id("0.repeat.body.3")),
    ],
    span: b2.span,
  });
  c.add("0.repeat.body.3", {
    kind: "try",
    form: "postfix",
    initial: tr(null, [], c.id("0.repeat.body.3.catch.call")),
    catches: [ftr([pat("Interfered", [null, null]), pat("Rejected", [null, null])], null, [], c.id("0"))],
    span: d.next("mine(log) catch {\n            Interfered(_, _) | Rejected(_, _) => { continue }\n        }").span,
  });
  c.add("0.repeat.body.3.catch.call", {
    kind: "composite_call",
    parent: c.id("0.repeat.body.3"),
    callee: T.mine,
    args: [local(b3.sub("log"), "log", "BlockPos"), defaultArgs.mineHarvest()],
    result: null,
    mode: "sync",
    deferred: false,
    next: tr(null, [], c.id("0.repeat.body.4")),
    span: b3.sub("mine(log)").span,
  });
  c.add("0.repeat.body.4", {
    kind: "try",
    form: "postfix",
    initial: tr(null, [], c.id("0.repeat.body.4.catch.call")),
    catches: [ftr([pat("_")], null, [A.eval(b4.sub("0"), int(b4.sub("0"), 0)), notify], c.id("0"))],
    span: b4.span,
  });
  c.add("0.repeat.body.4.catch.call", {
    kind: "composite_call",
    parent: c.id("0.repeat.body.4"),
    callee: T.collect,
    args: [logsItem(b4.sub("#minecraft:logs")), float(b4.sub("6.0"), 6.0)],
    result: null,
    mode: "sync",
    deferred: false,
    next: tr(null, [notify], c.id("0")),
    span: b4.sub("collect(#minecraft:logs, 6.0)").span,
  });
  c.add("end", { kind: "final", span: null });
  composite(T.chop, {
    module: "woodcutting",
    simple: "chop_trees",
    decl: d,
    params: [{ name: "area", type: "Region" }, { name: "target", type: "Int" }],
    result: "Int",
    clauses: {
      requires: [req(rq, E.bin(rq.sub("target > 0"), ">", param(rq.sub("target"), "target", "Int"), int(rq.sub("0"), 0), "Bool"))],
      ensures: [ens(en, E.bin(en.sub("result >= target"), ">=", E.result(en.sub("result"), "Int"), param(en.sub("target"), "target", "Int"), "Bool"))],
      fails: [FL.NoTrees, FL.NotEnoughLogs],
    },
    chart: c,
    calls: [{ callee: T.mine, caught: ["Interfered", "Rejected"] }, { callee: T.collect, caught: "all" }],
    direct: [FL.NoTrees, FL.NotEnoughLogs],
  });
}
{
  // woodcutting.stash_logs (§19.1)
  const d = WOOD.at("pub task stash_logs(chest: BlockPos) -> Int {");
  const en = WOOD.at("@ensures bot.inventory.count(#minecraft:logs) == old(bot.inventory.count(#minecraft:logs)) - result");
  const s0 = d.next("goto(Goal.InReach(chest))");
  const s1 = d.next("let w = open<Container>(chest)");
  const s2 = d.next("defer close(w)");
  const s3 = d.next("return deposit(w, #minecraft:logs, 2304)");
  const c = new Chart(T.stash, { $t0: "Int", w: WC });
  const o = en.sub("old(bot.inventory.count(#minecraft:logs))");
  const ir = s0.sub("Goal.InReach(chest)");
  c.add("", { kind: "scope", defers: true, initial: tr(null, [], c.id("0")), span: d.span });
  c.add("0", {
    kind: "composite_call", callee: T.gotoGoal, args: gotoGoalArgs(variantGoal(ir, "InReach", [param(ir.sub("chest"), "chest", "BlockPos")])),
    result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("1")), span: s0.span,
  });
  c.add("1", {
    kind: "composite_call", callee: T.open, args: [param(s1.sub("chest"), "chest", "BlockPos")],
    result: "w", mode: "sync", deferred: false,
    next: tr(null, [A.defer(s2, c.id("2.defer.call"), [local(s2.sub("w"), "w", WC)])], c.id("3")),
    span: s1.span,
  });
  c.add("2.defer.call", {
    kind: "extern_call", callee: T.closeC, args: null, result: null, mode: "sync", deferred: true, next: null, span: s2.sub("close(w)").span,
  });
  c.add("3", {
    kind: "composite_call", callee: T.deposit,
    args: [local(s3.sub("w"), "w", WC), logsItem(s3.sub("#minecraft:logs")), int(s3.sub("2304"), 2304), defaultArgs.depositExact()],
    result: "$t0", mode: "sync", deferred: false,
    next: tr(null, [A.ret(s3, local(s3.sub("deposit(w, #minecraft:logs, 2304)"), "$t0", "Int"))], c.id("end")),
    span: s3.span,
  });
  c.add("end", { kind: "final", span: null });
  composite(T.stash, {
    module: "woodcutting",
    simple: "stash_logs",
    decl: d,
    params: [{ name: "chest", type: "BlockPos" }],
    result: "Int",
    olds: [invCount(o.sub("bot.inventory.count(#minecraft:logs)"), logsItem(o.sub("#minecraft:logs")))],
    clauses: {
      ensures: [ens(en, E.bin(en.sub(en.text.replace("@ensures ", "")), "==", invCount(en.sub("bot.inventory.count(#minecraft:logs)"), logsItem(en.sub("#minecraft:logs"))),
        E.bin(en.sub("old(bot.inventory.count(#minecraft:logs)) - result"), "-", E.old(o, 0, "Int"), E.result(en.sub("result"), "Int"), "Int"), "Bool"))],
    },
    chart: c,
    calls: [{ callee: T.gotoGoal }, { callee: T.open }, { callee: T.closeC }, { callee: T.deposit }],
  });
}
{
  // golem.core.goto(goal, attempts, opts)
  const d = CORE.at("pub task goto(goal: Goal, attempts: Int = 3, opts: PathOpts = PathOpts()) {");
  const en = CORE.at("@ensures goal.reached");
  const s0 = d.next("retry attempts on Stalled, Rejected, NoPath {");
  const b0 = d.next("pathfind(goal, opts = opts)");
  const c = new Chart(T.gotoGoal, { $c0: "Int" });
  c.add("", { kind: "scope", defers: false, initial: tr(null, [A.counterInit(s0, "$c0", param(s0.sub("attempts"), "attempts", "Int"), 1)], c.id("0")), span: d.span });
  c.add("0", {
    kind: "retry",
    initial: tr(null, [], c.id("0.retry.body.0")),
    catches: [ftr([pat("Stalled"), pat("Rejected"), pat(FL.NoPath)], E.bin(s0, ">", local(s0, "$c0", "Int"), int(s0, 1), "Bool"), [A.counterStep(s0, "$c0")], c.id("0"))],
    span: d.next("retry attempts on Stalled, Rejected, NoPath {\n        pathfind(goal, opts = opts)\n    }").span,
  });
  c.add("0.retry.body.0", {
    kind: "extern_call", parent: c.id("0"), callee: T.pathfind,
    args: [param(b0.sub("goal"), "goal", "Goal"), defaultArgs.pathfindLimit(), param(b0.sub("opts", 1), "opts", "PathOpts")],
    result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("end")), span: b0.span,
  });
  c.add("end", { kind: "final", span: null });
  composite(T.gotoGoal, {
    module: "golem.core",
    simple: "goto",
    decl: d,
    params: [{ name: "goal", type: "Goal" }, { name: "attempts", type: "Int", default: 3 }, { name: "opts", type: "PathOpts", default: { avoid: null } }],
    clauses: { ensures: [ens(en, E.call(en.sub("goal.reached"), "Goal.reached", "Bool", "property", param(en.sub("goal"), "goal", "Goal"), []))] },
    chart: c,
    calls: [{ callee: T.pathfind }],
  });
}
{
  // golem.core.goto(target, radius)
  const d = CORE.at("pub task goto(target: Entity, radius: Float = 2.0) {");
  const en = CORE.at("@ensures Goal.NearEntity(target, radius).reached");
  const s0 = d.next("goto(Goal.NearEntity(target, radius))");
  const ne = (k) => variantGoal(k, "NearEntity", [param(k.sub("target"), "target", "Entity"), param(k.sub("radius"), "radius", "Float")]);
  const c = new Chart(T.gotoEntity, {});
  c.add("", { kind: "scope", defers: false, initial: tr(null, [], c.id("0")), span: d.span });
  c.add("0", {
    kind: "composite_call", callee: T.gotoGoal, args: gotoGoalArgs(ne(s0.sub("Goal.NearEntity(target, radius)"))),
    result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("end")), span: s0.span,
  });
  c.add("end", { kind: "final", span: null });
  composite(T.gotoEntity, {
    module: "golem.core",
    simple: "goto",
    decl: d,
    params: [{ name: "target", type: "Entity" }, { name: "radius", type: "Float", default: 2.0 }],
    clauses: { ensures: [ens(en, E.call(en.sub("Goal.NearEntity(target, radius).reached"), "Goal.reached", "Bool", "property", ne(en.sub("Goal.NearEntity(target, radius)")), []))] },
    chart: c,
    calls: [{ callee: T.gotoGoal }],
  });
}
{
  // golem.core.mine
  const d = CORE.at("pub task mine(pos: BlockPos, harvest: Bool = true) {");
  const rq = CORE.at("@requires !harvest || bot.can_harvest(pos) else fail WrongTool(pos)");
  const en = CORE.at("@ensures world.block(pos) matches CLEARED");
  const s0 = d.next("if !bot.in_reach(pos) {");
  const s0t = d.next("goto(Goal.InReach(pos))");
  const s1 = d.next("if let t = best_tool(pos, harvest) {");
  const s1t = d.next("equip(ItemFilter.of(t))");
  const s2 = d.next("dig(pos)");
  const c = new Chart(T.mine, { $t0: "ItemType?", t: "ItemType" });
  const bestTool = A.bind(s1, "$t0", E.call(s1.sub("best_tool(pos, harvest)"), "golem.core.best_tool", "ItemType?", "free", null,
    [param(s1.sub("pos"), "pos", "BlockPos"), param(s1.sub("harvest"), "harvest", "Bool")]));
  const ir = s0t.sub("Goal.InReach(pos)");
  c.add("", { kind: "scope", defers: false, initial: tr(null, [], c.id("0")), span: d.span });
  c.add("0", {
    kind: "choice",
    transitions: [
      tr(E.un(s0.sub("!bot.in_reach(pos)"), "!", E.call(s0.sub("bot.in_reach(pos)"), "Bot.in_reach(BlockPos)", "Bool", "method", E.bot(s0), [param(s0.sub("pos"), "pos", "BlockPos")]), "Bool"), [], c.id("0.if.then.0")),
      tr(null, [bestTool], c.id("1")),
    ],
    span: s0.span,
  });
  c.add("0.if.then.0", {
    kind: "composite_call", callee: T.gotoGoal, args: gotoGoalArgs(variantGoal(ir, "InReach", [param(ir.sub("pos"), "pos", "BlockPos")])),
    result: null, mode: "sync", deferred: false, next: tr(null, [bestTool], c.id("1")), span: s0t.span,
  });
  c.add("1", {
    kind: "choice",
    transitions: [
      tr(E.un(s1, "!", E.isNone(s1, local(s1, "$t0", "ItemType?")), "Bool"), [A.bind(s1.sub("let t"), "t", E.unwrap(s1, local(s1, "$t0", "ItemType?"), "ItemType"))], c.id("1.if.then.0")),
      tr(null, [], c.id("2")),
    ],
    span: s1.span,
  });
  c.add("1.if.then.0", {
    kind: "composite_call", callee: T.equip,
    args: [E.call(s1t.sub("ItemFilter.of(t)"), "ItemFilter.of", "ItemFilter", "static", null, [local(s1t.sub("(t)").sub("t"), "t", "ItemType")]), defaultArgs.equipHand()],
    result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("2")), span: s1t.span,
  });
  c.add("2", {
    kind: "extern_call", callee: T.dig, args: [param(s2.sub("pos"), "pos", "BlockPos")],
    result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("end")), span: s2.span,
  });
  c.add("end", { kind: "final", span: null });
  const blk = en.sub("world.block(pos)");
  composite(T.mine, {
    module: "golem.core",
    simple: "mine",
    decl: d,
    params: [{ name: "pos", type: "BlockPos" }, { name: "harvest", type: "Bool", default: true }],
    clauses: {
      requires: [req(rq, E.logic(rq.sub("!harvest || bot.can_harvest(pos)"), "||", E.un(rq.sub("!harvest"), "!", param(rq.sub("harvest"), "harvest", "Bool"), "Bool"),
        E.call(rq.sub("bot.can_harvest(pos)"), "Bot.can_harvest", "Bool", "method", E.bot(rq), [param(rq.sub("(pos)").sub("pos"), "pos", "BlockPos")])),
        fctor(FL.WrongTool, [param(rq.sub("WrongTool(pos)").sub("pos"), "pos", "BlockPos")]))],
      ensures: [ens(en, E.bin(en.sub("world.block(pos) matches CLEARED"), "matches",
        E.call(blk, "World.block", "BlockState?", "method", E.world(blk), [param(blk.sub("pos"), "pos", "BlockPos")]),
        E.cnst(en.sub("CLEARED"), "golem.filters.CLEARED", "BlockFilter"), "Bool"))],
    },
    chart: c,
    calls: [{ callee: T.gotoGoal }, { callee: T.equip }, { callee: T.dig }],
  });
}
{
  // golem.core.equip
  const d = CORE.at("pub task equip(item: ItemFilter, hand: Hand = Hand.Main) {");
  const rq = CORE.at("@requires bot.inventory.count(item) > 0 else fail Missing(item, 1)");
  const en = CORE.at("@ensures (if hand == Hand.Main then bot.held else bot.offhand) matches item");
  const s0 = d.next("if (if hand == Hand.Main then bot.held else bot.offhand) matches item {");
  const s0r = d.next("return");
  const s1 = d.next("let inv = bot.inventory_window");
  const s2 = d.next("let s = inv.find(item) else fail Missing(item, 1)");
  const s3 = d.next("if s in inv.hotbar {");
  const s3t = d.next("select_hotbar(s - inv.hotbar.start)");
  const s3e = d.next("swap_hotbar(inv, s, bot.held_slot)");
  const s4 = d.next("if hand == Hand.Off {");
  const s4t = d.next("swap_hands()");
  const c = new Chart(T.equip, { $t0: "Int?", inv: WP, s: "Int" });
  const heldMatches = (k) => {
    const i = k.sub("(if hand == Hand.Main then bot.held else bot.offhand)");
    const cond = i.sub("hand == Hand.Main");
    return E.bin(k.sub("(if hand == Hand.Main then bot.held else bot.offhand) matches item"), "matches",
      E.ifx(i, E.bin(cond, "==", param(cond.sub("hand"), "hand", "Hand"), E.variant(cond.sub("Hand.Main"), "Hand", "Main", []), "Bool"),
        botProp(i.sub("bot.held"), "held", "ItemStack?"), botProp(i.sub("bot.offhand"), "offhand", "ItemStack?"), "ItemStack?"),
      param(k.sub("matches item").sub("item"), "item", "ItemFilter"), "Bool");
  };
  const missing = (k) => fctor(FL.Missing, [param(k.sub("Missing(item, 1)").sub("item"), "item", "ItemFilter"), int(k.sub("Missing(item, 1)").sub("1"), 1)]);
  const invL = (k) => local(k.sub("inv"), "inv", WP);
  const hotbar = (k) => E.call(k.sub("inv.hotbar"), wm(PLAYERINV, "hotbar"), "Range", "property", invL(k), []);
  c.add("", { kind: "scope", defers: false, initial: tr(null, [], c.id("0")), span: d.span });
  c.add("0", {
    kind: "choice",
    transitions: [
      tr(heldMatches(s0), [A.ret(s0r)], c.id("end")),
      tr(null, [A.bind(s1, "inv", botProp(s1.sub("bot.inventory_window"), "inventory_window", WP)),
        A.bind(s2, "$t0", E.call(s2.sub("inv.find(item)"), wm(PLAYERINV, "find"), "Int?", "method", invL(s2), [param(s2.sub("item"), "item", "ItemFilter")]))], c.id("2")),
    ],
    span: s0.span,
  });
  c.add("2", {
    kind: "choice",
    transitions: [
      tr(E.isNone(s2, local(s2, "$t0", "Int?")), [A.fail(s2.sub("fail Missing(item, 1)"), missing(s2).failure, missing(s2).fields)], null),
      tr(null, [A.bind(s2, "s", E.unwrap(s2, local(s2, "$t0", "Int?"), "Int"))], c.id("3")),
    ],
    span: s2.span,
  });
  c.add("3", {
    kind: "choice",
    transitions: [
      tr(E.bin(s3.sub("s in inv.hotbar"), "in", local(s3.sub("s"), "s", "Int"), hotbar(s3), "Bool"), [], c.id("3.if.then.0")),
      tr(null, [], c.id("3.if.else.0")),
    ],
    span: s3.span,
  });
  const st = s3t.sub("s - inv.hotbar.start");
  c.add("3.if.then.0", {
    kind: "extern_call", callee: T.selectHotbar,
    args: [E.bin(st, "-", local(st.sub("s"), "s", "Int"), E.field(st.sub("inv.hotbar.start"), hotbar(st), "start", "Int"), "Int")],
    result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("4")), span: s3t.span,
  });
  c.add("3.if.else.0", {
    kind: "extern_call", callee: T.swapHotbar,
    args: [invL(s3e.sub("(inv")), local(s3e.sub(", s,").sub("s"), "s", "Int"), botProp(s3e.sub("bot.held_slot"), "held_slot", "Int")],
    result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("4")), span: s3e.span,
  });
  const off = s4.sub("hand == Hand.Off");
  c.add("4", {
    kind: "choice",
    transitions: [
      tr(E.bin(off, "==", param(off.sub("hand"), "hand", "Hand"), E.variant(off.sub("Hand.Off"), "Hand", "Off", []), "Bool"), [], c.id("4.if.then.0")),
      tr(null, [], c.id("end")),
    ],
    span: s4.span,
  });
  c.add("4.if.then.0", {
    kind: "extern_call", callee: T.swapHands, args: [], result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("end")), span: s4t.span,
  });
  c.add("end", { kind: "final", span: null });
  composite(T.equip, {
    module: "golem.core",
    simple: "equip",
    decl: d,
    params: [{ name: "item", type: "ItemFilter" }, { name: "hand", type: "Hand", default: "Main" }],
    clauses: {
      requires: [req(rq, E.bin(rq.sub("bot.inventory.count(item) > 0"), ">", invCount(rq.sub("bot.inventory.count(item)"), param(rq.sub("(item)").sub("item"), "item", "ItemFilter")), int(rq.sub("> 0").sub("0"), 0), "Bool"), missing(rq))],
      ensures: [ens(en, heldMatches(en))],
      fails: [FL.Missing],
    },
    chart: c,
    calls: [{ callee: T.selectHotbar }, { callee: T.swapHotbar }, { callee: T.swapHands }],
    direct: [FL.Missing],
  });
}
{
  // golem.core.collect
  const d = CORE.at("pub task collect(f: ItemFilter, radius: Float) -> Int {");
  const en = CORE.at("@ensures bot.inventory.count(f) == old(bot.inventory.count(f)) + result");
  const s0 = d.next("let before = bot.inventory.count(f)");
  const s1 = d.next("repeat 16 {");
  const b0 = d.next("let drop = next_drop(f, radius) else { break }");
  const b0b = b0.sub("break");
  const b1 = d.next("goto(Goal.Near(feet_of(drop), 1.0)) catch {");
  const b1arm = d.next("NoPath | Stalled | Timeout | Rejected => { break }");
  const b2 = d.next("abort when !drop.alive {");
  const b2w = d.next("wait 1s");
  const s2 = d.next("return bot.inventory.count(f) - before");
  const c = new Chart(T.collect, { $c0: "Int", $t0: "Entity?", before: "Int", drop: "Entity" });
  const fP = (k) => param(k.sub("f"), "f", "ItemFilter");
  const retCount = (k) => A.ret(k, E.bin(s2.sub("bot.inventory.count(f) - before"), "-", invCount(s2.sub("bot.inventory.count(f)"), fP(s2.sub("(f)"))), local(s2.sub("before"), "before", "Int"), "Int"));
  const dropL = (k) => local(k.sub("drop"), "drop", "Entity");
  c.add("", {
    kind: "scope",
    defers: false,
    initial: tr(null, [A.bind(s0, "before", invCount(s0.sub("bot.inventory.count(f)"), fP(s0.sub("(f)")))), A.counterInit(s1, "$c0", int(s1.sub("16"), 16), 0)], c.id("1")),
    span: d.span,
  });
  c.add("1", {
    kind: "choice",
    transitions: [
      tr(gt0(s1, "$c0"), [A.counterStep(s1, "$c0"), A.bind(b0, "$t0", E.call(b0.sub("next_drop(f, radius)"), "golem.core.next_drop", "Entity?", "free", null,
        [fP(b0.sub("(f,")), param(b0.sub("radius"), "radius", "Float")]))], c.id("1.repeat.body.0")),
      tr(null, [retCount(s2)], c.id("end")),
    ],
    span: s1.span,
  });
  c.add("1.repeat.body.0", {
    kind: "choice",
    transitions: [
      tr(E.isNone(b0, local(b0, "$t0", "Entity?")), [retCount(b0b)], c.id("end")),
      tr(null, [A.bind(b0, "drop", E.unwrap(b0, local(b0, "$t0", "Entity?"), "Entity"))], c.id("1.repeat.body.1")),
    ],
    span: b0.span,
  });
  const near = b1.sub("Goal.Near(feet_of(drop), 1.0)");
  c.add("1.repeat.body.1", {
    kind: "try",
    form: "postfix",
    initial: tr(null, [], c.id("1.repeat.body.1.catch.call")),
    catches: [ftr([pat(FL.NoPath), pat("Stalled"), pat("Timeout"), pat("Rejected")], null, [retCount(b1arm.sub("break"))], c.id("end"))],
    span: d.next("goto(Goal.Near(feet_of(drop), 1.0)) catch {\n            NoPath | Stalled | Timeout | Rejected => { break }\n        }").span,
  });
  c.add("1.repeat.body.1.catch.call", {
    kind: "composite_call",
    parent: c.id("1.repeat.body.1"),
    callee: T.gotoGoal,
    args: gotoGoalArgs(variantGoal(near, "Near", [E.call(near.sub("feet_of(drop)"), "golem.core.feet_of", "BlockPos", "free", null, [dropL(near)]), float(near.sub("1.0"), 1.0)])),
    result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("1.repeat.body.2")),
    span: b1.sub("goto(Goal.Near(feet_of(drop), 1.0))").span,
  });
  c.add("1.repeat.body.2", {
    kind: "abort",
    cond: E.un(b2.sub("!drop.alive"), "!", E.call(b2.sub("drop.alive"), "Entity.alive", "Bool", "property", dropL(b2), []), "Bool"),
    initial: tr(null, [], c.id("1.repeat.body.2.abort.body.0")),
    on_abort: tr(null, [], c.id("1")),
    span: d.next("abort when !drop.alive {\n            wait 1s\n        }").span,
  });
  c.add("1.repeat.body.2.abort.body.0", {
    kind: "wait", parent: c.id("1.repeat.body.2"), duration: E.lit(b2w.sub("1s"), "Duration", "duration", 20), next: tr(null, [], c.id("1")), span: b2w.span,
  });
  c.add("end", { kind: "final", span: null });
  const o = en.sub("old(bot.inventory.count(f))");
  composite(T.collect, {
    module: "golem.core",
    simple: "collect",
    decl: d,
    params: [{ name: "f", type: "ItemFilter" }, { name: "radius", type: "Float" }],
    result: "Int",
    olds: [invCount(o.sub("bot.inventory.count(f)"), fP(o.sub("(f)")))],
    clauses: {
      ensures: [ens(en, E.bin(en.sub(en.text.replace("@ensures ", "")), "==", invCount(en.sub("bot.inventory.count(f)"), fP(en.sub("(f)"))),
        E.bin(en.sub("old(bot.inventory.count(f)) + result"), "+", E.old(o, 0, "Int"), E.result(en.sub("result"), "Int"), "Int"), "Bool"))],
    },
    chart: c,
    calls: [{ callee: T.gotoGoal, caught: [FL.NoPath, "Stalled", "Timeout", "Rejected"] }],
  });
}
{
  // golem.core.consume (§17.7)
  const d = CORE.at("pub task consume(food: ItemFilter) {");
  const blk = CORE.at("@requires bot.food < 20 else fail NotHungry");
  const r2 = lineAt(blk, "@requires bot.inventory.count(food) > 0 else fail Missing(food, 1)");
  const en = lineAt(blk, "@ensures bot.inventory.count(food) < old(bot.inventory.count(food))");
  const to = lineAt(blk, "@timeout 10s");
  const s0 = d.next("equip(food)");
  const s1 = d.next("let before = bot.inventory.count(food)");
  const s2 = d.next("with hold_use() {");
  const b0 = d.next("wait until bot.inventory.count(food) < before timeout 5s");
  const foodP = (k) => param(k.sub("food"), "food", "ItemFilter");
  const c = new Chart(T.consume, { before: "Int" });
  c.add("", { kind: "scope", defers: false, initial: tr(null, [], c.id("0")), span: d.span });
  c.add("0", {
    kind: "composite_call", callee: T.equip, args: [foodP(s0), defaultArgs.equipHand()],
    result: null, mode: "sync", deferred: false,
    next: tr(null, [A.bind(s1, "before", invCount(s1.sub("bot.inventory.count(food)"), foodP(s1.sub("(food)"))))], c.id("2")),
    span: s0.span,
  });
  c.add("2", { kind: "with", child: c.id("2.with.child"), body: c.id("2.with.body"), span: d.next("with hold_use() {\n        wait until bot.inventory.count(food) < before timeout 5s\n    }").span });
  c.add("2.with.child", {
    kind: "extern_call", parent: c.id("2"), callee: T.holdUse, args: [defaultArgs.holdUseHand()],
    result: null, mode: "sync", deferred: false, next: null, span: s2.sub("hold_use()").span,
  });
  c.add("2.with.body", { kind: "scope", parent: c.id("2"), defers: false, initial: tr(null, [], c.id("2.with.body.0")), span: null });
  const cond = b0.sub("bot.inventory.count(food) < before");
  c.add("2.with.body.0", {
    kind: "wait_until",
    parent: c.id("2.with.body"),
    cond: E.bin(cond, "<", invCount(cond.sub("bot.inventory.count(food)"), foodP(cond.sub("(food)"))), local(cond.sub("before"), "before", "Int"), "Bool"),
    timeout: E.lit(b0.sub("5s"), "Duration", "duration", 100),
    else_fail: null,
    next: tr(null, [], c.id("end")),
    span: b0.span,
  });
  c.add("end", { kind: "final", span: null });
  const o = en.sub("old(bot.inventory.count(food))");
  const rf = blk.sub("bot.food < 20");
  composite(T.consume, {
    module: "golem.core",
    simple: "consume",
    decl: d,
    params: [{ name: "food", type: "ItemFilter" }],
    olds: [invCount(o.sub("bot.inventory.count(food)"), foodP(o.sub("(food)")))],
    clauses: {
      requires: [
        req(lineAt(blk, "@requires bot.food < 20"), E.bin(rf, "<", botProp(rf.sub("bot.food"), "food", "Int"), int(rf.sub("20"), 20), "Bool"), fctor(FL.NotHungry, [])),
        req(r2, E.bin(r2.sub("bot.inventory.count(food) > 0"), ">", invCount(r2.sub("bot.inventory.count(food)"), foodP(r2.sub("(food)"))), int(r2.sub("> 0").sub("0"), 0), "Bool"),
          fctor(FL.Missing, [foodP(r2.sub("Missing(food, 1)")), int(r2.sub("Missing(food, 1)").sub("1"), 1)])),
      ],
      ensures: [ens(en, E.bin(en.sub(en.text.replace("@ensures ", "")), "<", invCount(en.sub("bot.inventory.count(food)"), foodP(en.sub("(food)"))), E.old(o, 0, "Int"), "Bool"))],
      timeout: timeout(to, E.lit(to.sub("10s"), "Duration", "duration", 200)),
    },
    chart: c,
    calls: [{ callee: T.equip }, { callee: T.holdUse }],
    waitUntilWithoutElse: true,
  });
}
{
  // golem.core.fight
  const d = CORE.at("pub unchecked task fight(target: Entity) {");
  const to = CORE.at("// approaches and attacks on cooldown").next("@timeout 30s");
  const s0 = d.next("repeat 60 {");
  const b0 = d.next("if !target.alive {");
  const b0r = d.next("return");
  const b1 = d.next("if !bot.in_reach(target) {");
  const b1t = d.next("goto(target, radius = 2.0) catch {");
  const b1arm = d.next("NoPath | Stalled | Rejected | Timeout => { return }");
  const b2 = d.next("attack(target) catch {");
  const b3 = d.next("wait 12t");
  const tgt = (k) => param(k.sub("target"), "target", "Entity");
  const c = new Chart(T.fight, { $c0: "Int" });
  c.add("", { kind: "scope", defers: false, initial: tr(null, [A.counterInit(s0, "$c0", int(s0.sub("60"), 60), 0)], c.id("0")), span: d.span });
  c.add("0", { kind: "choice", transitions: [tr(gt0(s0, "$c0"), [A.counterStep(s0, "$c0")], c.id("0.repeat.body.0")), tr(null, [], c.id("end"))], span: s0.span });
  c.add("0.repeat.body.0", {
    kind: "choice",
    transitions: [
      tr(E.un(b0.sub("!target.alive"), "!", E.call(b0.sub("target.alive"), "Entity.alive", "Bool", "property", tgt(b0), []), "Bool"), [A.ret(b0r)], c.id("end")),
      tr(null, [], c.id("0.repeat.body.1")),
    ],
    span: b0.span,
  });
  c.add("0.repeat.body.1", {
    kind: "choice",
    transitions: [
      tr(E.un(b1.sub("!bot.in_reach(target)"), "!", E.call(b1.sub("bot.in_reach(target)"), "Bot.in_reach(Entity)", "Bool", "method", E.bot(b1), [tgt(b1.sub("(target)"))]), "Bool"), [], c.id("0.repeat.body.1.if.then.0")),
      tr(null, [], c.id("0.repeat.body.2")),
    ],
    span: b1.span,
  });
  c.add("0.repeat.body.1.if.then.0", {
    kind: "try",
    form: "postfix",
    initial: tr(null, [], c.id("0.repeat.body.1.if.then.0.catch.call")),
    catches: [ftr([pat(FL.NoPath), pat("Stalled"), pat("Rejected"), pat("Timeout")], null, [A.ret(b1arm.sub("return"))], c.id("end"))],
    span: d.next("goto(target, radius = 2.0) catch {\n                NoPath | Stalled | Rejected | Timeout => { return }\n            }").span,
  });
  c.add("0.repeat.body.1.if.then.0.catch.call", {
    kind: "composite_call", parent: c.id("0.repeat.body.1.if.then.0"), callee: T.gotoEntity,
    args: [tgt(b1t.sub("(target")), float(b1t.sub("2.0"), 2.0)],
    result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("0.repeat.body.2")), span: b1t.sub("goto(target, radius = 2.0)").span,
  });
  c.add("0.repeat.body.2", {
    kind: "try",
    form: "postfix",
    initial: tr(null, [], c.id("0.repeat.body.2.catch.call")),
    catches: [ftr([pat(FL.EntityGone), pat(FL.OutOfReach)], null, [], c.id("0.repeat.body.3"))],
    span: d.next("attack(target) catch {\n            EntityGone | OutOfReach => {}\n        }").span,
  });
  c.add("0.repeat.body.2.catch.call", {
    kind: "extern_call", parent: c.id("0.repeat.body.2"), callee: T.attack, args: [tgt(b2)],
    result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("0.repeat.body.3")), span: b2.sub("attack(target)").span,
  });
  c.add("0.repeat.body.3", { kind: "wait", duration: E.lit(b3.sub("12t"), "Duration", "duration", 12), next: tr(null, [], c.id("0")), span: b3.span });
  c.add("end", { kind: "final", span: null });
  composite(T.fight, {
    module: "golem.core",
    simple: "fight",
    decl: d,
    modifiers: ["unchecked"],
    params: [{ name: "target", type: "Entity" }],
    clauses: { timeout: timeout(to, E.lit(to.sub("30s"), "Duration", "duration", 600)) },
    chart: c,
    calls: [{ callee: T.gotoEntity, caught: [FL.NoPath, "Stalled", "Rejected", "Timeout"] }, { callee: T.attack, caught: [FL.EntityGone, FL.OutOfReach] }],
  });
}
{
  // golem.core.open<Container> (§17.4)
  const d = CORE.at("pub task open<K: Screen>(pos: BlockPos) -> Window<K> {");
  const rq = CORE.at("@requires bot.window == none else fail ScreenBusy");
  const en = CORE.at("@ensures result.open");
  const s0 = d.next("let face = bot.aim_face(pos) else fail OutOfReach(pos)");
  const s1 = d.next("interact(pos, face)");
  const s2 = d.next("wait until bot.window != none timeout 2s else fail NotOpened(pos)");
  const s3 = d.next("let any = bot.window else fail NotOpened(pos)");
  const s4 = d.next("let w = any.cast<K>() else {");
  const s4c = d.next("close(any)");
  const s4f = d.next("fail WrongKind(pos)");
  const s5 = d.next("return w");
  const posP = (k) => param(k.sub("pos"), "pos", "BlockPos");
  const c = new Chart(T.open, { $t0: "Face?", $t1: `${WA}?`, $t2: `${WC}?`, any: WA, face: "Face", w: WC });
  c.add("", {
    kind: "scope",
    defers: false,
    initial: tr(null, [A.bind(s0, "$t0", E.call(s0.sub("bot.aim_face(pos)"), "Bot.aim_face", "Face?", "method", E.bot(s0), [posP(s0.sub("(pos)"))]))], c.id("0")),
    span: d.span,
  });
  c.add("0", {
    kind: "choice",
    transitions: [
      tr(E.isNone(s0, local(s0, "$t0", "Face?")), [A.fail(s0.sub("fail OutOfReach(pos)"), FL.OutOfReach, [posP(s0.sub("OutOfReach(pos)"))])], null),
      tr(null, [A.bind(s0, "face", E.unwrap(s0, local(s0, "$t0", "Face?"), "Face"))], c.id("1")),
    ],
    span: s0.span,
  });
  c.add("1", {
    kind: "extern_call", callee: T.interact, args: [posP(s1), local(s1.sub("face"), "face", "Face")],
    result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("2")), span: s1.span,
  });
  const ne = s2.sub("bot.window != none");
  c.add("2", {
    kind: "wait_until",
    cond: E.bin(ne, "!=", botProp(ne.sub("bot.window"), "window", `${WA}?`), none(ne.sub("none"), `${WA}?`), "Bool"),
    timeout: E.lit(s2.sub("2s"), "Duration", "duration", 40),
    else_fail: fctor(FL.NotOpened, [posP(s2.sub("NotOpened(pos)"))]),
    next: tr(null, [A.bind(s3, "$t1", botProp(s3.sub("bot.window"), "window", `${WA}?`))], c.id("3")),
    span: s2.span,
  });
  c.add("3", {
    kind: "choice",
    transitions: [
      tr(E.isNone(s3, local(s3, "$t1", `${WA}?`)), [A.fail(s3.sub("fail NotOpened(pos)"), FL.NotOpened, [posP(s3.sub("NotOpened(pos)"))])], null),
      tr(null, [
        A.bind(s3, "any", E.unwrap(s3, local(s3, "$t1", `${WA}?`), WA)),
        A.bind(s4, "$t2", E.call(s4.sub("any.cast<K>()"), `${wm(ANYKIND, "cast")}<${CONTAINER}>`, `${WC}?`, "method", local(s4.sub("any"), "any", WA), [])),
      ], c.id("4")),
    ],
    span: s3.span,
  });
  c.add("4", {
    kind: "choice",
    transitions: [
      tr(E.isNone(s4, local(s4, "$t2", `${WC}?`)), [], c.id("4.let.else.0")),
      tr(null, [A.bind(s4, "w", E.unwrap(s4, local(s4, "$t2", `${WC}?`), WC)), A.ret(s5, local(s5.sub("w"), "w", WC))], c.id("end")),
    ],
    span: d.next("let w = any.cast<K>() else {\n        close(any)\n        fail WrongKind(pos)\n    }").span,
  });
  c.add("4.let.else.0", {
    kind: "extern_call", callee: T.closeA, args: [local(s4c.sub("any"), "any", WA)],
    result: null, mode: "sync", deferred: false,
    next: tr(null, [A.fail(s4f, FL.WrongKind, [posP(s4f)])], null),
    span: s4c.span,
  });
  c.add("end", { kind: "final", span: null });
  const rqe = rq.sub("bot.window == none");
  composite(T.open, {
    module: "golem.core",
    simple: "open",
    typeArgs: [CONTAINER],
    decl: d,
    params: [{ name: "pos", type: "BlockPos" }],
    result: WC,
    clauses: {
      requires: [req(rq, E.bin(rqe, "==", botProp(rqe.sub("bot.window"), "window", `${WA}?`), none(rqe.sub("none"), `${WA}?`), "Bool"), fctor(FL.ScreenBusy, []))],
      ensures: [ens(en, E.call(en.sub("result.open"), wm(CONTAINER, "open"), "Bool", "property", E.result(en.sub("result"), WC), []))],
      fails: [FL.OutOfReach, FL.NotOpened, FL.WrongKind],
    },
    chart: c,
    calls: [{ callee: T.interact }, { callee: T.closeA }],
    direct: [FL.OutOfReach, FL.NotOpened, FL.WrongKind],
  });
}
{
  // golem.core.deposit<Container>
  const d = CORE.at("pub task deposit(w: Window<impl HasContainer>, item: ItemFilter, n: Int, exact: Bool = false) -> Int {");
  const blk = CORE.at("// the reverse of withdraw");
  const rq = lineAt(blk, "@requires n > 0");
  const en = lineAt(blk, "@ensures bot.inventory.count(item) == old(bot.inventory.count(item)) - result");
  const s0 = d.next("let before = bot.inventory.count(item)");
  const s1 = d.next("for s in w.player_slots {");
  const b0 = d.next("let moved = before - bot.inventory.count(item)");
  const b1 = d.next("if moved >= n {");
  const b1b = d.next("break");
  const b2 = d.next("let st = w.slot(s) else { continue }");
  const b3 = d.next("if !(st matches item) {");
  const b4 = d.next("if exact && moved + st.count > n {");
  const t0 = d.next("let free = free_slot(w, w.container) else { break }");
  const t1 = d.next("atomic {");
  const a0 = d.next("pick_up(w, s)");
  const a1 = d.next("repeat st.count - (n - moved) {");
  const a1b = d.next("put(w, s, one = true)");
  const a2 = d.next("put(w, free)");
  const e0 = d.next("quick_move(w, s)");
  const s2 = d.next("return before - bot.inventory.count(item)");
  const W = (k) => wParam(k, CONTAINER);
  const sL = (k) => local(k, "s", "Int");
  const itemP = (k) => param(k.sub("item"), "item", "ItemFilter");
  const movedL = (k) => local(k.sub("moved"), "moved", "Int");
  const nP = (k) => param(k, "n", "Int");
  const ret = (k) => A.ret(k, E.bin(s2.sub("before - bot.inventory.count(item)"), "-", local(s2.sub("before"), "before", "Int"), invCount(s2.sub("bot.inventory.count(item)"), itemP(s2.sub("(item)"))), "Int"));
  const c = new Chart(T.deposit, { $c0: "Int", $i0: "Range", $t0: "ItemStack?", $t1: "Int?", before: "Int", free: "Int", moved: "Int", s: "Int", st: "ItemStack" });
  c.add("", {
    kind: "scope",
    defers: false,
    initial: tr(null, [
      A.bind(s0, "before", invCount(s0.sub("bot.inventory.count(item)"), itemP(s0.sub("(item)")))),
      A.iterInit(s1, "$i0", E.call(s1.sub("w.player_slots"), wm(CONTAINER, "player_slots"), "Range", "property", W(s1), [])),
    ], c.id("1")),
    span: d.span,
  });
  c.add("1", {
    kind: "choice",
    transitions: [
      tr(E.iterMore(s1, "$i0"), [A.iterNext(s1, "$i0", "s"),
        A.bind(b0, "moved", E.bin(b0.sub("before - bot.inventory.count(item)"), "-", local(b0.sub("before"), "before", "Int"), invCount(b0.sub("bot.inventory.count(item)"), itemP(b0.sub("(item)"))), "Int"))],
        c.id("1.for.body.1")),
      tr(null, [ret(s2)], c.id("end")),
    ],
    span: s1.span,
  });
  c.add("1.for.body.1", {
    kind: "choice",
    transitions: [
      tr(E.bin(b1.sub("moved >= n"), ">=", movedL(b1), nP(b1.sub("n")), "Bool"), [ret(b1b)], c.id("end")),
      tr(null, [A.bind(b2, "$t0", wSlot(b2.sub("w.slot(s)"), CONTAINER, sL(b2.sub("(s)").sub("s"))))], c.id("1.for.body.2")),
    ],
    span: b1.span,
  });
  c.add("1.for.body.2", {
    kind: "choice",
    transitions: [
      tr(E.isNone(b2, local(b2, "$t0", "ItemStack?")), [], c.id("1")),
      tr(null, [A.bind(b2, "st", E.unwrap(b2, local(b2, "$t0", "ItemStack?"), "ItemStack"))], c.id("1.for.body.3")),
    ],
    span: b2.span,
  });
  const m = b3.sub("st matches item");
  c.add("1.for.body.3", {
    kind: "choice",
    transitions: [
      tr(E.un(b3.sub("!(st matches item)"), "!", E.bin(m, "matches", local(m.sub("st"), "st", "ItemStack"), itemP(m.sub("item")), "Bool"), "Bool"), [], c.id("1")),
      tr(null, [], c.id("1.for.body.4")),
    ],
    span: b3.span,
  });
  const cond = b4.sub("exact && moved + st.count > n");
  const gt = cond.sub("moved + st.count > n");
  const sum = gt.sub("moved + st.count");
  const fs = t0.sub("free_slot(w, w.container)");
  c.add("1.for.body.4", {
    kind: "choice",
    transitions: [
      tr(E.logic(cond, "&&", param(cond.sub("exact"), "exact", "Bool"),
        E.bin(gt, ">", E.bin(sum, "+", movedL(sum), E.field(sum.sub("st.count"), local(sum.sub("st"), "st", "ItemStack"), "count", "Int"), "Int"), nP(gt.sub("> n").sub("n")), "Bool")),
        [A.bind(t0, "$t1", E.call(fs, `golem.core.free_slot<${CONTAINER}>`, "Int?", "free", null,
          [W(fs.sub("(w")), E.call(fs.sub("w.container"), wm(CONTAINER, "container"), "Range", "property", W(fs.sub("w.container")), [])]))],
        c.id("1.for.body.4.if.then.0")),
      tr(null, [], c.id("1.for.body.4.if.else.0")),
    ],
    span: b4.span,
  });
  c.add("1.for.body.4.if.then.0", {
    kind: "choice",
    transitions: [
      tr(E.isNone(t0, local(t0, "$t1", "Int?")), [ret(t0.sub("break"))], c.id("end")),
      tr(null, [A.bind(t0, "free", E.unwrap(t0, local(t0, "$t1", "Int?"), "Int"))], c.id("1.for.body.4.if.then.1")),
    ],
    span: t0.span,
  });
  const atomicId = c.id("1.for.body.4.if.then.1");
  c.add("1.for.body.4.if.then.1", {
    kind: "atomic",
    initial: tr(null, [], c.id("1.for.body.4.if.then.1.atomic.body.0")),
    span: d.next("atomic {\n                pick_up(w, s)").next("atomic {").span,
  });
  const cnt = a1.sub("st.count - (n - moved)");
  const inner = cnt.sub("(n - moved)").sub("n - moved");
  c.add("1.for.body.4.if.then.1.atomic.body.0", {
    kind: "extern_call", parent: atomicId, callee: T.pickUp, args: [W(a0), sL(a0.sub("s)").sub("s")), defaultArgs.pickUpHalf()],
    result: null, mode: "sync", deferred: false,
    next: tr(null, [A.counterInit(a1, "$c0", E.bin(cnt, "-", E.field(cnt.sub("st.count"), local(cnt.sub("st"), "st", "ItemStack"), "count", "Int"),
      E.bin(inner, "-", nP(inner.sub("n")), movedL(inner), "Int"), "Int"), 0)], c.id("1.for.body.4.if.then.1.atomic.body.1")),
    span: a0.span,
  });
  c.add("1.for.body.4.if.then.1.atomic.body.1", {
    kind: "choice",
    parent: atomicId,
    transitions: [
      tr(gt0(a1, "$c0"), [A.counterStep(a1, "$c0")], c.id("1.for.body.4.if.then.1.atomic.body.1.repeat.body.0")),
      tr(null, [], c.id("1.for.body.4.if.then.1.atomic.body.2")),
    ],
    span: a1.span,
  });
  c.add("1.for.body.4.if.then.1.atomic.body.1.repeat.body.0", {
    kind: "extern_call", parent: atomicId, callee: T.put, args: [W(a1b), sL(a1b.sub(", s,").sub("s")), bool(a1b.sub("true"), true)],
    result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("1.for.body.4.if.then.1.atomic.body.1")), span: a1b.span,
  });
  c.add("1.for.body.4.if.then.1.atomic.body.2", {
    kind: "extern_call", parent: atomicId, callee: T.put, args: [W(a2), local(a2.sub("free"), "free", "Int"), defaultArgs.putOne()],
    result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("1")), span: a2.span,
  });
  c.add("1.for.body.4.if.else.0", {
    kind: "extern_call", callee: T.quickMove, args: [W(e0), sL(e0.sub(", s").sub("s"))],
    result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("1")), span: e0.span,
  });
  c.add("end", { kind: "final", span: null });
  const o = en.sub("old(bot.inventory.count(item))");
  composite(T.deposit, {
    module: "golem.core",
    simple: "deposit",
    typeArgs: [CONTAINER],
    decl: d,
    params: [{ name: "w", type: WC }, { name: "item", type: "ItemFilter" }, { name: "n", type: "Int" }, { name: "exact", type: "Bool", default: false }],
    result: "Int",
    olds: [invCount(o.sub("bot.inventory.count(item)"), itemP(o.sub("(item)")))],
    clauses: {
      requires: [req(rq, E.bin(rq.sub("n > 0"), ">", nP(rq.sub("n")), int(rq.sub("0"), 0), "Bool"))],
      ensures: [ens(en, E.bin(en.sub(en.text.replace("@ensures ", "")), "==", invCount(en.sub("bot.inventory.count(item)"), itemP(en.sub("(item)"))),
        E.bin(en.sub("old(bot.inventory.count(item)) - result"), "-", E.old(o, 0, "Int"), E.result(en.sub("result"), "Int"), "Int"), "Bool"))],
    },
    chart: c,
    calls: [{ callee: T.pickUp }, { callee: T.put }, { callee: T.quickMove }],
    mayPin: true,
  });
}

// ---------- failure, resource and pinning inference (§13.3, §13.5) ----------

const BUILTIN = new Set(["Unmet", "Broken", "Stalled", "Timeout", "Rejected", "Unconfirmed", "Interfered", "WindowClosed"]);
const directCalls = {};
for (const [name, t] of Object.entries(tasks)) directCalls[name] = t._calls ?? [];
const done = new Set();
function infer(name) {
  const t = tasks[name];
  if (done.has(name)) return t;
  const f = new Set(t.clauses.fails);
  for (const r of t.clauses.requires) if (r.else_fail) f.add(r.else_fail.failure); else f.add("Unmet");
  for (const i of [...t.clauses.invariants, ...t.clauses.maintains]) if (i.else_fail) f.add(i.else_fail.failure); else f.add("Broken");
  if (t.clauses.timeout) f.add("Timeout");
  if (t.clauses.progress || t.clauses.stalls_after) f.add("Stalled");
  if (t.clauses.ensures.length > 0) f.add("Interfered");
  if (t.kind === "extern") {
    f.add("Rejected");
    f.add("Unconfirmed");
  }
  if (t._waitUntilWithoutElse) f.add("Timeout");
  let uses = new Set(t.uses);
  let mayPin = t.may_pin;
  let irreversible = t.irreversible;
  for (const call of directCalls[name]) {
    const callee = infer(call.callee);
    for (const r of callee.uses) uses.add(r);
    mayPin ||= callee.may_pin;
    irreversible ||= callee.irreversible;
    for (const x of callee.failures) {
      if (call.caught === "all" && (BUILTIN.has(x) || x.includes("."))) continue;
      if (Array.isArray(call.caught) && call.caught.includes(x)) continue;
      f.add(x);
    }
  }
  if (mayPin) f.add("Timeout");
  if (uses.has("screen")) f.add("WindowClosed");
  t.uses = RESOURCES.filter((r) => uses.has(r));
  t.may_pin = mayPin;
  t.irreversible = irreversible;
  t.failures = [...f].sort();
  done.add(name);
  return t;
}
tasks[T.consume]._waitUntilWithoutElse = true;
tasks[T.deposit].may_pin = true;
for (const name of Object.keys(tasks)) infer(name);
for (const t of Object.values(tasks)) {
  delete t._calls;
  delete t._waitUntilWithoutElse;
}
const footprint = (...callees) => RESOURCES.filter((r) => callees.some((c) => tasks[c].uses.includes(r)));

// ---------- activities (§17.8) and the bot (§12) ----------

const activities = {};
{
  // auto_eat(min_food = 14): when bot.food < min_food for 2s until bot.food >= full { consume(SAFE_FOOD) }
  const decl = SURV.at("pub activity auto_eat(min_food: Int = 14, full: Int = 18, priority: Int = 50) {");
  const h = decl.next("when bot.food < min_food for 2s until bot.food >= full {");
  const body = decl.next("consume(SAFE_FOOD)");
  const c = new Chart("auto_eat/0", {});
  const init = tr(null, [], c.id("0"));
  c.add("", { kind: "scope", defers: false, initial: init, span: h.span });
  c.add("0", {
    kind: "composite_call", callee: T.consume, args: [E.cnst(body.sub("SAFE_FOOD"), "golem.filters.SAFE_FOOD", "ItemFilter")],
    result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("restart")), span: body.span,
  });
  c.add("restart", { kind: "restart", next: init, span: null });
  const lt = h.sub("bot.food < min_food");
  const ge = h.sub("bot.food >= full");
  activities.auto_eat = {
    activity: "golem.survival.auto_eat",
    params: { full: 18, min_food: 14, priority: 50 },
    attached_to: null,
    attach_args: null,
    param_types: [{ name: "min_food", type: "Int", default: 14 }, { name: "full", type: "Int", default: 18 }, { name: "priority", type: "Int", default: 50 }],
    vars: [],
    handlers: [{
      index: 0,
      trigger: {
        kind: "when",
        cond: E.bin(lt, "<", botProp(lt.sub("bot.food"), "food", "Int"), E.aparam(lt.sub("min_food"), "min_food", "Int"), "Bool"),
        debounce: 40,
        until: E.bin(ge, ">=", botProp(ge.sub("bot.food"), "food", "Int"), E.aparam(ge.sub("full"), "full", "Int"), "Bool"),
      },
      options: { priority: 50, backoff: 100, queue: 0 },
      footprint: footprint(T.consume),
      bounded: true,
      text: "when bot.food < min_food for 2s until bot.food >= full",
      chart: c.toJSON(),
      span: decl.next("@priority priority").to(decl.next("        consume(SAFE_FOOD)\n    }")).span,
    }],
    span: decl.span,
  };
}
{
  // defend(radius = 6.0)
  const decl = SURV.at("pub activity defend(radius: Float = 6.0, priority: Int = 80) {");
  const h = decl.next("when threat(FIGHTABLE, radius) != none for 5t until threat(FIGHTABLE, radius + 4.0) == none {");
  const s0 = decl.next("let t = threat(FIGHTABLE, radius + 4.0) else { return }");
  const s1 = decl.next("fight(t)");
  const threat = (k, dist) => E.call(k, "golem.survival.threat", "Entity?", "free", null, [E.cnst(k.sub("FIGHTABLE"), "golem.filters.FIGHTABLE", "EntityFilter"), dist]);
  const plus4 = (k) => E.bin(k, "+", E.aparam(k.sub("radius"), "radius", "Float"), float(k.sub("4.0"), 4.0), "Float");
  const c = new Chart("defend/0", { $t0: "Entity?", t: "Entity" });
  const t0 = s0.sub("threat(FIGHTABLE, radius + 4.0)");
  const init = tr(null, [A.bind(s0, "$t0", threat(t0, plus4(t0.sub("radius + 4.0"))))], c.id("0"));
  c.add("", { kind: "scope", defers: false, initial: init, span: h.span });
  c.add("0", {
    kind: "choice",
    transitions: [
      tr(E.isNone(s0, local(s0, "$t0", "Entity?")), [A.ret(s0.sub("return"))], c.id("restart")),
      tr(null, [A.bind(s0, "t", E.unwrap(s0, local(s0, "$t0", "Entity?"), "Entity"))], c.id("1")),
    ],
    span: s0.span,
  });
  c.add("1", {
    kind: "composite_call", callee: T.fight, args: [local(s1.sub("t"), "t", "Entity")],
    result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("restart")), span: s1.span,
  });
  c.add("restart", { kind: "restart", next: init, span: null });
  const w1 = h.sub("threat(FIGHTABLE, radius) != none");
  const w2 = h.sub("threat(FIGHTABLE, radius + 4.0) == none");
  const th1 = w1.sub("threat(FIGHTABLE, radius)");
  const th2 = w2.sub("threat(FIGHTABLE, radius + 4.0)");
  activities.defend = {
    activity: "golem.survival.defend",
    params: { priority: 80, radius: 6.0 },
    attached_to: null,
    attach_args: null,
    param_types: [{ name: "radius", type: "Float", default: 6.0 }, { name: "priority", type: "Int", default: 80 }],
    vars: [],
    handlers: [{
      index: 0,
      trigger: {
        kind: "when",
        cond: E.bin(w1, "!=", threat(th1, E.aparam(th1.sub("radius"), "radius", "Float")), none(w1.sub("none"), "Entity?"), "Bool"),
        debounce: 5,
        until: E.bin(w2, "==", threat(th2, plus4(th2.sub("radius + 4.0"))), none(w2.sub("none"), "Entity?"), "Bool"),
      },
      options: { priority: 80, backoff: 100, queue: 0 },
      footprint: footprint(T.fight),
      bounded: true,
      text: "when threat(FIGHTABLE, radius) != none for 5t until threat(FIGHTABLE, radius + 4.0) == none",
      chart: c.toJSON(),
      span: decl.next("@priority priority").to(decl.next("        fight(t)\n    }")).span,
    }],
    span: decl.span,
  };
}
{
  // stay_afloat(): when bot.in_water && bot.oxygen < 100 until !bot.in_water || bot.oxygen >= 300 { hold_jump() }
  const decl = SURV.at("pub activity stay_afloat(priority: Int = 70) {");
  const h = decl.next("when bot.in_water && bot.oxygen < 100 until !bot.in_water || bot.oxygen >= 300 {");
  const s0 = decl.next("hold_jump()");
  const c = new Chart("stay_afloat/0", {});
  const init = tr(null, [], c.id("0"));
  c.add("", { kind: "scope", defers: false, initial: init, span: h.span });
  // An ongoing call as the last statement of a when ... until body never completes; until ends it (§11.4).
  c.add("0", { kind: "extern_call", callee: T.holdJump, args: [], result: null, mode: "sync", deferred: false, next: null, span: s0.span });
  c.add("restart", { kind: "restart", next: init, span: null });
  const cond = h.sub("bot.in_water && bot.oxygen < 100");
  const until = h.sub("!bot.in_water || bot.oxygen >= 300");
  const hspan = decl.next("@priority priority").to(decl.next("        hold_jump()\n    }")).span;
  activities.stay_afloat = {
    activity: "golem.survival.stay_afloat",
    params: { priority: 70 },
    attached_to: null,
    attach_args: null,
    param_types: [{ name: "priority", type: "Int", default: 70 }],
    vars: [],
    handlers: [{
      index: 0,
      trigger: {
        kind: "when",
        cond: E.logic(cond, "&&", botProp(cond.sub("bot.in_water"), "in_water", "Bool"),
          E.bin(cond.sub("bot.oxygen < 100"), "<", botProp(cond.sub("bot.oxygen"), "oxygen", "Int"), int(cond.sub("100"), 100), "Bool")),
        debounce: 1,
        until: E.logic(until, "||", E.un(until.sub("!bot.in_water"), "!", botProp(until.sub("bot.in_water"), "in_water", "Bool"), "Bool"),
          E.bin(until.sub("bot.oxygen >= 300"), ">=", botProp(until.sub("bot.oxygen"), "oxygen", "Int"), int(until.sub("300"), 300), "Bool")),
      },
      options: { priority: 70, backoff: 100, queue: 0 },
      footprint: footprint(T.holdJump),
      bounded: false,
      text: "when bot.in_water && bot.oxygen < 100 until !bot.in_water || bot.oxygen >= 300",
      chart: c.toJSON(),
      span: hspan,
    }],
    span: decl.span,
  };
}
{
  // auto_respawn(): on died(_) { wait delay; respawn() }
  const decl = SURV.at("pub activity auto_respawn(delay: Duration = 1s, priority: Int = 1000) {");
  const h = decl.next("on died(_) {");
  const s0 = decl.next("wait delay");
  const s1 = decl.next("respawn()");
  const c = new Chart("auto_respawn/0", {});
  c.add("", { kind: "scope", defers: false, initial: tr(null, [], c.id("0")), span: h.span });
  c.add("0", { kind: "wait", duration: E.aparam(s0.sub("delay"), "delay", "Duration"), next: tr(null, [], c.id("1")), span: s0.span });
  c.add("1", { kind: "extern_call", callee: T.respawn, args: [], result: null, mode: "sync", deferred: false, next: tr(null, [], c.id("end")), span: s1.span });
  c.add("end", { kind: "final", span: null });
  const hspan = decl.next("@priority priority").to(decl.next("        respawn()\n    }")).span;
  activities.auto_respawn = {
    activity: "golem.survival.auto_respawn",
    params: { delay: 20, priority: 1000 },
    attached_to: null,
    attach_args: null,
    param_types: [{ name: "delay", type: "Duration", default: 20 }, { name: "priority", type: "Int", default: 1000 }],
    vars: [],
    handlers: [{
      index: 0,
      trigger: { kind: "on", event: "died", binders: [null], guard: null },
      options: { priority: 1000, backoff: 100, queue: 0 },
      footprint: footprint(T.respawn),
      bounded: true,
      text: "on died(_)",
      chart: c.toJSON(),
      span: hspan,
    }],
    span: decl.span,
  };
}

// Job roots (§18.1 step 7): one composite call of the job task with the job's parameters (PD-43).
function jobRoot(task, params, result, decl) {
  const c = new Chart(`job:${task}`, result === "Unit" ? {} : { $t0: result });
  c.add("", { kind: "scope", defers: false, initial: tr(null, [], c.id("0")), span: null });
  c.add("0", {
    kind: "composite_call", callee: task, args: params.map((p) => E.param(decl.sub(p.name), p.name, p.type)),
    result: result === "Unit" ? null : "$t0", mode: "sync", deferred: false,
    next: tr(null, result === "Unit" ? [A.ret(decl)] : [A.ret(decl, E.local(decl, "$t0", result))], c.id("end")),
    span: decl.span,
  });
  c.add("end", { kind: "final", span: null });
  return c.toJSON();
}
const bot = {
  name: "Lumberjack",
  instances: ["auto_eat", "defend", "stay_afloat", "auto_respawn"],
  jobs: {
    [T.chop]: {
      params: tasks[T.chop].params,
      result: "Int",
      attaches: [],
      root: jobRoot(T.chop, tasks[T.chop].params, "Int", WOOD.at("pub task chop_trees(area: Region, target: Int) -> Int")),
    },
    [T.stash]: {
      params: tasks[T.stash].params,
      result: "Int",
      attaches: [],
      root: jobRoot(T.stash, tasks[T.stash].params, "Int", WOOD.at("pub task stash_logs(chest: BlockPos) -> Int")),
    },
  },
  start: { job: T.chop, args: { area: { min: [0, 60, 0], max: [47, 79, 47] }, target: 64 } },
  settings: { job_priority: 10, confirm_timeout: 100, max_pending: 8, atomic_limit: 100, reconnect_delay: 200, max_reconnects: 5 },
};

// ---------- types, failures, notices, consts ----------

const fieldsOf = (src, text) => src.at(text).span;
const types = {
  Face: { kind: "enum", variants: ["Down", "Up", "North", "South", "West", "East"].map((name) => ({ name, fields: [] })), traits: { eq: true, ord: true, wire: true }, span: null },
  Hand: { kind: "enum", variants: [{ name: "Main", fields: [] }, { name: "Off", fields: [] }], traits: { eq: true, ord: true, wire: true }, span: null },
  Goal: {
    kind: "enum",
    variants: [
      { name: "At", fields: [{ name: "pos", type: "BlockPos" }] },
      { name: "Near", fields: [{ name: "pos", type: "BlockPos" }, { name: "radius", type: "Float" }] },
      { name: "XZ", fields: [{ name: "x", type: "Int" }, { name: "z", type: "Int" }] },
      { name: "Y", fields: [{ name: "y", type: "Int" }] },
      { name: "InReach", fields: [{ name: "pos", type: "BlockPos" }] },
      { name: "NearEntity", fields: [{ name: "target", type: "Entity" }, { name: "radius", type: "Float" }] },
      { name: "Away", fields: [{ name: "center", type: "Vec3" }, { name: "radius", type: "Float" }] },
      { name: "AnyOf", fields: [{ name: "goals", type: "List<Goal>" }] },
      { name: "AllOf", fields: [{ name: "goals", type: "List<Goal>" }] },
      { name: "Clear", fields: [{ name: "pos", type: "BlockPos" }] },
    ],
    traits: { eq: false, ord: false, wire: false },
    span: PRE.at("pub enum Goal {").span,
  },
  PathOpts: { kind: "struct", fields: [{ name: "avoid", type: "Region?", default: null }], traits: { eq: true, ord: false, wire: true }, span: PRE.at("pub struct PathOpts(avoid: Region? = none)").span },
  [ANYKIND]: { kind: "struct", fields: [], traits: { eq: true, ord: true, wire: true }, window_kind: {
    menu_types: ["minecraft:generic_9x1", "minecraft:generic_9x2", "minecraft:generic_9x3", "minecraft:generic_9x4", "minecraft:generic_9x5", "minecraft:generic_9x6",
      "minecraft:generic_3x3", "minecraft:shulker_box", "minecraft:hopper", "minecraft:crafting", "minecraft:furnace", "minecraft:blast_furnace", "minecraft:smoker",
      "minecraft:stonecutter", "minecraft:loom", "minecraft:enchantment", "minecraft:anvil", "minecraft:grindstone", "minecraft:cartography_table",
      "minecraft:brewing_stand", "minecraft:beacon", "minecraft:merchant", "minecraft:smithing"],
    traits: ["WindowKind", "Screen"] }, span: fieldsOf(WIN, "pub struct AnyKind()") },
  [CONTAINER]: { kind: "struct", fields: [], traits: { eq: true, ord: true, wire: true }, window_kind: {
    menu_types: ["minecraft:generic_9x1", "minecraft:generic_9x2", "minecraft:generic_9x3", "minecraft:generic_9x4", "minecraft:generic_9x5", "minecraft:generic_9x6",
      "minecraft:generic_3x3", "minecraft:shulker_box", "minecraft:hopper"],
    traits: ["WindowKind", "Screen", "HasContainer"] }, span: fieldsOf(WIN, "pub struct Container()") },
  [PLAYERINV]: { kind: "struct", fields: [], traits: { eq: true, ord: true, wire: true }, window_kind: { menu_types: [], traits: ["WindowKind", "CraftingStation"], grid: [2, 2] }, span: fieldsOf(WIN, "pub struct PlayerInventory()") },
};
const failureDecl = (src, text, wire, fields) => ({ wire_name: wire, fields: fields.map(([name, type]) => ({ name, type })), span: src.at(text).span });
const failures = {
  [FL.NoPath]: failureDecl(PRIM, "pub failure NoPath(at: BlockPos)", "NoPath", [["at", "BlockPos"]]),
  [FL.OutOfReach]: failureDecl(PRIM, "pub failure OutOfReach(pos: BlockPos)", "OutOfReach", [["pos", "BlockPos"]]),
  [FL.EntityGone]: failureDecl(PRIM, "pub failure EntityGone(id: Int)", "EntityGone", [["id", "Int"]]),
  [FL.NotBreakable]: failureDecl(PRIM, "pub failure NotBreakable(pos: BlockPos)", "NotBreakable", [["pos", "BlockPos"]]),
  [FL.BlockChanged]: failureDecl(PRIM, "pub failure BlockChanged(pos: BlockPos)", "BlockChanged", [["pos", "BlockPos"]]),
  [FL.CannotPut]: failureDecl(PRIM, "pub failure CannotPut(slot: Int)", "CannotPut", [["slot", "Int"]]),
  [FL.NoRoom]: failureDecl(PRIM, "pub failure NoRoom(slot: Int)", "NoRoom", [["slot", "Int"]]),
  [FL.CursorNotEmpty]: failureDecl(PRIM, "pub failure CursorNotEmpty", "CursorNotEmpty", []),
  [FL.Missing]: failureDecl(CORE, "pub failure Missing(item: ItemFilter, n: Int)", "Missing", [["item", "ItemFilter"], ["n", "Int"]]),
  [FL.WrongTool]: failureDecl(CORE, "pub failure WrongTool(pos: BlockPos)", "WrongTool", [["pos", "BlockPos"]]),
  [FL.NotHungry]: failureDecl(CORE, "pub failure NotHungry", "NotHungry", []),
  [FL.ScreenBusy]: failureDecl(CORE, "pub failure ScreenBusy", "ScreenBusy", []),
  [FL.NotOpened]: failureDecl(CORE, "pub failure NotOpened(pos: BlockPos)", "NotOpened", [["pos", "BlockPos"]]),
  [FL.WrongKind]: failureDecl(CORE, "pub failure WrongKind(pos: BlockPos)", "WrongKind", [["pos", "BlockPos"]]),
  [FL.NoTrees]: failureDecl(WOOD, "pub failure NoTrees(area: Region)", "NoTrees", [["area", "Region"]]),
  [FL.NotEnoughLogs]: failureDecl(WOOD, "pub failure NotEnoughLogs(have: Int)", "NotEnoughLogs", [["have", "Int"]]),
};
const notices = { "woodcutting.LogMined": failureDecl(WOOD, "pub notice LogMined(pos: BlockPos)", "LogMined", [["pos", "BlockPos"]]) };
// §7.5 consts read at run time, evaluated; associative filter chains are flattened (PD-38).
const consts = {
  "golem.filters.CLEARED": { type: "BlockFilter", value: { any: [{ air: {} }, { liquid: {} }] }, span: FILT.at("pub const CLEARED: BlockFilter = air() | liquid()").span },
  "golem.filters.FIGHTABLE": {
    type: "EntityFilter",
    value: { all: [{ hostile_type: {} }, { not: { entity: "minecraft:creeper" } }, { not: { entity: "minecraft:enderman" } }] },
    span: FILT.at("pub const FIGHTABLE: EntityFilter = HOSTILE & !minecraft:creeper & !minecraft:enderman").span,
  },
  "golem.filters.SAFE_FOOD": {
    type: "ItemFilter",
    value: { all: [{ edible: {} }, { not: { any: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chicken", "suspicious_stew", "chorus_fruit", "golden_apple", "enchanted_golden_apple"].map((i) => ({ item: `minecraft:${i}` })) } }] },
    span: FILT.at("pub const SAFE_FOOD: ItemFilter = FOOD & !(minecraft:rotten_flesh | minecraft:spider_eye | minecraft:poisonous_potato |\n    minecraft:pufferfish | minecraft:chicken | minecraft:suspicious_stew | minecraft:chorus_fruit |\n    minecraft:golden_apple | minecraft:enchanted_golden_apple)").span,
  },
};

// ---------- contracts (§18.2, decision 45) ----------

const contracts = {};
for (const [name, t] of Object.entries(tasks)) {
  contracts[name] = {
    params: t.params,
    result: t.result,
    requires: t.clauses.requires.map((r) => ({ expr: r.expr, text: r.text, point_in_time: false })),
    ensures: t.clauses.ensures.map((e) => ({ expr: e.expr, text: e.text, point_in_time: true })),
  };
}

// ---------- assemble ----------

const ir = {
  header: {
    ir_format: "golem-ir/0.1",
    golem: "0.2",
    minecraft: "1.21.4",
    bot: "Lumberjack",
    source_hash: sourceHash(SOURCES),
    sources: SOURCES.map((s) => ({ path: s.path, sha256: s.sha256 })),
  },
  types: sortKeys(types),
  failures: sortKeys(failures),
  notices: sortKeys(notices),
  consts: sortKeys(consts),
  fns: sortKeys(fns),
  tasks: sortKeys(tasks),
  activities: sortKeys(activities),
  bot: { ...bot, jobs: sortKeys(bot.jobs) },
  contracts: sortKeys(contracts),
};

const text = stringify(ir) + "\n";
if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== text) {
    console.error("examples/Lumberjack.golem-ir.json is stale: run npm run build-examples");
    process.exit(1);
  }
  console.log("lumberjack --check: examples/Lumberjack.golem-ir.json up to date");
} else {
  writeFileSync(OUT, text);
  console.log(`wrote examples/Lumberjack.golem-ir.json (${text.length} bytes)`);
}
