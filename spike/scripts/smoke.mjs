import { Server } from "../lib/server.mjs";
import mineflayer from "mineflayer";
const s = new Server({ name: "smoke" });
const t0 = performance.now();
await s.start({ log: false });
console.log("server up in", Math.round(performance.now() - t0), "ms");
const bot = mineflayer.createBot({ host: "127.0.0.1", port: 25599, username: "golem", version: "1.21.4", auth: "offline" });
bot.once("spawn", async () => {
  console.log("spawned at", bot.entity.position, "gamemode", bot.game.gameMode, "proto", bot._client.protocolVersion);
  await new Promise((r) => setTimeout(r, 1000));
  console.log("block below:", bot.blockAt(bot.entity.position.offset(0, -1, 0))?.name);
  bot.quit(); await s.stop(); process.exit(0);
});
bot.on("error", (e) => { console.error("bot error", e); });
bot.on("kicked", (r) => console.error("kicked", r));
