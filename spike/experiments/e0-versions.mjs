// E0. Version pin (question 3, S-4): the installed library versions, the latest published ones, the
// Minecraft versions each declares support for, and the server version actually connected to.
// Usage: node experiments/e0-versions.mjs   (queries the npm registry; works offline with --offline)
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { SPIKE, MC_VERSION } from "../lib/server.mjs";
import { save } from "../lib/harness.mjs";

const require = createRequire(import.meta.url);
const pkgs = ["mineflayer", "mineflayer-pathfinder", "minecraft-protocol", "minecraft-data", "prismarine-physics", "prismarine-block", "prismarine-chunk", "prismarine-windows", "prismarine-item"];
const installed = Object.fromEntries(pkgs.map((p) => [p, JSON.parse(readFileSync(join(SPIKE, "node_modules", p, "package.json"), "utf8")).version]));
const latest = {};
if (!process.argv.includes("--offline")) {
  for (const p of pkgs) {
    try { latest[p] = JSON.parse(execSync(`npm view ${p} version time.modified --json`, { encoding: "utf8" })); } catch (e) { latest[p] = { error: String(e.message).slice(0, 100) }; }
  }
}
const mfVersion = require("mineflayer/lib/version.js");
const mpVersion = require("minecraft-protocol/src/version.js");
const mcd = require("minecraft-data");
const dataPaths = JSON.parse(readFileSync(join(SPIKE, "node_modules/minecraft-data/minecraft-data/data/dataPaths.json"), "utf8")).pc[MC_VERSION];
const pfPkg = JSON.parse(readFileSync(join(SPIKE, "node_modules/mineflayer-pathfinder/package.json"), "utf8"));
const serverVersion = JSON.parse(readFileSync(join(SPIKE, "server", MC_VERSION, "version.json"), "utf8"));

const summary = {
  pinned_minecraft: MC_VERSION,
  protocol: mcd(MC_VERSION).version.version,
  installed, latest,
  support: {
    mineflayer: { testedVersions: mfVersion.testedVersions, latestSupported: mfVersion.latestSupportedVersion, pinned_listed: mfVersion.testedVersions.includes(MC_VERSION) },
    "minecraft-protocol": { supportedVersions: mpVersion.supportedVersions, defaultVersion: mpVersion.defaultVersion, pinned_listed: mpVersion.supportedVersions.includes(MC_VERSION) },
    "minecraft-data": { pinned_listed: mcd.supportedVersions.pc.includes(MC_VERSION), data_paths_for_pinned: dataPaths,
      files_from_older_versions: Object.fromEntries(Object.entries(dataPaths).filter(([, v]) => v !== `pc/${MC_VERSION}`)) },
    "mineflayer-pathfinder": { declares_versions: "none (version-agnostic; uses minecraft-data and prismarine-physics through the bot)", dependencies: pfPkg.dependencies, last_publish: latest["mineflayer-pathfinder"]?.["time.modified"] ?? null },
  },
  server: { id: serverVersion.id, java_major: serverVersion.javaVersion.majorVersion, server_jar_sha1: serverVersion.downloads.server.sha1, release_time: serverVersion.releaseTime },
};
save("e0", "summary.json", summary);
console.log(JSON.stringify(summary, null, 1));
