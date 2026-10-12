// Shared experiment plumbing: server, the bot under test (SpikeBackend + StubRuntime), the second
// player, the launch object, result files.
import mineflayer from "mineflayer";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Server, SPIKE, PORT, MC_VERSION, REFERENCE_VERSION } from "./server.mjs";
import { SpikeBackend } from "./backend.mjs";
import { StubRuntime } from "./runtime.mjs";
import { ValidationTally } from "./contracts.mjs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function launchFor(username = "golem") {
  return {
    format: "golem-launch/0.1",
    bot: "Spike",
    ir: "build/Spike.golem-ir.json",
    minecraft: MC_VERSION,
    server: { host: "127.0.0.1", port: PORT },
    auth: { mode: "offline", username },
    persistence: "state/Spike.state.json",
    data: {
      registries: { source: "data-generator", path: `server/${MC_VERSION}/generated` },
      physics: { source: "minecraft-data", version: MC_VERSION },
      placement: { source: "placement-table", path: "results/e6/placement-table.json" },
    },
    log: { level: "info" },
  };
}

// Results of the reference version go to results/<exp>; other versions to results/<exp>-<version>.
export const expDir = (exp) => (MC_VERSION === REFERENCE_VERSION ? exp : `${exp}-${MC_VERSION}`);

export function resultsDir(exp) {
  const d = join(SPIKE, "results", expDir(exp));
  mkdirSync(join(d, "raw"), { recursive: true });
  return d;
}

export function save(exp, name, data) {
  const p = join(resultsDir(exp), name);
  writeFileSync(p, typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n");
  return p;
}

// Starts the server and connects the bot under test. The program drives it through the stub runtime.
export async function setup(exp, program, { serverOpts = {}, backendOpts = {}, record = true, rival = true } = {}) {
  const server = new Server({ name: expDir(exp), ...serverOpts });
  await server.start();
  const tally = new ValidationTally();
  const backend = new SpikeBackend(backendOpts);
  const runtime = new StubRuntime(backend, program, { tally, recordPath: record ? join(resultsDir(exp), "raw", "recording.jsonl") : null });
  const launch = launchFor("golem");
  tally.check("launch", launch);
  const cr = await backend.connect(launch, runtime);
  tally.check("connectResult", cr);
  await until(() => backend.bot.entity?.position && runtime.view.has("player.position"), 20000, "golem spawn");
  let other = null;
  if (rival) other = await connectRival();
  return { server, backend, runtime, tally, launch, rival: other };
}

export async function connectRival(name = "Rival") {
  const bot = mineflayer.createBot({ host: "127.0.0.1", port: PORT, username: name, version: MC_VERSION, auth: "offline", hideErrors: true });
  await new Promise((resolve, reject) => { bot.once("spawn", resolve); bot.once("error", reject); bot.once("kicked", reject); });
  await sleep(500);
  return bot;
}

export async function until(pred, timeout = 10000, what = "condition") {
  const t0 = performance.now();
  while (!pred()) {
    if (performance.now() - t0 > timeout) throw new Error(`timeout waiting for ${what}`);
    await sleep(10);
  }
}

export async function teardown(ctx) {
  try { ctx.rival?.quit(); } catch {}
  try { await ctx.backend.disconnect(); } catch {}
  await ctx.runtime.close();
  await ctx.server.stop();
}

// A program whose steps are queued from the experiment script ("do X now"), each run inside the next
// tick's phase 6 so that every start/cancel happens inside clock.tick() as PD-2 requires.
export function scriptedProgram() {
  const queue = [];
  const program = {
    init: () => ({}),
    step(ctx) {
      while (queue.length) { const { fn, resolve, reject } = queue.shift(); try { resolve(fn(ctx)); } catch (e) { reject(e); } }
    },
    // Runs fn(ctx) inside the next tick; resolves with its result.
    run(fn) { return new Promise((resolve, reject) => queue.push({ fn, resolve, reject })); },
  };
  return program;
}

// Waits until the runtime has a final verdict for action id; returns { status, detail, reports, tick }.
export async function verdict(runtime, id, timeout = 20000) {
  await until(() => ["Confirmed", "Rejected", "Failed"].includes(runtime.actions.get(id)?.status), timeout, `verdict of action ${id}`);
  return runtime.actions.get(id);
}
