// PD-2 clock driver: calls clock.tick() exactly once per Mineflayer physics tick (the 'physicsTick'
// event), and from a local 50 ms timer while the physics plugin is dormant. Never re-entrant.
//
// Mineflayer's physics loop (node_modules/mineflayer/lib/plugins/physics.js, doPhysics/tickPhysics)
// runs a setInterval(50) with a catch-up accumulator, but emits 'physicsTick' only while the client
// is in the play state, its position is finite, the chunk under it is loaded and shouldUsePhysics is
// set (cleared on login, death, respawn and mount; set again by the next server position packet,
// which emits 'forcedMove'). The driver mirrors those conditions to decide when the local timer
// stands in. Using "no physics tick for N ms" instead double-counts ticks whenever a physics tick is
// merely late (seen in the first E1 run: 3 extra ticks in 60 s).

export class ClockDriver {
  constructor() {
    this.tick = 0;
    this.lastAt = null;
    this.mode = "timer";
    this.inTick = false;
    this.samples = []; // { tick, t, src } per tick, for E1 jitter/drift analysis
    this.reentrant = 0;
    this.bot = null;
    this.physicsLive = false;
    this.timer = null;
  }

  start(onTick) {
    if (this.timer) return;
    this.onTick = onTick;
    this.timer = setInterval(() => this.#fallback(), 2);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.detach();
  }

  attach(bot) {
    this.detach();
    this.bot = bot;
    this.physicsLive = false;
    this.handlers = {
      physicsTick: () => this.#fire("physics"),
      forcedMove: () => { this.physicsLive = true; },
      login: () => { this.physicsLive = false; },
      death: () => { this.physicsLive = false; },
      respawn: () => { this.physicsLive = false; },
      mount: () => { this.physicsLive = false; },
      end: () => { this.physicsLive = false; },
    };
    // prependListener: the runtime tick runs before any plugin's physicsTick listener (pathfinder),
    // so plugin decisions for the next physics step already see this tick's cancels (E5).
    for (const [ev, fn] of Object.entries(this.handlers)) bot.prependListener(ev, fn);
    // mineflayer re-checks the start_configuration case; not exercised by the spike.
  }

  detach() {
    if (this.bot && this.handlers) for (const [ev, fn] of Object.entries(this.handlers)) this.bot.removeListener(ev, fn);
    this.bot = null;
    this.physicsLive = false;
  }

  dormant() {
    const b = this.bot;
    if (!b || !this.physicsLive || b._client.state !== "play") return true;
    const p = b.entity?.position;
    if (!p || !Number.isFinite(p.x)) return true;
    return b.blockAt(p) == null;
  }

  #fallback() {
    const now = performance.now();
    if (this.lastAt === null) return this.#fire("timer", now);
    if (this.dormant()) {
      // Nominal 50 ms steps from the last tick so the stand-in timer does not drift; after a long stall
      // it catches up at most 4 ticks at once, as Mineflayer's physics loop does.
      if (now >= this.lastAt + 50) this.#fire("timer", now - this.lastAt > 250 ? now : this.lastAt + 50);
    } else if (now - this.lastAt > 1000) {
      this.#fire("safety", now); // physics should be ticking but is not: never stop the clock
    }
  }

  #fire(src, nominal) {
    if (this.inTick) { this.reentrant++; return; }
    const now = performance.now();
    this.inTick = true;
    this.mode = src;
    this.lastAt = src === "physics" ? now : nominal ?? now;
    this.samples.push({ tick: this.tick, t: now, src });
    try {
      this.onTick(this.tick);
    } finally {
      this.inTick = false;
      this.tick++;
    }
  }
}
