// Local vanilla server harness: writes eula/server.properties/ops.json, starts server.jar with a
// fresh world, sends console commands on stdin and waits for log lines. Spike tooling only.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const SPIKE = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MC_VERSION = "1.21.4";
export const PORT = 25599;

// Offline-mode UUID exactly as vanilla derives it: UUID v3 of "OfflinePlayer:<name>".
export function offlineUuid(name) {
  const h = createHash("md5").update(`OfflinePlayer:${name}`).digest();
  h[6] = (h[6] & 0x0f) | 0x30;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export class Server {
  constructor({ name = "default", spawnProtection = 16, ops = ["Rival"], seed = "golem-spike", viewDistance = 4, extraProps = {} } = {}) {
    this.dir = join(SPIKE, "server", "run", name);
    this.jar = join(SPIKE, "server", MC_VERSION, "server.jar");
    this.opts = { spawnProtection, ops, seed, viewDistance, extraProps };
    this.lines = [];
    this.waiters = [];
    this.proc = null;
  }

  prepare() {
    if (!existsSync(this.jar)) throw new Error(`missing ${this.jar}: run scripts/fetch-server.sh first`);
    rmSync(join(this.dir, "world"), { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, "eula.txt"), "eula=true\n");
    const props = {
      "online-mode": "false",
      "server-port": String(PORT),
      "level-seed": this.opts.seed,
      "level-type": "minecraft\\:flat",
      "spawn-protection": String(this.opts.spawnProtection),
      "view-distance": String(this.opts.viewDistance),
      "simulation-distance": String(this.opts.viewDistance),
      difficulty: "peaceful",
      "spawn-monsters": "false",
      "spawn-animals": "false",
      "spawn-npcs": "false",
      "generate-structures": "false",
      "allow-flight": "true",
      "enforce-secure-profile": "false",
      "sync-chunk-writes": "false",
      "max-players": "8",
      motd: "golem spike",
      ...this.opts.extraProps,
    };
    writeFileSync(join(this.dir, "server.properties"), Object.entries(props).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
    writeFileSync(join(this.dir, "ops.json"), JSON.stringify(this.opts.ops.map((n) => ({ uuid: offlineUuid(n), name: n, level: 4, bypassesPlayerLimit: false })), null, 2));
  }

  async start({ log = false } = {}) {
    this.prepare();
    this.proc = spawn("java", ["-Xms1G", "-Xmx2G", "-jar", this.jar, "--nogui"], { cwd: this.dir, stdio: ["pipe", "pipe", "pipe"] });
    let buf = "";
    const onData = (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, "");
        buf = buf.slice(i + 1);
        this.lines.push({ t: performance.now(), line });
        if (log) console.error(`[server] ${line}`);
        for (const w of [...this.waiters]) if (w.re.test(line)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(line); }
      }
    };
    this.proc.stdout.on("data", onData);
    this.proc.stderr.on("data", onData);
    this.exited = new Promise((r) => this.proc.on("exit", r));
    await this.waitFor(/Done \([0-9.]+s\)!/, 180000);
    for (const c of ["gamerule doDaylightCycle false", "gamerule doWeatherCycle false", "gamerule randomTickSpeed 0",
      "gamerule doMobSpawning false", "gamerule announceAdvancements false", "gamerule spawnRadius 0", "time set 1000", "weather clear"]) this.cmd(c);
    await this.sync();
  }

  waitFor(re, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const w = { re, resolve };
      this.waiters.push(w);
      setTimeout(() => { const i = this.waiters.indexOf(w); if (i >= 0) { this.waiters.splice(i, 1); reject(new Error(`timeout waiting for ${re}`)); } }, timeout);
    });
  }

  cmd(text) {
    this.proc.stdin.write(text.replace(/^\//, "") + "\n");
  }

  // Runs a command and resolves with the first log line matching re after it.
  async cmdWait(text, re, timeout = 5000) {
    const p = this.waitFor(re, timeout);
    this.cmd(text);
    return p;
  }

  // Resolves once every earlier console command has been executed (the server processes stdin in order).
  async sync() {
    const tag = `sync-${Math.random().toString(36).slice(2)}`;
    await this.cmdWait(`say ${tag}`, new RegExp(tag));
  }

  async stop() {
    if (!this.proc) return;
    this.cmd("stop");
    await Promise.race([this.exited, new Promise((r) => setTimeout(r, 20000))]);
    if (this.proc.exitCode === null) this.proc.kill("SIGKILL");
    this.proc = null;
  }
}
