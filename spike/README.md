# Phase 3 Mineflayer feasibility spike

Reproducible harness and experiments behind `docs/spike/REPORT.md` (decision point D3). This is a spike, not the production backend: the code is written to measure, not to ship.

## Requirements

- **Linux or macOS** with outbound HTTPS to `piston-meta.mojang.com` and `piston-data.mojang.com` (the server fetch) and to the npm registry.
- **Node.js ≥ 20.** Developed on Node 22.22.0.
- **Java 21.** Minecraft 1.21.4 declares `javaVersion.majorVersion: 21` in its version manifest; developed on OpenJDK 21.0.12. `fetch-server.sh` checks this.
- About 2 GB RAM for the server, 0.5 GB disk.
- The contracts package installed: `cd ../contracts && npm ci`. The spike validates every TickInput with the contracts' own Ajv setup (`../contracts/scripts/lib/schemas.mjs`).

The local test server runs with `online-mode=false`, a fixed seed (`golem-spike`), a superflat world, peaceful difficulty, and day/weather/random ticks frozen. `eula=true` is written to the server directory: the operator of this spike accepted the Minecraft EULA for this local test server.

## Setup

```sh
cd contracts && npm ci && cd ..
cd spike
npm ci                         # exact pins from package.json / package-lock.json
./scripts/fetch-server.sh      # server.jar 1.21.4 via Mojang's version manifest, SHA-1 verified
./scripts/datagen.sh           # vanilla data generator output into server/1.21.4/generated
```

## Experiments

Each command starts its own server (fresh world under `server/run/<exp>/`), connects the bot under test (`golem`, not op) and, where needed, a second player (`Rival`, op). It writes `results/<exp>/summary.json`. Large raw recordings go to `results/<exp>/raw/` (gitignored). Every experiment uses port 25599, so run them one at a time.

| Experiment | Command | Wall time | Writes |
| --- | --- | --- | --- |
| E0 version pin | `node experiments/e0-versions.mjs` | seconds | `results/e0/summary.json` |
| E1 clock and ingest | `node experiments/e1-clock.mjs --minutes 10` | 11 min | `results/e1/summary.json`, `sample-ticks.jsonl`, `raw/recording.jsonl` |
| E2 packet flushing | `node experiments/e2-flush.mjs` | 3 min | `results/e2/summary.json` |
| E3 verdicts | `node experiments/e3-verdicts.mjs` | 5 min | `results/e3/summary.json` |
| E4 attribution | `node experiments/e4-attribution.mjs --reps 3` | 8 min | `results/e4/summary.json` |
| E5 pathfinder | `node experiments/e5-pathfinder.mjs` | 4 min | `results/e5/summary.json` |
| E6 version data | `node experiments/e6-data.mjs` (`--offline` for part A only) | 4 min | `results/e6/inventory.json`, `summary.json` |
| all | `./scripts/run-all.sh` | 40 min | all of the above |

## Layout

| Path | What |
| --- | --- |
| `lib/backend.mjs` | Spike backend implementing the `Backend` shape of `contracts/types/backend.d.ts`: write gate (S-1), server mirror, ingest, attribution, primitives `dig`, `place_block`, `look_at`, `pick_up`, `put`, `quick_move`, `pathfind`, `sneak` as direct packets |
| `lib/clock.mjs` | PD-2 clock driver: Mineflayer's `physicsTick`, plus a 50 ms stand-in timer while physics is dormant |
| `lib/runtime.mjs` | Stub runtime (TickClock side), confirmed view, recorder, replay backend |
| `lib/attribution.mjs` | The three attribution rules compared in E4 |
| `lib/goals.mjs` | `Goal` → mineflayer-pathfinder goals, custom `GoalClear`, §18.4 `Movements` |
| `lib/keys.mjs` | §14.1 key spelling and value conversion |
| `lib/datagen.mjs`, `lib/placement.mjs` | Data-generator readers, dig model, placement-table evaluator |
| `lib/server.mjs`, `lib/harness.mjs` | Server process, second player, result files |
| `data/placement-table.json` | DRAFT v0.1 placement table (E6) |
| `data/burn-times.json` | DRAFT v0.1 furnace burn-time table (E6) |
| `experiments/` | E0–E6 |

## Notes for reproducing numbers

- Clock jitter (E1) depends on machine load: run E1 alone.
- All latencies are over loopback. The round trip is 0–17 ms, so the settle window is its 4-tick floor. On a real network the attribution and settle windows scale with `round_trip_ms`.
- The pinned library versions are in `package.json`; `results/e0/summary.json` records what was installed and what npm offered on the run date.
