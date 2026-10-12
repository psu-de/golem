// Spike Mineflayer backend: implements the §18.4 Backend shape (contracts/types/backend.d.ts) for the
// primitives the spike exercises: dig, place_block, look_at, pick_up, put, quick_move, pathfind, sneak.
// Packets are sent directly (one per action step) rather than through bot.dig/bot.placeBlock/
// bot.clickWindow; see REPORT.md E2 for why. Not the production backend.
import mineflayer from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import { Vec3 } from "vec3";
import { ClockDriver } from "./clock.mjs";
import { ANY, RULES, settleTicks } from "./attribution.mjs";
import { FACES, FACE_VEC, blockKey, invSlotKey, winSlotKey, entityKey, offset, round, makeCodec, sameValue } from "./keys.mjs";
import { makeGoal, makeMovements } from "./goals.mjs";

const { pathfinder } = pathfinderPkg;
const PROTOCOL = { "1.21.4": 769 };
const CLEARED = /^minecraft:(air|cave_air|void_air|water|lava)(\[|$)/;
// minecraft:menu registry ids for 1.21.4 (cross-checked against the data generator's registries.json in E6).
const MENUS_1_21_4 = ["generic_9x1", "generic_9x2", "generic_9x3", "generic_9x4", "generic_9x5", "generic_9x6", "generic_3x3", "crafter_3x3", "anvil", "beacon", "blast_furnace", "brewing_stand", "crafting", "enchantment", "furnace", "grindstone", "hopper", "lectern", "loom", "merchant", "shulker_box", "smithing", "smoker", "cartography_table", "stonecutter"];

const emptyBuffer = () => ({ infra: [], changes: [], events: [], acks: [], corrections: new Set() });

export class SpikeBackend {
  constructor(opts = {}) {
    this.opts = { flushMode: "deferred", rule: "refined", recordWrites: false, recordStacks: false, keepAttribution: false, ...opts };
    this.clockDriver = opts.clockDriver ?? new ClockDriver();
    this.tickNo = 0;
    this.phase = "between";
    this.writes = [];
    this.queue = [];
    this.actions = new Map();
    this.attr = []; // attribution records of every action (kept for the attribution window)
    this.attrLog = []; // every attributed KeyChange with all rules' answers, when keepAttribution
    this.buf = emptyBuffer();
    this.seq = 0;
    this.ackSeq = -1;
    this.rtt = null;
    this.pings = new Map();
    this.pingId = 1;
    this.connected = false;
    this.cancelLog = []; // E5: cancel times
    this.sameValueBlockUpdates = []; // server block updates that repeat the current value (ghost-block fixes)
    this.blockLog = []; // every server block change with its arrival tick
    this.ackLog = []; // every acknowledge_player_digging with its arrival tick
    this.slotLog = []; // every server window/slot packet with its arrival tick
    this.instrument = {}; // experiment hooks
  }

  // ---------------------------------------------------------------- session (§18.4, PD-2)

  async connect(launch, clock) {
    this.runtimeClock = clock;
    const bot = mineflayer.createBot({
      host: launch.server.host, port: launch.server.port, username: launch.auth.username,
      version: launch.minecraft, auth: "offline", hideErrors: true, checkTimeoutInterval: 30000,
    });
    this.bot = bot;
    this.codec = makeCodec(bot.registry);
    this.#wrapWrite(bot._client);
    bot.loadPlugin(pathfinder);
    this.#resetMirror();
    this.#listen(bot);
    return new Promise((resolve, reject) => {
      let done = false;
      bot.once("login", () => {
        done = true;
        this.connected = true;
        this.buf.infra.push({ infra: "connected", minecraft: launch.minecraft, protocol: PROTOCOL[launch.minecraft] ?? bot.protocolVersion ?? 0, entity_id: bot.entity.id });
        this.#resetMirror(); // a connected event resets the confirmed view (PD-11): re-emit every key
        this.clockDriver.start(() => this.#tick());
        this.clockDriver.attach(bot);
        resolve({ minecraft: launch.minecraft, protocol: PROTOCOL[launch.minecraft] ?? 0, capabilities: { flush: this.opts.flushMode, attribution: "backend" } });
      });
      const fail = (why) => {
        if (done) return;
        done = true;
        this.buf.infra.push({ infra: "connect_failed", reason: String(why).slice(0, 200) });
        reject(new Error(String(why)));
      };
      bot.once("error", fail);
      bot.once("end", fail);
    });
  }

  async disconnect() {
    if (this.bot) this.bot.quit();
    this.clockDriver.stop();
  }

  #tick() {
    this.tickNo = this.clockDriver.tick;
    this.phase = "tick";
    try { this.runtimeClock.tick(); } finally { this.phase = "between"; }
  }

  // ---------------------------------------------------------------- packet gate (S-1)

  #wrapWrite(client) {
    const orig = client.write.bind(client);
    this.rawWrite = (name, params) => {
      if (name === "look" || name === "position_look") this.sentRotation = { yaw: params.yaw, pitch: params.pitch };
      orig(name, params);
    };
    client.write = (name, params) => {
      if (name === "close_window") { this.win = null; this.cursor = null; } // client-side close: same semantics as the server's
      const rec = this.opts.recordWrites ? {
        name, tick: this.clockDriver.tick, inTick: this.clockDriver.inTick, phase: this.clockDriver.inTick ? this.phase : "outside-tick",
        t: performance.now(), stack: this.opts.recordStacks ? callerFrames(new Error().stack) : undefined,
      } : null;
      if (rec) this.writes.push(rec);
      if (this.opts.flushMode === "deferred" && client.state === "play" && !this.flushing) {
        this.queue.push([name, params, rec, this.writingAction ?? null]);
        return;
      }
      if (rec) { rec.sentTick = this.clockDriver.tick; rec.sentPhase = rec.phase; rec.sentAt = rec.t; }
      this.rawWrite(name, params);
    };
  }

  flush() {
    this.phase = "flush";
    for (const a of this.actions.values()) a.step?.(this.tickNo);
    if (this.connected && this.tickNo % 20 === 0) {
      const id = this.pingId++;
      this.pings.set(id, null);
      this.queue.push(["ping_request", { id: BigInt(id) }, null]);
      this.pingFlushId = id;
    }
    this.flushing = true;
    try {
      for (const [name, params, rec] of this.queue) {
        if (rec) { rec.sentTick = this.tickNo; rec.sentPhase = "flush"; rec.sentAt = performance.now(); }
        if (name === "ping_request") this.pings.set(Number(params.id), performance.now());
        if (this.bot?._client?.state === "play") this.rawWrite(name, params);
      }
    } finally {
      this.queue = [];
      this.flushing = false;
      this.phase = "tick";
    }
  }

  // ---------------------------------------------------------------- server mirror

  #resetMirror() {
    this.emitted = new Map(); // key -> last value handed to the runtime
    this.inv = new Array(46).fill(null);
    this.cursor = null;
    this.win = null; // { id, generation, kind, slots: [], playerStart }
    this.generation = this.generation ?? 0;
    this.stateId = 0;
    this.health = null; this.food = null; this.saturation = null;
    this.dead = false;
    this.dirtyEntities = new Set();
    this.knownEntities = new Map();
    this.attributes = {};
  }

  #listen(bot) {
    const c = bot._client;
    // Block data from the server only (never Mineflayer's local predictions). prependListener runs
    // before Mineflayer's handler, so the world still holds the previous value.
    c.prependListener("block_change", (p) => this.#serverBlock([p.location.x, p.location.y, p.location.z], p.type));
    c.prependListener("multi_block_change", (p) => {
      const { x: sx, y: sy, z: sz } = p.chunkCoordinates;
      for (const r of p.records) {
        const v = typeof r === "bigint" ? Number(r) : r;
        const id = Math.floor(v / 4096);
        const local = v % 4096;
        this.#serverBlock([sx * 16 + ((local >> 8) & 15), sy * 16 + (local & 15), sz * 16 + ((local >> 4) & 15)], id);
      }
    });
    c.on("acknowledge_player_digging", (p) => {
      this.ackSeq = Math.max(this.ackSeq, p.sequenceId);
      this.buf.acks.push({ seq: p.sequenceId, t: performance.now(), tick: this.clockDriver.tick });
      this.ackLog.push({ seq: p.sequenceId, tick: this.clockDriver.tick });
    });
    bot.on("chunkColumnLoad", (pos) => this.buf.changes.push({ deferredChunk: [pos.x >> 4, pos.z >> 4] }));
    bot.on("chunkColumnUnload", (pos) => this.buf.changes.push({ chunk_unload: { x: pos.x >> 4, z: pos.z >> 4 } }));

    // Player corrections and server-set state.
    c.on("position", () => { this.buf.corrections.add("player.position"); this.buf.corrections.add("player.rotation"); this.correctedRotation = true; });
    c.on("player_rotation", () => { this.buf.corrections.add("player.rotation"); this.correctedRotation = true; });
    c.on("update_health", (p) => {
      if (this.health != null && p.health < this.health) this.buf.events.push({ event: "hurt", amount: round(this.health - p.health), attacker: this.pendingAttacker ?? null });
      this.pendingAttacker = null;
      this.health = p.health; this.food = p.food; this.saturation = p.foodSaturation;
    });
    c.on("damage_event", (p) => { if (p.entityId === bot.entity?.id) this.pendingAttacker = p.sourceCauseId > 0 ? { entity: p.sourceCauseId - 1 } : null; });
    c.on("entity_update_attributes", (p) => {
      if (p.entityId !== bot.entity?.id) return;
      for (const a of p.properties) this.attributes[a.key.includes(":") ? a.key : `minecraft:${a.key}`] = a.value;
    });

    // Inventory and windows, from packets (the server's view), plus our own clicks' claims (see #click).
    c.on("window_items", (p) => { this.slotLog.push({ packet: "window_items", windowId: p.windowId, stateId: p.stateId, tick: this.clockDriver.tick }); this.#windowItems(p); });
    c.on("set_slot", (p) => { this.slotLog.push({ packet: "set_slot", windowId: p.windowId, slot: p.slot, stateId: p.stateId, tick: this.clockDriver.tick }); this.#setSlot(p); });
    c.on("set_cursor_item", (p) => { this.cursor = this.codec.stack(this.codec.fromNotch(p.contents)); this.#noteServerSlot("inventory.cursor"); });
    c.on("set_player_inventory", (p) => {
      const i = p.slotId < 9 ? 36 + p.slotId : p.slotId < 36 ? p.slotId : p.slotId < 40 ? 8 - (p.slotId - 36) : 45;
      this.inv[i] = this.codec.stack(this.codec.fromNotch(p.contents));
      this.#noteServerSlot(invSlotKey(i));
    });
    c.on("open_window", (p) => {
      this.generation++;
      const kind = typeof p.inventoryType === "string" ? p.inventoryType : MENUS_1_21_4[p.inventoryType] ?? `unknown_menu_${p.inventoryType}`;
      const rows = { "minecraft:generic_9x1": 1, "minecraft:generic_9x2": 2, "minecraft:generic_9x3": 3, "minecraft:generic_9x4": 4, "minecraft:generic_9x5": 5, "minecraft:generic_9x6": 6 }[ns(kind)] ?? 3;
      this.win = { id: p.windowId, generation: this.generation, kind: ns(kind), slots: new Array(rows * 9 + 36).fill(null), playerStart: rows * 9 };
      this.buf.events.push({ event: "window_opened", menu_type: ns(kind) });
    });
    // Vanilla client semantics: the carried stack belongs to the menu, so closing the window empties the
    // cursor; the server puts the stack back into the inventory (or drops it) and sends those slots.
    c.on("close_window", () => { this.win = null; this.cursor = null; this.buf.events.push({ event: "window_closed" }); });

    // Entities (server data; Mineflayer does not predict entities).
    bot.on("entitySpawn", (e) => { if (e !== bot.entity) { this.dirtyEntities.add(e.id); this.knownEntities.set(e.id, e); this.buf.events.push({ event: "entity_appeared", e: { entity: e.id } }); } });
    bot.on("entityMoved", (e) => { if (e !== bot.entity) this.dirtyEntities.add(e.id); });
    bot.on("entityUpdate", (e) => { if (e !== bot.entity) this.dirtyEntities.add(e.id); });
    bot.on("entityGone", (e) => {
      if (e === bot.entity) return;
      this.dirtyEntities.add(e.id);
      this.buf.events.push({ event: "entity_gone", id: e.id, kind: `minecraft:${e.name ?? "unknown"}` });
    });
    bot.on("playerCollect", (collector, collected) => {
      if (collector !== bot.entity) return;
      const st = this.codec.stack(collected.getDroppedItem?.());
      if (st) this.buf.events.push({ event: "item_collected", stack: st });
    });

    // Chat.
    bot.on("chat", (username, message) => this.buf.events.push({ event: "chat", sender: username, text: message }));
    bot.on("whisper", (username, message) => this.buf.events.push({ event: "whisper", sender: username, text: message }));
    bot.on("messagestr", (msg, position) => { if (position === "system") this.buf.events.push({ event: "system", text: msg.slice(0, 1000) }); });

    // Infrastructure.
    bot.on("spawn", () => { this.dead = false; this.buf.infra.push({ infra: "spawned" }); });
    bot.on("death", () => { this.dead = true; this.buf.infra.push({ infra: "died", reason: "death" }); });
    bot.on("kicked", (reason) => { this.kicked = true; this.buf.infra.push({ infra: "kicked", reason: textOf(reason).slice(0, 200) }); });
    bot.on("end", (reason) => {
      if (!this.connected || bot !== this.bot) return;
      this.connected = false;
      if (!this.kicked) this.buf.infra.push({ infra: "disconnected", reason: String(reason ?? "end").slice(0, 200) });
      this.kicked = false;
      this.clockDriver.detach(); // the clock keeps running on its local timer
      for (const a of this.actions.values()) a.dead = true;
      this.actions.clear();
      this.queue = [];
    });

    c.on("ping_response", (p) => {
      const id = Number(p.id);
      const sent = this.pings.get(id);
      if (sent != null) this.rtt = Math.round(performance.now() - sent);
      this.pings.delete(id);
    });
    bot.on("path_update", (r) => this.pathfindAction?.onPathUpdate(r));
    bot.on("goal_reached", () => this.pathfindAction?.onGoalReached(this.clockDriver.tick));
  }

  #serverBlock(pos, stateId) {
    const old = this.bot.world.getBlockStateId(new Vec3(...pos));
    if (old === stateId) { this.sameValueBlockUpdates.push({ pos, tick: this.clockDriver.tick, value: this.codec.stateString(stateId) }); return; }
    this.blockLog.push({ pos, tick: this.clockDriver.tick, value: this.codec.stateString(stateId) });
    this.buf.changes.push({ key: blockKey(pos), value: this.codec.stateString(stateId) });
  }

  #playerSlot(winSlot) { return winSlot - this.win.playerStart + 9; }

  #windowItems(p) {
    this.stateId = p.stateId;
    queueMicrotask(() => { for (const a of this.actions.values()) a.onResync?.(p.windowId); });
    const items = p.items.map((s) => this.codec.stack(this.codec.fromNotch(s)));
    if (p.windowId === 0) {
      items.forEach((s, i) => { if (i < 46) { this.inv[i] = s; this.#noteServerSlot(invSlotKey(i)); } });
    } else if (this.win && p.windowId === this.win.id) {
      items.forEach((s, i) => {
        if (i >= this.win.slots.length) return;
        this.win.slots[i] = s;
        this.#noteServerSlot(winSlotKey(i));
        if (i >= this.win.playerStart) { this.inv[this.#playerSlot(i)] = s; this.#noteServerSlot(invSlotKey(this.#playerSlot(i))); }
      });
    }
    this.cursor = this.codec.stack(this.codec.fromNotch(p.carriedItem));
    this.#noteServerSlot("inventory.cursor");
  }

  #setSlot(p) {
    this.stateId = p.stateId;
    const s = this.codec.stack(this.codec.fromNotch(p.item));
    if (p.windowId === -1 && p.slot === -1) { this.cursor = s; this.#noteServerSlot("inventory.cursor"); return; }
    if (p.windowId === 0) { this.inv[p.slot] = s; this.#noteServerSlot(invSlotKey(p.slot)); return; }
    if (this.win && p.windowId === this.win.id && p.slot < this.win.slots.length) {
      this.win.slots[p.slot] = s;
      this.#noteServerSlot(winSlotKey(p.slot));
      if (p.slot >= this.win.playerStart) { this.inv[this.#playerSlot(p.slot)] = s; this.#noteServerSlot(invSlotKey(this.#playerSlot(p.slot))); }
    }
  }

  // A server slot packet: settle-confirmed actions that predicted this key check it against the prediction.
  #noteServerSlot(key) {
    for (const a of this.actions.values()) a.onServerSlot?.(key, this.#mirrorValue(key));
  }

  #mirrorValue(key) {
    if (key === "inventory.cursor") return this.cursor;
    let m = /^inventory\.slot\((\d+)\)$/.exec(key);
    if (m) return this.inv[+m[1]];
    m = /^window\.slot\((\d+)\)$/.exec(key);
    if (m) return this.win?.slots[+m[1]] ?? null;
    return undefined;
  }

  // ---------------------------------------------------------------- ingest (phase 1)

  ingest() {
    this.phase = "ingest";
    const t = this.tickNo;
    const bot = this.bot;
    const buf = this.buf;
    this.buf = emptyBuffer();
    const raw = [];
    const meta = new Map(); // change -> { correction }

    // Buffered server changes, in arrival order. Chunk loads are encoded now (the column is complete).
    for (const ch of buf.changes) {
      if (ch.deferredChunk) { const cl = this.#chunkLoad(...ch.deferredChunk); if (cl) raw.push(cl); }
      else raw.push(ch);
    }
    // Entities.
    for (const id of this.dirtyEntities) {
      const e = bot?.entities[id];
      const alive = !!e && e.isValid !== false;
      const known = this.knownEntities.get(id);
      const ent = e ?? known;
      if (!ent) continue;
      this.#diff(raw, entityKey(id, "type"), `minecraft:${ent.name ?? "unknown"}`);
      if (alive) this.#diff(raw, entityKey(id, "position"), [round(ent.position.x), round(ent.position.y), round(ent.position.z)]);
      if (ent.name === "item") this.#diff(raw, entityKey(id, "item"), this.codec.stack(ent.getDroppedItem?.()) ?? null);
      this.#diff(raw, entityKey(id, "alive"), alive);
      if (!alive) this.knownEntities.delete(id);
    }
    this.dirtyEntities.clear();
    // Player, inventory and window snapshot keys.
    if (bot?.entity && this.connected) {
      const p = bot.entity.position;
      if (Number.isFinite(p.x)) {
        const ch = this.#diff(raw, "player.position", [round(p.x, 5), round(p.y, 5), round(p.z, 5)]);
        if (ch && buf.corrections.has("player.position")) meta.set(ch, { correction: true });
      }
      if (this.sentRotation || this.correctedRotation) {
        // Vanilla convention in radians: yaw clockwise from south (+z), pitch positive looking down.
        const src = this.correctedRotation ? { yaw: (180 / Math.PI) * (Math.PI - bot.entity.yaw), pitch: (180 / Math.PI) * -bot.entity.pitch } : this.sentRotation;
        const rot = { yaw: round(normAngle(deg2rad(src.yaw)), 4), pitch: round(deg2rad(src.pitch), 4) };
        const ch = this.#diff(raw, "player.rotation", rot);
        if (ch && buf.corrections.has("player.rotation")) meta.set(ch, { correction: true });
        this.correctedRotation = false;
      }
      if (this.health != null) {
        this.#diff(raw, "player.health", round(this.health, 3));
        this.#diff(raw, "player.food", this.food);
        this.#diff(raw, "player.saturation", round(this.saturation, 3));
      }
      this.#diff(raw, "player.on_ground", !!bot.entity.onGround);
      this.#diff(raw, "player.in_water", !!bot.entity.isInWater);
      this.#diff(raw, "player.in_lava", !!bot.entity.isInLava);
      this.#diff(raw, "player.sneaking", bot.getControlState("sneak"));
      this.#diff(raw, "player.sprinting", bot.getControlState("sprint"));
      this.#diff(raw, "player.dead", this.dead);
      if (bot.quickBarSlot != null) this.#diff(raw, "player.held_slot", bot.quickBarSlot);
      if (bot.game?.dimension) this.#diff(raw, "player.dimension", ns(bot.game.dimension));
      for (const [k, v] of Object.entries(this.attributes)) this.#diff(raw, `player.attribute(${k})`, round(v, 4));
      for (let i = 0; i < 46; i++) this.#diff(raw, invSlotKey(i), this.inv[i]);
      this.#diff(raw, "inventory.cursor", this.cursor);
      this.#diff(raw, "window.id", this.win ? { window: this.win.id, generation: this.win.generation } : null);
      this.#diff(raw, "window.kind", this.win?.kind ?? null);
      if (this.win) this.win.slots.forEach((s, i) => this.#diff(raw, winSlotKey(i), s));
      if (bot.time?.timeOfDay != null) this.#diff(raw, "world.time_of_day", ((bot.time.timeOfDay % 24000) + 24000) % 24000);
      this.#diff(raw, "world.weather", { raining: !!bot.isRaining, thundering: (bot.thunderState ?? 0) > 0 });
    }

    // Action verdicts first: a change in the verdict's own TickInput counts as before the verdict (PD-11).
    const reports = [];
    for (const a of [...this.actions.values()]) {
      for (const r of a.evaluate(t, buf)) {
        reports.push(r);
        if (["Confirmed", "Rejected", "Failed"].includes(r.status)) {
          a.rec.verdictTick = t;
          a.rec.verdict = r.status;
          this.actions.delete(a.id);
          if (this.pathfindAction === a) this.pathfindAction = null;
        }
      }
    }

    // Attribution (§14.5): the configured rule tags; every rule's answer is kept for E4.
    const changes = [];
    for (const ch of raw) {
      if (!("key" in ch)) { changes.push(ch); continue; }
      const m = meta.get(ch) ?? {};
      const rule = RULES[this.opts.rule];
      const cause = rule(this.attr, ch, t, this.rtt, m);
      changes.push({ key: ch.key, value: ch.value, cause });
      if (this.opts.keepAttribution) {
        this.attrLog.push({ tick: t, key: ch.key, value: ch.value, correction: !!m.correction, wall: performance.now(),
          answers: Object.fromEntries(Object.entries(RULES).map(([n, f]) => [n, f(this.attr, ch, t, this.rtt, m)])) });
      }
    }
    // Keep attribution records only as long as some rule can still use them.
    const horizon = t - settleTicks(this.rtt) - 2;
    if (!this.opts.keepAttribution) this.attr = this.attr.filter((a) => a.verdictTick == null || a.verdictTick >= horizon);

    const input = {
      tick: t,
      infra: buf.infra,
      changes,
      events: buf.events,
      reports,
      measurements: { path_progress: this.pathfindAction ? this.pathfindAction.progress() : null, round_trip_ms: this.rtt },
    };
    this.lastAcks = buf.acks;
    this.phase = "tick";
    return input;
  }

  #diff(out, key, value) {
    const prev = this.emitted.get(key);
    if (prev !== undefined && sameValue(prev, value)) return null;
    this.emitted.set(key, value);
    const ch = { key, value };
    out.push(ch);
    return ch;
  }

  #chunkLoad(cx, cz) {
    const col = this.bot.world.getColumn(cx, cz);
    if (!col) return null;
    const minY = col.minY ?? -64;
    const height = col.worldHeight ?? 384;
    const palette = [];
    const index = new Map();
    const runs = [];
    let last = -1;
    const v = new Vec3(0, 0, 0);
    for (let y = minY; y < minY + height; y++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          v.x = x; v.y = y; v.z = z;
          const id = col.getBlockStateId(v);
          let pi = index.get(id);
          if (pi === undefined) { pi = palette.length; index.set(id, pi); palette.push(this.codec.stateString(id)); }
          if (pi === last) runs[runs.length - 1][1]++;
          else { runs.push([pi, 1]); last = pi; }
        }
      }
    }
    return { chunk_load: { x: cx, z: cz, min_y: minY, height, palette, runs } };
  }

  // ---------------------------------------------------------------- actions (phase 6)

  start(action, primitive, args, mode) {
    this.phase = "start";
    try {
      const Kind = PRIMITIVES[primitive];
      if (!Kind) throw new Error(`spike backend does not implement ${primitive}`);
      const a = new Kind(this, action, args, mode, this.tickNo);
    Object.assign(a, this.instrument.nextActionOverrides ?? {});
    this.instrument.nextActionOverrides = null;
      this.actions.set(action, a);
      a.rec = { id: action, primitive, start: this.tickNo, verdictTick: null, verdict: null, cancelled: null, rolledBack: null, affected: a.affected() };
      this.attr.push(a.rec);
      this.writingAction = action;
      let delta;
      try { delta = a.begin(); } finally { this.writingAction = null; }
      return mode === "async" ? delta : undefined;
    } finally { this.phase = "tick"; }
  }

  cancel(action) {
    this.phase = "cancel";
    try {
      const a = this.actions.get(action);
      if (!a) return;
      a.rec.cancelled = this.tickNo;
      // Deferred flush: packets of this action still queued (started this tick) are never sent.
      const before = this.queue.length;
      this.queue = this.queue.filter((e) => e[3] !== action);
      a.unsent = before - this.queue.length;
      this.unsentLog = this.unsentLog ?? [];
      if (a.unsent) this.unsentLog.push({ action, tick: this.tickNo, packets: a.unsent });
      if (!a.unsent) a.cancel?.();
      this.actions.delete(action);
      if (this.pathfindAction === a) this.pathfindAction = null;
    } finally { this.phase = "tick"; }
  }

  // Async rollback (§14.4): the runtime tells the spike backend which action was rolled back, so
  // later changes it causes are Outside. (Not in the 0.1 interface: see ESCALATIONS.md SE-3.)
  markRolledBack(action) {
    const rec = this.attr.find((r) => r.id === action);
    if (rec) rec.rolledBack = this.tickNo;
  }

  nextSeq() { return ++this.seq; }

  heldSlot() { return 36 + (this.bot.quickBarSlot ?? 0); }

  // Aims at target. "direct" (default) writes the look packet now, so in the same flush it precedes
  // the action's own packets (the server reads the player's rotation when it places stairs, chests,
  // furnaces ...). "physics" leaves it to Mineflayer's physics step, which in deferred mode sends it
  // one flush after the action's packets (E6 shows the consequence).
  lookPacket(target) {
    const bot = this.bot;
    const eye = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
    const d = target.minus(eye);
    const yaw = Math.atan2(-d.x, -d.z);
    const pitch = Math.atan2(d.y, Math.sqrt(d.x * d.x + d.z * d.z));
    bot.look(yaw, pitch, true); // force: also updates Mineflayer's last-sent rotation
    if (this.opts.lookMode !== "physics") {
      const og = !!bot.entity.onGround;
      bot._client.write("look", { yaw: (180 / Math.PI) * (Math.PI - yaw), pitch: (180 / Math.PI) * -pitch, onGround: og, flags: { onGround: og, hasHorizontalCollision: false } });
    }
  }
}

// ------------------------------------------------------------------ primitives

class Dig {
  constructor(be, id, args, mode, tick) { Object.assign(this, { be, id, args, mode, startTick: tick }); this.pos = args.pos; }
  affected() { return new Map([[blockKey(this.pos), "minecraft:air"], [invSlotKey(this.be.heldSlot()), ANY]]); }
  begin() {
    const bot = this.be.bot;
    const block = bot.blockAt(new Vec3(...this.pos));
    this.needTicks = Math.ceil(bot.digTime(block) / 50);
    this.be.lookPacket(new Vec3(this.pos[0] + 0.5, this.pos[1] + 0.5, this.pos[2] + 0.5));
    this.seqStart = this.be.nextSeq();
    bot._client.write("block_dig", { status: 0, location: vec(this.pos), face: 1, sequence: this.seqStart });
    bot._client.write("arm_animation", { hand: 0 });
    if (this.needTicks <= 0) { this.seqFinal = this.seqStart; this.finishTick = this.startTick; }
    return [{ key: blockKey(this.pos), value: "minecraft:air" }];
  }
  step(t) {
    if (this.seqFinal != null || this.dead) return;
    if ((t - this.startTick) % 5 === 4) this.be.bot._client.write("arm_animation", { hand: 0 });
    if (t - this.startTick >= this.needTicks) {
      this.seqFinal = this.be.nextSeq();
      this.finishTick = t;
      this.be.bot._client.write("block_dig", { status: 2, location: vec(this.pos), face: 1, sequence: this.seqFinal });
    }
  }
  evaluate(t) {
    const out = [];
    if (this.seqFinal != null && !this.issuedReported && t > this.finishTick) { this.issuedReported = true; out.push({ action: this.id, status: "Issued" }); }
    if (this.seqFinal != null && this.be.ackSeq >= this.seqFinal && t > this.finishTick) {
      const v = this.be.codec.stateString(this.be.bot.world.getBlockStateId(new Vec3(...this.pos)));
      this.verdictValue = v;
      out.push(CLEARED.test(v) ? { action: this.id, status: "Confirmed" } : { action: this.id, status: "Rejected", detail: `block is ${v} at the acknowledgement` });
      return out;
    }
    if (!this.issuedReported) out.push({ action: this.id, status: "Running" });
    return out;
  }
  cancel() {
    if (this.seqFinal == null) this.be.bot._client.write("block_dig", { status: 1, location: vec(this.pos), face: 0, sequence: this.be.nextSeq() });
  }
}

class PlaceBlock {
  constructor(be, id, args, mode, tick) { Object.assign(this, { be, id, args, mode, startTick: tick }); this.target = offset(args.support, args.face); }
  predicted() {
    const held = this.be.bot.heldItem;
    const blockName = held && this.be.bot.registry.blocksByName[held.name] ? held.name : null;
    return blockName ? this.be.codec.defaultState(blockName) : "minecraft:air";
  }
  affected() { return new Map([[blockKey(this.target), this.predicted()], [invSlotKey(this.be.heldSlot()), ANY]]); }
  begin() {
    const bot = this.be.bot;
    const [fx, fy, fz] = FACE_VEC[this.args.face];
    const cursor = this.cursorOverride ?? [0.5 + fx * 0.5, 0.5 + fy * 0.5, 0.5 + fz * 0.5];
    this.be.lookPacket(new Vec3(this.args.support[0] + cursor[0], this.args.support[1] + cursor[1], this.args.support[2] + cursor[2]));
    this.seq = this.be.nextSeq();
    bot._client.write("block_place", { hand: 0, location: vec(this.args.support), direction: FACES.indexOf(this.args.face), cursorX: cursor[0], cursorY: cursor[1], cursorZ: cursor[2], insideBlock: false, worldBorderHit: false, sequence: this.seq });
    bot._client.write("arm_animation", { hand: 0 });
    return [{ key: blockKey(this.target), value: this.predicted() }];
  }
  evaluate(t) {
    if (t <= this.startTick) return [];
    const out = [];
    if (!this.issued) { this.issued = true; out.push({ action: this.id, status: "Issued" }); }
    if (this.be.ackSeq >= this.seq) {
      const v = this.be.codec.stateString(this.be.bot.world.getBlockStateId(new Vec3(...this.target)));
      this.verdictValue = v;
      const want = this.rec.affected.get(blockKey(this.target));
      out.push(v.replace(/\[.*$/, "") === want.replace(/\[.*$/, "") ? { action: this.id, status: "Confirmed" } : { action: this.id, status: "Rejected", detail: `target cell is ${v} at the acknowledgement` });
    }
    return out;
  }
}

class LookAt {
  constructor(be, id, args, mode, tick) { Object.assign(this, { be, id, args, mode, startTick: tick }); }
  affected() { return new Map([["player.rotation", ANY]]); }
  begin() {
    const bot = this.be.bot;
    const target = new Vec3(...this.args.target);
    const eye = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
    const d = target.minus(eye);
    this.yaw = Math.atan2(-d.x, -d.z);
    this.pitch = Math.atan2(d.y, Math.sqrt(d.x * d.x + d.z * d.z));
    bot.look(this.yaw, this.pitch, false); // Mineflayer turns gradually; packets come from the physics plugin
    return [{ key: "player.rotation", value: { yaw: round(normAngle(Math.PI - this.yaw), 4), pitch: round(-this.pitch, 4) } }];
  }
  // §17.2 aim_error: angle between the sent look direction (vanilla angles) and the eye-to-target direction.
  aimError() {
    const s = this.be.sentRotation;
    if (!s) return Infinity;
    const y = deg2rad(s.yaw), p = deg2rad(s.pitch);
    const a = [-Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p)];
    const bot = this.be.bot;
    const d = new Vec3(...this.args.target).minus(bot.entity.position.offset(0, bot.entity.eyeHeight, 0));
    const n = Math.hypot(d.x, d.y, d.z) || 1;
    return Math.acos(Math.max(-1, Math.min(1, (a[0] * d.x + a[1] * d.y + a[2] * d.z) / n)));
  }
  evaluate(t, buf) {
    if (this.reachedTick != null && buf.corrections.has("player.rotation")) return [{ action: this.id, status: "Rejected", detail: "server corrected the rotation during the settle window" }];
    if (this.reachedTick == null && this.aimError() <= Math.PI / 180) { this.reachedTick = t; this.be.instrument.onLookReached?.(t); }
    if (this.reachedTick != null && t - this.reachedTick >= settleTicks(this.be.rtt)) return [{ action: this.id, status: "Confirmed" }];
    return [{ action: this.id, status: "Running" }];
  }
}

// Window clicks (pick_up, put, quick_move): one window_click carrying the predicted changed slots and
// cursor; confirmed by settle (no contradicting server slot data within the settle window).
class Click {
  constructor(be, id, args, mode, tick) { Object.assign(this, { be, id, args, mode, startTick: tick }); this.plan = this.compute(); }
  slotKeys(winSlot) {
    const be = this.be;
    if (!be.win) return [];
    const keys = [winSlotKey(winSlot)];
    if (winSlot >= be.win.playerStart) keys.push(invSlotKey(winSlot - be.win.playerStart + 9));
    return keys;
  }
  compute() {
    const be = this.be;
    const w = this.args.w;
    if (!be.win || w.window !== be.win.id || w.generation !== be.win.generation) return { failed: { type: "WindowClosed", fields: { task: this.constructor.task } } };
    const slots = be.win.slots.map((s) => (s ? { ...s } : null));
    let cursor = be.cursor ? { ...be.cursor } : null;
    const max = (s) => be.codec.itemByName(s.item)?.stackSize ?? 64;
    const changed = new Set();
    const set = (i, s) => { slots[i] = s && s.count > 0 ? s : null; changed.add(i); };
    const same = (a, b) => a && b && a.item === b.item && sameValue(a.components, b.components);
    let button = 0, mode = 0;
    const slot = this.args.slot;
    const s = slots[slot];
    if (this instanceof PickUp) {
      button = this.args.half ? 1 : 0;
      const take = this.args.half ? Math.ceil(s.count / 2) : s.count;
      cursor = { ...s, count: take };
      set(slot, { ...s, count: s.count - take });
    } else if (this instanceof Put) {
      button = this.args.one ? 1 : 0;
      if (s && !same(s, cursor)) return { failed: { type: "CannotPut", fields: { slot } } };
      const room = s ? max(s) - s.count : max(cursor);
      const n = Math.min(this.args.one ? 1 : cursor.count, room);
      set(slot, { ...cursor, count: (s?.count ?? 0) + n });
      cursor = cursor.count - n > 0 ? { ...cursor, count: cursor.count - n } : null;
    } else {
      mode = 1;
      const fromChest = slot < be.win.playerStart;
      const [lo, hi, rev] = fromChest ? [be.win.playerStart, slots.length, true] : [0, be.win.playerStart, false];
      const order = [];
      for (let i = lo; i < hi; i++) order.push(i);
      if (rev) order.reverse();
      let left = s.count;
      for (const i of order) { if (left && same(slots[i], s) && slots[i].count < max(s)) { const n = Math.min(left, max(s) - slots[i].count); set(i, { ...slots[i], count: slots[i].count + n }); left -= n; } }
      for (const i of order) { if (left && !slots[i]) { const n = Math.min(left, max(s)); set(i, { ...s, count: n }); left -= n; } }
      set(slot, left ? { ...s, count: left } : null);
    }
    return { slots, cursor, changed: [...changed], button, mode };
  }
  affected() {
    const m = new Map();
    if (this.plan.failed) return m;
    for (const i of this.plan.changed) for (const k of this.slotKeys(i)) m.set(k, this.plan.slots[i]);
    m.set("inventory.cursor", this.plan.cursor);
    return m;
  }
  begin() {
    if (this.plan.failed) return [];
    const be = this.be;
    const p = this.plan;
    be.bot._client.write("window_click", {
      windowId: this.windowIdOverride ?? be.win.id, stateId: this.stateIdOverride ?? be.stateId, slot: this.args.slot, mouseButton: p.button, mode: p.mode,
      changedSlots: p.changed.map((i) => ({ location: i, item: be.codec.toNotch(p.slots[i] ? be.codec.newItem(p.slots[i].item, p.slots[i].count) : null) })),
      cursorItem: be.codec.toNotch(p.cursor ? be.codec.newItem(p.cursor.item, p.cursor.count) : null),
    });
    // The server now assumes we hold these values and only corrects them if it disagrees, so the
    // mirror takes the claim; a later server packet overrides it.
    for (const i of p.changed) {
      be.win.slots[i] = p.slots[i];
      if (i >= be.win.playerStart) be.inv[i - be.win.playerStart + 9] = p.slots[i];
    }
    be.cursor = p.cursor;
    this.begun = true;
    return [...this.rec.affected].map(([key, value]) => ({ key, value }));
  }
  onServerSlot(key, value) {
    if (!this.begun || !this.rec.affected.has(key)) return;
    if (!sameValue(this.rec.affected.get(key), value)) this.contradicted = `server set ${key} to ${JSON.stringify(value)}`;
  }
  // Probe variant (E3 W13/W14): one extra no-op click on slot -1 with a stale state id makes the
  // server answer with the full window state (broadcastFullState), so the verdict is by state.
  step() {
    if (!this.probe || this.probeSent || !this.begun) return;
    const be = this.be;
    this.probeSent = true;
    be.bot._client.write("window_click", { windowId: this.windowIdOverride ?? be.win?.id ?? 0, stateId: be.stateId - 1, slot: -1, mouseButton: 0, mode: 0, changedSlots: [],
      cursorItem: be.codec.toNotch(be.cursor ? be.codec.newItem(be.cursor.item, be.cursor.count) : null) });
  }
  onResync(windowId) { if (this.probeSent && windowId === (this.windowIdOverride ?? this.be.win?.id)) this.resynced = true; }
  evaluate(t) {
    if (this.plan.failed) return [{ action: this.id, status: "Failed", failure: this.plan.failed }];
    if (t <= this.startTick) return [];
    const out = [];
    if (this.issuedTick == null) { this.issuedTick = t; out.push({ action: this.id, status: "Issued" }); }
    if (this.contradicted) out.push({ action: this.id, status: "Rejected", detail: this.contradicted });
    else if (this.probe) { if (this.resynced) out.push({ action: this.id, status: "Confirmed" }); }
    else if (t - this.issuedTick >= settleTicks(this.be.rtt)) out.push({ action: this.id, status: "Confirmed" });
    return out;
  }
}
class PickUp extends Click { static task = "pick_up"; }
class Put extends Click { static task = "put"; }
class QuickMove extends Click { static task = "quick_move"; }

class Pathfind {
  constructor(be, id, args, mode, tick) { Object.assign(this, { be, id, args, mode, startTick: tick }); this.done = 0; this.pathRef = null; this.initialLen = 0; }
  affected() { return new Map(["player.position", "player.on_ground", "player.rotation", "player.sprinting", "player.in_water"].map((k) => [k, ANY])); }
  begin() {
    const be = this.be;
    if (be.pathfindAction) be.cancel(be.pathfindAction.id);
    be.pathfindAction = this;
    be.bot.pathfinder.setMovements(makeMovements(be.bot, this.args.opts));
    this.goal = makeGoal(be.bot, this.args.goal);
    be.bot.pathfinder.setGoal(this.goal);
    return [];
  }
  onPathUpdate(r) {
    (this.statuses ??= []).push({ tick: this.be.clockDriver.tick, status: r.status, length: r.path.length });
    if (this.pathRef) this.done += this.initialLen - this.pathRef.length;
    this.pathRef = r.path;
    this.initialLen = r.path.length;
    if (r.status === "noPath") this.noPath = true;
  }
  onGoalReached(t) { this.reachedTick ??= t; }
  progress() { return this.done + (this.pathRef ? this.initialLen - this.pathRef.length : 0); }
  evaluate(t, buf) {
    const bot = this.be.bot;
    if (this.noPath) {
      bot.pathfinder.setGoal(null); // the action ended: release the pathfinder
      const f = bot.entity.position.floored();
      return [{ action: this.id, status: "Failed", failure: { type: "NoPath", fields: { at: [f.x, f.y, f.z] } } }];
    }
    if (this.reachedTick == null && this.goal.isEnd(bot.entity.position.floored()) && !bot.pathfinder.isMoving()) this.reachedTick = t;
    if (this.reachedTick != null) {
      if (buf.corrections.has("player.position") && !this.goal.isEnd(bot.entity.position.floored())) { this.reachedTick = null; bot.pathfinder.setGoal(this.goal); }
      else if (t - this.reachedTick >= settleTicks(this.be.rtt)) { bot.pathfinder.setGoal(null); return [{ action: this.id, status: "Confirmed" }]; }
    }
    return [{ action: this.id, status: "Running" }];
  }
  cancel() {
    const bot = this.be.bot;
    this.be.cancelLog.push({ id: this.id, tick: this.be.tickNo, t: performance.now(), pos: bot.entity.position.clone(), vel: bot.entity.velocity.clone(), controls: ["forward", "back", "left", "right", "jump", "sprint", "sneak"].filter((c) => bot.getControlState(c)) });
    bot.pathfinder.setGoal(null); // resetPath -> clearControlStates() now; pathfinder.stop() would wait for the next node
  }
}

class Sneak {
  constructor(be, id, args, mode, tick) { Object.assign(this, { be, id, args, mode, startTick: tick }); }
  affected() { return new Map([["player.sneaking", true]]); }
  begin() { this.be.bot.setControlState("sneak", true); return [{ key: "player.sneaking", value: true }]; }
  evaluate() { return [{ action: this.id, status: "Running" }]; }
  cancel() { this.be.bot.setControlState("sneak", false); }
}

const PRIMITIVES = { dig: Dig, place_block: PlaceBlock, look_at: LookAt, pick_up: PickUp, put: Put, quick_move: QuickMove, pathfind: Pathfind, sneak: Sneak };

// ------------------------------------------------------------------ helpers

function vec([x, y, z]) { return new Vec3(x, y, z); }
function ns(s) { return String(s).includes(":") ? String(s) : `minecraft:${s}`; }
function deg2rad(d) { return (d * Math.PI) / 180; }
function normAngle(r) { let x = r % (2 * Math.PI); if (x > Math.PI) x -= 2 * Math.PI; if (x <= -Math.PI) x += 2 * Math.PI; return x; }
function textOf(r) { if (typeof r === "string") return r; try { return JSON.stringify(r); } catch { return String(r); } }
function callerFrames(stack) {
  return stack.split("\n").slice(2).map((l) => l.trim().replace(/^at /, "")).filter((l) => !l.includes("lib/backend.mjs")).slice(0, 10).map((l) => l.replace(/.*node_modules\//, "").replace(/^.*\/spike\//, "spike/"));
}
