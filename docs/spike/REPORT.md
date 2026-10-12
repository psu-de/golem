# Phase 3 spike report: Mineflayer backend feasibility (input to D3)

2026-10-12 · backend lead (agent) · for sign-off by Paul at decision point D3

This spike tested the backend assumptions behind spec §14–§15 against a real vanilla 1.21.4 server with Mineflayer, as SPIKE_DEPENDENCIES.md S-1 to S-5 and review question 3 require. Every number below comes from a recorded run whose summary is committed under `spike/results/<experiment>/summary.json`. The harness and a one-command reproduction are in `spike/` (see `spike/README.md`). Spec questions raised are in [ESCALATIONS.md](ESCALATIONS.md) (SE-1 to SE-14). The drafted spec and contract text is in [proposed-errata.md](proposed-errata.md).

**Kinds of evidence.** Each claim is marked with where it comes from:

- **[run]**: observed in a recorded run;
- **[source]**: read in library source, cited as file:line under `spike/node_modules/`;
- **[assumed]**: inferred from vanilla behaviour that was not tested directly.

## Summary

| Item | Verdict | Deciding evidence | Consequence |
| --- | --- | --- | --- |
| **S-1** packet flushing | **Go (deferred)** | E2: a write gate on `bot._client.write` held every play-state packet of 15 mappings to `flush()`. 0 escaped in 15 deferred runs; all succeeded. Mineflayer's high-level calls send outside phase 6: from timers, promise continuations and the physics step [run + source]. Cost: up to one tick of latency for packets produced between ticks (mean 49.6 ms) | Keep `flush: "deferred"`. Implement `dig`, `place_block` and window clicks as direct packets, not `bot.dig`/`bot.placeBlock`/`bot.clickWindow`. Wording errata for §15.2 step 7, §15.5 and §18.4 (SP-4, SP-5, SP-10) |
| **S-2** attribution | **Conditional go (rule changes)** | E4: 529 labelled changes. The provisional rule gave 54 false Own; 24 of them were outside changes inside its post-verdict window, the harmful kind. The refined rule gave 30 false Own: 21 knockback, which no rule can label; 6 benign; 3 same-tick rollback, fixed by a runtime re-tag. Neither rule gave a false Outside. The runtime-side variant (no-go option) misses server corrections | Adopt the refined rule as normative §14.5 text. Attribution stays `"backend"`; no contract shape change. Errata SP-3, C-1 |
| **S-3** version data | **Conditional go (sources change)** | E6. The data generator gives registries, states, tags, recipes and tool rules, but no hardness, shapes, burn times or item→block mapping. minecraft-data 3.117.0 matches the server on hardness and collision shapes. It has no outline shapes and no burn times, and gives wrong ore dig speeds (Mineflayer's dig time 91 vs 23 ticks observed). A server.jar extractor via Mojang's mappings supplies outline shapes; burn-time and placement tables were validated against the server | `physics` source becomes the server-jar extract; add a `fuel` table; a placement table with explicit v0.1 scope. Errata SP-9, C-5 |
| **S-4 / Q3** version | **Go: 1.21.4 as the v0.1 reference version; more versions supported per project** | E0: mineflayer 4.39.0, minecraft-protocol 1.68.0 and minecraft-data 3.117.0 list 1.21.4 (and versions up to 26.1). mineflayer-pathfinder 2.4.5 is version-agnostic. Every experiment ran on 1.21.4. E3 and E6 were rerun on **1.21.11** with identical verdicts, and the backend needed no version-specific change | Decision 46 is per project, not per toolchain: each project pins one version, and Golem supports every version that passes the checks in D3-12. No change to the contracts examples |
| **S-5** pathfinder | **Go** | E5: cancel by `setGoal(null)` releases the controls in the same tick (10 of 10). The bot then slides 0.33 blocks over 7 ticks (vanilla momentum) with no input-driven movement. `path_progress` is readable every tick and never decreases, max 5 ticks between increments, across replans. `Goal.Clear` and `Goal.AllOf` work. `NoPath` appears only for an exhausted search (SE-9) | Keep `Measurements.path_progress`. Errata: cancel via `setGoal(null)`, `NoPath` wording (SP-8, SP-10) |

**Nothing sends §14 or §15 back to spec work.** The structure survives. The changes are confined to:

- §14.5's rule text (now normative);
- one sentence each in §14.1, §14.3, §15.2 step 7 and §15.5;
- a new confirmation method in §17.1 (*resync*: settle cannot detect a click the server ignored, E3 W11);
- a version-data paragraph in §18.1;
- the Mineflayer mapping in §18.4.

The two places closest to a redesign are SE-7 (settle confirmation is unsound for window clicks) and SE-8 (ack and state must share a TickInput). Both have proposed fixes. SE-7's fix was demonstrated (E3 W13/W14); SE-8's hold-back was not implemented in the spike (residual risk).

## Proposed D3 decisions

| Id | Decision | Rationale | Status |
| --- | --- | --- | --- |
| D3-1 | **1.21.4** (protocol 769) is the v0.1 **reference version**: the one the examples, the conformance suite and CI run against. Library pins: Java 21, mineflayer 4.39.0, mineflayer-pathfinder 2.4.5, minecraft-protocol 1.68.0, minecraft-data 3.117.0, exact versions with a lockfile | All four list or tolerate 1.21.4 (E0); every experiment ran on it; the contracts examples already use it. Each project still chooses its own version (decision 46, D3-12) | Proposed |
| D3-2 | S-1: **deferred flush** through a write gate on `bot._client.write`; `cancel` drops still-queued packets; immediate flushing is also conforming | E2: 0 escaped, all mappings work; E4 S11b: a start and cancel in one tick never reaches the server. Determinism is at the ingest boundary (§15.5) | Proposed |
| D3-3 | Implement `dig`, `place_block` and the window primitives as **direct packets**, not `bot.dig`/`bot.placeBlock`/`bot.clickWindow`; send the look before `use_item_on` in the same flush | E2: the high-level calls send from timers and continuations and write predictions into Mineflayer's world; E6: a look left to the physics step makes stairs face the old way | Proposed |
| D3-4 | S-2: **refined attribution rule**, normative in §14.5 (live = start to verdict TickInput; value-consistent; server corrections Outside; same-value updates are not changes; runtime re-tags same-tick rollbacks); `capabilities.attribution` stays `"backend"` | E4: false Own 54 → 30, the harmful post-verdict class eliminated, 0 false Outside; runtime-side computation lacks the correction signal | Proposed |
| D3-5 | Window primitives confirm by **resync** (no-op probe click with a stale state id) instead of settle | E3 W11: settle falsely confirmed an ignored click and left a lasting desync; W13: probe confirms by state in 1 tick; W14: an ignored click stays unconfirmed | Proposed |
| D3-6 | Ack-confirmed actions: the backend delivers a matching affected-key change in the **same TickInput as the acknowledgement** | Prevents a spurious `BlockChanged` on the bot's own success (SE-8); locally 7 of 7 confirmed digs arrived together, but nothing guarantees it on a network | Proposed |
| D3-7 | S-3: version data from the data generator (registries, tags, recipes, tool rules) + a **server.jar extract via Mojang's mappings** (hardness, requires-tool, outline and collision shapes, item→block) + hand-authored **placement** and **burn-time** tables with explicit v0.1 scope | E6: the extract matches minecraft-data on 27,866/27,866 collision shapes and 1,095/1,095 hardness values, and adds outline shapes (242 blocks have outline but no collision). Burn times 17/17 and placement 17/19 validated (both misses explained) on the server | Proposed |
| D3-8 | Contracts: C-1 to C-4 and C-6 as **0.1.1** (descriptions only); C-5 (`VersionDataSources`) as **0.1.1 under the D3 clause** (SE-13) | Only provisional definitions change; no IR, report or command shape changes | Proposed |
| D3-9 | S-5: keep `Measurements.path_progress` (cumulative nodes reached); cancel `pathfind` with `setGoal(null)`; `NoPath` only on an exhausted search, otherwise the `@progress` clause ends the call | E5 | Proposed |
| D3-10 | `RecordedTick` stays as is; the Delta must be a pure function of (primitive, args, confirmed view, version data) so replay recomputes it | E1: replay is identical with the deltas and diverges without them (SE-6) | Proposed |
| D3-11 | Accept the spec errata SP-1 to SP-11 as spec v0.2.2 | Wording only; no semantic redesign | Proposed |
| D3-12 | **Version support policy.** Golem supports a set of Minecraft versions; each project picks one in `golem.toml` (decision 46 unchanged). A version is supported when (a) the pinned mineflayer, minecraft-protocol and minecraft-data list it, (b) its version data is produced (data generator, server-jar extract, reviewed placement and burn-time tables), and (c) the conformance suite passes on it. Floor: **1.20.5** | The spec itself needs 1.19 (sequence acks), 1.19.4 (`entity_hurt`), 1.20 (`#all_signs`) and 1.20.5 (data components, PD-4). E3/E6 on 1.21.11 matched 1.21.4 with harness-only changes. 26.x needs Java 25 and an unobfuscated-jar variant of the extractor (not tried) | Proposed |

---

## Setup common to all experiments

- **Server.** Vanilla 1.21.4 `server.jar`, SHA-1 `4707d00eb834b446575d89a61a11b5d548d8c001`, fetched through Mojang's version manifest by `spike/scripts/fetch-server.sh`. Java 21 (OpenJDK 21.0.12).
  - `online-mode=false`, seed `golem-spike`, superflat, peaceful.
  - Day cycle, weather and random ticks frozen; view distance 4; `spawn-protection=16`.
  - A fresh world per experiment.
- **Bots.** `golem` is the bot under test and is not op, so spawn protection applies to it. `Rival` is the second player: an op and a plain Mineflayer client. Console commands go to the server's stdin.
- **Backend.** `spike/lib/backend.mjs` implements the `Backend` shape of `contracts/types/backend.d.ts`:
  - connect / ingest / start / cancel / flush / disconnect;
  - the PD-2 clock (`spike/lib/clock.mjs`);
  - a server mirror built only from server packets;
  - the primitives `dig`, `place_block`, `look_at`, `pick_up`, `put`, `quick_move`, `pathfind`, `sneak`.
- **Runtime.** A stub (`spike/lib/runtime.mjs`) plays the runtime: it applies TickInputs to a confirmed view and runs a deterministic program.
- **Contract validation.** Every TickInput, RecordedTick, StartRequest, async Delta, the ConnectResult and the launch object are validated with the contracts package's own Ajv setup (`contracts/scripts/lib/schemas.mjs`).

**Contract validation across the final runs.** 0 invalid objects in every experiment:

| Experiment | TickInputs validated | StartRequests | Deltas |
| --- | --- | --- | --- |
| E1 | 12,017 | 584 | 95 |
| E3 | 2,304 | 51 | 8 |
| E4 | 2,493 | 51 | 6 |
| E5 | 2,165 | 22 | 0 |

That is 18,979 TickInputs produced from live Mineflayer data, all valid against `tick-input.schema.json`. The contract shapes are producible from Mineflayer as written.

**Latency caveat.** Everything ran over loopback. The measured round trip was 0–33 ms (E1 p99 4 ms), so the settle window `max(4t, 2 × RTT)` was always its 4-tick floor. On a real network, windows and verdict latencies grow with RTT. The attribution rule recommended here does not depend on RTT; the provisional rule does.

## E0. Version pin (question 3, S-4)

**Method.** `spike/experiments/e0-versions.mjs` records the installed versions and the latest on npm (run date 2026-10-12), plus each library's own support list:

- `mineflayer/lib/version.js` `testedVersions`;
- `minecraft-protocol/src/version.js` `supportedVersions`;
- `minecraft-data` `supportedVersions.pc` and `dataPaths.json`;
- mineflayer-pathfinder's `package.json`.

**Results [run + source].**

| Package | Pinned (= latest) | Published | 1.21.4 | Newest supported |
| --- | --- | --- | --- | --- |
| mineflayer | 4.39.0 | 2026-09-06 | in `testedVersions` | 26.1 |
| minecraft-protocol | 1.68.0 | 2026-08-27 | in `supportedVersions` | 26.1 |
| minecraft-data | 3.117.0 | 2026-09-22 | full `pc/1.21.4` entry | 26.3 |
| mineflayer-pathfinder | 2.4.5 | 2023-09-04 | declares none; version-agnostic through minecraft-data and prismarine-physics | — |
| prismarine-physics | 1.11.1 | 2026-07-28 | via minecraft-data | — |

- minecraft-data's 1.21.4 entry takes 10 data files from older versions (`attributes` 1.21.3, `foods` 1.21.1, `windows` 1.16.1, and others). None of them is one the runtime needs. The protocol, blocks, items, collision shapes and recipes are 1.21.4's own.
- The server's version manifest requires Java 21.

**Verdict: go, 1.21.4 (protocol 769) as the reference version.** Every library lists or tolerates it, and every experiment below ran on it. The exact pins are in `spike/package.json` plus `package-lock.json`.

The pin does not limit Golem to one version. Decision 46 fixes one version **per project** (`golem.toml`), so the toolchain can support many. The spike measures what an extra version costs.

**Second version: 1.21.11 (protocol 774) [run].** Everything version-dependent is parameterised: `GOLEM_MC_VERSION=1.21.11`, with the scripts taking the version as an argument; results go to `results/<exp>-1.21.11/`.

| Step | Result on 1.21.11 |
| --- | --- |
| Server fetch, Java | `server.jar` via the manifest; Java 21 suffices; mappings published |
| Data generator | 1,166 blocks, 29,671 states, 1,505 items |
| Server-jar extractor | ran **unchanged** (the mapped names it uses are stable): 29,671 states, 915 shapes, 1,025 block items |
| minecraft-data cross-check | collision shapes 29,671 / 29,671 identical, hardness and requires-tool 1,166 / 1,166 agree, harvest tiers 14,616 / 14,616 agree. Tool speeds still disagree (993 pairs): the ore and obsidian defect persists |
| E6 against the server | dig times within [0, 2] ticks of the model for 16 / 16, harvest 16 / 16, burn times 17 / 17, placement 17 / 19 (the same two known misses) |
| E3 verdicts | the same verdict as on 1.21.4 in all 49 cases, including the W11 false Confirmed and the W13/W14 probe results; 2,305 TickInputs valid |
| Changes needed | **none in the backend**. The menu ids now come from the data generator instead of a 1.21.4 list. In the test harness only: game rules were renamed to snake_case in 1.21.11 (`advance_time`, `random_tick_speed`, …) |

The protocol differences between the two versions that matter to a backend are absorbed by Mineflayer (for example sneaking moved to the `player_input` packet in 1.21.6, `physics.js:262-270`) [source + run].

**What limits the range.**

- **Lower bound, set by the spec rather than Mineflayer.** Ack confirmation needs sequence numbers (1.19), `entity_hurt` 1.19.4 (decision 88), `#all_signs` 1.20 (decision 116), and `ItemStack.components` assumes data components (1.20.5, PD-4). So the floor is 1.20.5, even though Mineflayer goes back to 1.8.8.
- **Upper bound, set by the libraries and the toolchain.** The pinned libraries go up to 26.1. 26.x requires Java 25, which this environment lacks, so it was not tried. It ships unobfuscated jars, so the extractor needs a variant without mappings.
- **Cost per version.**
  - The automated steps (fetch, data generator, extractor) take minutes.
  - The hand-authored tables need a review.
  - The conformance suite must pass.
  - Mineflayer, protocol or vanilla changes that break the suite need backend work. None did between 1.21.4 and 1.21.11 for the exercised primitives.

**Residual risk.**

- mineflayer-pathfinder has not been released since 2023. It worked on 1.21.4 in every E5 case, but 1.21.4-specific blocks are untested in its movement costs (e.g. `pale_oak`). E1, E2, E4 and E5 were not rerun on 1.21.11.
- A version bump re-runs the data generator and the extractor; nothing else in the contracts depends on the version.

## E1. Clock and ingest (PD-2, §15.5)

**Setup.** `node experiments/e1-clock.mjs --minutes 10`.

The stub runtime's `tick()` is driven from Mineflayer's `physicsTick` event. Mineflayer emits it after simulating and before sending the position packet (`node_modules/mineflayer/lib/plugins/physics.js:85,89`), from a `setInterval(doPhysics, 50)` with up to 4 catch-up steps (`physics.js:75,489`) [source].

A local 50 ms timer stands in while the physics plugin is dormant: disconnected, dead, or before the first position packet (`spike/lib/clock.mjs`). A deterministic worker program cycles through `pathfind` → `dig` → async `place_block` → `look_at` → `sneak` (cancelled after 20 ticks) → `pathfind`. One of its decisions depends on the async Delta.

Outside changes during the run:

- `Rival` chats `pause` every 45 s, which makes the program cancel;
- the console resets the dug block every 70 s;
- the bot is `/kick`ed at minute 3.3;
- its socket is destroyed at minute 6.6;
- the program reconnects 100 ticks after each.

**Results [run].**

| Measure | Value |
| --- | --- |
| Ticks / wall time | 12,017 ticks in 600.89 s |
| Drift (wall − 50 ms × ticks) | **+91 ms over 10 min (+152 ppm, 1.8 ticks)**; series: +17 ms at min 1–3, +79 at min 4 (kick), +105 at min 7 (socket drop), +86 at min 10 |
| Interval, all ticks | mean 50.01 ms, sd 5.2, p01 47.7, p50 50.15, p95 51.0, p99 52.5, max 148.6 |
| Interval, timer only (offline) | mean 50.05 ms, sd 1.3, min 43.2, max 60.8 (204 intervals) |
| Short intervals (< 25 ms) / long (> 75 ms) | 88 / 45, from Mineflayer's catch-up: a late interval is followed by back-to-back steps |
| Ticks by source | physics 11,810; timer 207 (2 at start, 103 after the kick, 102 after the socket drop) |
| Clock across disconnects | kept running: 103 and 102 timer ticks, interval mean 50.05 ms; resumed on physics at the first position packet after reconnect |
| Re-entrant `tick()` calls | 0 |
| Cost of `tick()` | median 0.55 ms, p99 4.2 ms, max 56 ms (chunk encoding right after reconnect) |
| TickInput contents | 14,811 key changes (13,334 Own, 1,477 Outside); 383 `chunk_load`, 32 `chunk_unload`; events: 199 `entity_appeared`, 180 `entity_gone`, 71 `item_collected`, 14 `chat`, 1 `system`; reports: 10,692 Running, 187 Issued, 469 Confirmed, 4 Rejected; infra: 3 `connected` + `spawned`, 1 `kicked`, 1 `disconnected` |
| Measurements | `path_progress` non-null in 6,647 ticks; `round_trip_ms` in 12,015 (mean 0.8 ms, max 33) |
| Validation | 12,017/12,017 TickInputs and RecordedTicks valid; 584 StartRequests, 95 Deltas valid |
| **Replay** | recording replayed through a fresh stub: **12,711 decisions identical** (694 operations: 199 `pathfind`, 95 each of `dig`, `place_block`, `look_at`; 100 `sneak`; 108 cancels; 2 reconnects) |
| Replay controls | one perturbed report (a Confirmed changed to Rejected): divergence **detected**; replay without the recorded Deltas: **diverges** (the program reads the predicted value) |

The first version of the stand-in timer took over after 75 ms of physics silence. It double-counted ticks whenever a physics tick was merely late: 3 extra ticks in a 1-minute run (−2,834 ppm). The final driver instead mirrors the conditions under which `physics.js:79-82` stops emitting (play state, finite position, loaded chunk, `shouldUsePhysics` cleared on login/death/respawn/mount and set by `forcedMove`) [source + run].

**Verdict: go.** PD-2 holds with Mineflayer:

- one synchronous runtime tick per physics tick, never re-entrant;
- a clock that keeps running across kicks and socket loss;
- a fully JSON-serialisable TickInput covering every category the schema has;
- an exact replay.

**Residual risk.**

- **Jitter is Mineflayer's own.** Catch-up bursts put up to 4 ticks back to back after an event-loop stall (148 ms worst case here). Decisions are per tick, so this affects only wall-clock pacing.
- **Delta replay.** Replay needs the async Deltas (SE-6, D3-10).
- **Chunk encoding.** Encoding chunks into `chunk_load` runs costs up to 56 ms per tick right after (re)connect with view distance 4; a production backend should encode from the palette sections directly.
- **ItemStack components.** Only `damage` is mapped into vanilla codec JSON; other network components are dropped and counted (`spike/lib/keys.mjs`). PD-4 needs a real codec mapping in production.
- **Keys not exercised.** Light, sign text, effects, equipment, passengers, tags and recipes were not exercised (no scenario touched them). Their mechanism is the same packet → mirror → diff path.

## E2. Packet flushing (S-1, finding 3)

**Setup.** `node experiments/e2-flush.mjs`. Every call is made from inside a tick's phase 6, as `start()` would make it.

- 12 high-level Mineflayer mappings from §18.4 and 3 of the spike's direct-packet primitives run twice: with the write gate open (`immediate`) and closed (`deferred`).
- A wrapper on `bot._client.write` records, for every packet, the tick, the phase it was written in, the library frame that wrote it (stack), and when it actually left.

**Results: when packets are written [run + source].**

| Mapping (§18.4) | Class | Where its packets are written | Source |
| --- | --- | --- | --- |
| `dig` → `bot.dig(block)` | durative | `block_dig` start **after the tick**, in a promise continuation once the gradual look finishes (+12 ticks); `arm_animation` on a 350 ms interval; `block_dig` finish from a **timer** (+26 ticks) | `mineflayer/lib/plugins/digging.js:130` (start after `await bot.lookAt`), `:135` `setTimeout(finishDigging)`, `:149` finish write, `:158` writes its prediction into the world |
| `dig` → `bot.dig(block, true)` | durative | same, start +2 ticks | same |
| `look_at` → `bot.lookAt` | durative | `look` from the **physics step after the tick**, gradual: 6 packets | `physics.js:123` (`updatePosition`, called at `:89` after the `physicsTick` emit) |
| `place_block` → `bot.placeBlock` | instant | `block_place` in a promise continuation after the awaited look (+7 ticks) | `generic_place.js:75` (after `:37 await bot.lookAt`) |
| `pick_up` → `bot.clickWindow(9, 0, 0)` | instant | `window_click` **synchronously in phase 6** | `inventory.js:630` |
| `pick_up` → `bot.clickWindow(36, …)` right after a dig | instant | phase 6 in this run; the source sleeps up to 500 ms when a hotbar slot is clicked within `DIG_CLICK_TIMEOUT` of a dig | `inventory.js:575-579` |
| `sneak`, `sprint`, `hold_jump` → `setControlState` | ongoing | `player_input` / `entity_action` synchronously in phase 6 and in `cancel`; resulting `position` packets from the physics step after every tick | `physics.js:247-284`, `:112` |
| `hold_use` → `activateItem` / `deactivateItem` | ongoing | `use_item` in phase 6; `block_dig` (status 5) in `cancel` | `inventory.js:120-158` |
| `select_hotbar` → `setQuickBarSlot` | instant | `held_item_slot` in phase 6 | |
| `attack` → `bot.attack` | instant | `use_entity` and `arm_animation` in phase 6 | `entities.js:843-855` |
| `chat` → `bot.chat` | instant | `chat_message` in phase 6 | |
| `pathfind` → mineflayer-pathfinder | durative | control states set by the pathfinder's own `physicsTick` listener (`entity_action` sprint at `physics.js:255`); 35 `position_look` and 4 `position` packets from the physics step after each tick | `mineflayer-pathfinder/index.js:166` (`bot.on('physicsTick', monitorMovement)`), `:607-627` |
| spike `dig` (direct) | durative | `look` + `block_dig` start in phase 6; `block_dig` finish written in `flush()` of the tick the counted dig time elapses (+16 ticks for dirt); `arm_animation` in `flush()` | `spike/lib/backend.mjs` `Dig` |
| spike `place_block` (direct) | instant | `look` + `block_place` + `arm_animation` in phase 6, in that order | `PlaceBlock` |
| spike `look_at` | durative | `look` from the physics step after the tick | `LookAt` |

**Results: the gate [run].**

- With the gate closed, **0 packets escaped `flush()` in all 15 deferred cases**, and every case still succeeded: the block broke, the window click applied, the stairs faced the right way, the pathfinder reached its goal.
- Packets written between ticks wait for the next flush: mean 45–50 ms, max 51 ms. Packets written in phase 6 leave in the same tick's flush: ≤ 0.4 ms.
- With nothing running, the only traffic is Mineflayer's 1-second keep-alive `position` from the physics step; the gate holds it too.

**What is neither deferrable nor confined to phase 6.**

- Without the gate, three kinds of packet leave outside phase 6:
  - the physics step's movement packets (every tick, after the runtime tick, `physics.js:89`);
  - `bot.dig`'s and `bot.placeBlock`'s packets after their awaited looks;
  - `bot.dig`'s finish timer.
- With the gate, every play-state packet is deferrable. The gate passes only login and configuration-state packets, which precede the clock.
- **Nothing remained undeferrable.**

**Ordering, a consequence found in E6.** With deferred flushing, a look left to the physics step reaches the server one flush *after* the action's `block_place`.

- Stairs placed that way faced west where the bot was looking east (E6 placement case 16).
- So primitives that need a rotation must write their own `look` before their action packet in phase 6. The spike's `place_block` and `dig` do this (`lookMode: "direct"`).
- It also causes a redundant second `look` from the physics step afterwards; it is harmless.

**Is "immediate" conforming under §15.5?** Yes.

- §15.5 defines determinism over "the same per-tick backend input". The runtime's decisions in E1 depend only on TickInput, and the replay reproduced them without any packet timing.
- When packets leave changes what the server does. But whatever the server does reaches the runtime only through a later TickInput, which is recorded.
- Deferral still buys two things:
  - **Cancel can unsend.** A start and cancel in the same tick never reach the server: E4 S11b placed the block 3/3 times with immediate flushing and 0/3 with deferred.
  - **A tick's packets leave contiguously, in phase 7.**

**Verdict: go, deferred,** with direct packets for `dig`, `place_block` and window clicks (D3-2, D3-3).

**Residual risk.**

- Deferral adds one tick (≤ 51 ms) to every packet produced between ticks. That includes the physics step's movement packets, so the server sees movement one tick late. Constant, and harmless to vanilla's movement checks [assumed; no movement kicks in any run].
- Keep-alive and teleport-confirm responses wait for the next flush; harmless at 50 ms against vanilla's 15 s keep-alive timeout [assumed].
- Primitives not exercised (`interact`, `use_item`, `edit_sign`, books, `respawn`, `leave_bed`, `steer`, `dismount`, the trade/anvil/button windows) write synchronously when sent directly, so they are deferrable by construction [source]. Not run.

## E3. Verdicts for representative primitives (§17.1, §14.3)

**Setup.** `node experiments/e3-verdicts.mjs`, deferred flushing.

The primitives are implemented in `spike/lib/backend.mjs`:

- **`dig`: ack + state.**
  - *Start digging* with a fresh 1.19+ sequence number.
  - The dig time is counted in ticks; *finish digging* uses a second sequence number.
  - Verdict when `acknowledge_player_digging` covers the finish sequence: Confirmed if the block is air (or fluid) on the confirmed view, else Rejected.
- **`place_block`: ack + state.** One `use_item_on` packet with the face-centre cursor; verdict when the ack arrives, comparing the block type at the target cell.
- **`look_at`: settle.** Running until the aim error of the *sent* rotation is ≤ 1°; Confirmed after a settle window with no server rotation correction.
- **`pick_up`, `put`, `quick_move`: settle.** One `window_click` with the current state id and the predicted changed slots and cursor; Rejected if any server slot packet contradicts the prediction.

Rejections were provoked by spawn protection (bot not op), adventure mode, an occupied target cell, `/setblock` and `/tp` from the console, and the second player clicking the same chest slot.

**Results [run].** Latency is in ticks from start to verdict; "same-value" counts server block updates that repeated the current value.

| Case | Expected | Verdict | Latency | Notes |
| --- | --- | --- | --- | --- |
| D1 ×3 dig dirt | Confirmed | Confirmed | 16–17 | 15-tick dig + 1 |
| D2 dig oak log by hand | Confirmed | Confirmed | 61 | |
| D3 dig in spawn protection | Rejected | **Rejected** | 16 | server sent 1 same-value update (ghost fix), no change in the confirmed view |
| D4 dig in adventure mode | Rejected | **Rejected** | 16 | same |
| D5 dig, `/setblock` puts the block back right after | Confirmed, then Outside | Confirmed | 16 | revert arrived 2 ticks after the verdict: refined rule **Outside**, provisional **Own** |
| D6 dig, `/setblock stone` 10 ticks in | (runtime: `BlockChanged`) | Rejected | 61 | "stone at the acknowledgement" |
| D7 dig, the second player breaks the block mid-dig | (runtime: `BlockChanged`) | Confirmed | 61 | the block is air, so ack + state cannot tell; the dig's `@invariant` catches it at the runtime |
| P1 place dirt | Confirmed | Confirmed | 1 | |
| P2 place in spawn protection | Rejected | **Rejected** | 1 | 2 same-value updates, no change |
| P2c place in spawn protection onto a cell that already holds dirt | Rejected | **Confirmed** | 1 | **false Confirmed by coincidence**: the state already matched |
| P3 place in adventure mode | Rejected | **Rejected** | 1 | |
| P4 place into an occupied cell | Rejected | **Rejected** | 1 | |
| P5 place, `/setblock air` right after | Confirmed, then Outside | Confirmed | 1 | refined Outside, provisional Own |
| P6 oak log on a side face | Confirmed | Confirmed | 1 | state `axis=z` vs predicted default `axis=y` (type matches) |
| P7 torch on a side face | Confirmed | **Rejected** | 1 | **false Rejected**: server placed `wall_torch[facing=east]`, default-state prediction was `torch` |
| P8 torch on top | Confirmed | Confirmed | 1 | |
| L1 look_at | Confirmed | Confirmed | 24 | gradual turn + 4-tick settle |
| L2 look_at, `/tp` sets the rotation when the aim is reached | Rejected | **Rejected** | 23 | correction inside the settle window |
| W1–W7 pick_up / put / half / one / quick_move both ways | Confirmed | Confirmed ×7 | 5 | server sends **nothing** on success; quick_move destination slots predicted correctly both ways |
| W8 pick_up with a stale state id | (resync) | Confirmed | 5 | server applied the click and resent the whole window (1 `window_items`), which matched the prediction |
| W9 pick_up after the second player quick-moved the slot away | Rejected | **Rejected** | 1 | server corrected the cursor to empty |
| W10 pick_up after the second player added one to the slot | Rejected | **Rejected** | 1 | server corrected the cursor count |
| **W11** put, addressed to a window id the server has closed | Rejected / Unconfirmed | **Confirmed** | 5 | **false Confirmed**: vanilla ignores clicks for another window id and sends nothing. After the close, the inventory mirror held 20 oak logs, the server 10 (`/clear … 0`): a lasting desync |
| W12 ×6 pick_up while the console removes the chest in the same tick | race | Confirmed ×6 | 5 | the click always won the race; server and mirror agreed afterwards (10 = 10) |
| **W13** pick_up confirmed by **probe** (no-op click on slot −1, stale state id) | Confirmed | **Confirmed** | **1** | the server answered the probe with the full window state |
| **W14** the W11 case with the probe | Unconfirmed | **no verdict** (the runtime's `confirm_timeout` makes it Unconfirmed) | — | the ignored click can no longer be confirmed |

**Async mode (dig, place_block): predicted Delta vs what the server confirmed.**

| Case | Predicted | Server | Exact | Type | Verdict |
| --- | --- | --- | --- | --- | --- |
| A1 dig dirt | air | air | yes | yes | Confirmed |
| A2 dig oak log | air | air | yes | yes | Confirmed |
| A3 place dirt | dirt | dirt | yes | yes | Confirmed |
| A4 place oak log on a side face | `oak_log[axis=y]` | `oak_log[axis=z]` | no | yes | Confirmed |
| A5 place torch on a side face | `torch` | `wall_torch[facing=east]` | no | no | Rejected (false) |
| A6 place torch on top | `torch` | `torch` | yes | yes | Confirmed |
| A7 dig in spawn protection | air | dirt | no | no | Rejected |
| A8 place in spawn protection | dirt | air | no | no | Rejected |

With the placement table's prediction (E6) in place of the item's default state, A4 and A5 become exact.

**Ack and state in one TickInput.** For 7 of 7 confirmed digs by the bot itself, the block change and the acknowledgement arrived in the same TickInput. Vanilla sends both in one server tick. D7, where the second player broke the block, is the expected exception.

**Can Rejected always be told apart from Confirmed (§14.3 Folding)?**

- **ack + state (`dig`, `place_block`): yes, with two qualifications.**
  1. When the cell already holds the predicted value, a refused action reads as Confirmed (P2c; also D7). The world is then as intended, so this is benign for the action itself.
  2. The prediction must be the right one: the default-state prediction gives a false Rejected for wall-mounted variants (P7/A5). Fixed by the placement table (SP-7) and type-granular folding (SP-2).
- **settle (`look_at`): yes** for corrections (L2).
- **settle (window clicks): no.** Vanilla acknowledges a correct click with silence and also ignores a click for a closed window with silence (W11). **Resync** (W13/W14) fixes this: confirmed by state in 1 tick, and an ignored click never confirms. Proposed for §17.1 (SP-6, D3-5).

**Ghost blocks (§14.5).** Not an Outside change back.

- The spike's confirmed view never holds a prediction.
- Refused digs and places drew 1–2 server updates repeating the current value, and the confirmed view saw **no change**.
- The runtime-side prediction is discarded by rollback.
- The §14.5 pitfall sentence needs rewording (SE-4, SP-3).

**Verdict: go** for `dig` and `place_block` (ack + state), `look_at` (settle) and window clicks, **with resync confirmation instead of settle** for the clicks (D3-5) and placement-table predictions (D3-7).

**Residual risk.**

- Unexercised: `swap_hotbar`, `throw`, `throw_cursor`, `click_button`, `select_trade`, `rename`.
- Ack/state co-delivery is only guaranteed by the proposed hold-back rule (SE-8), which the spike did not implement.
- A spawn-protection refusal of a dig takes the full dig time before it is Rejected. The server's corrective update arrives at the start, so a backend could reject early.

## E4. Attribution (S-2, question 4)

**Setup.** `node experiments/e4-attribution.mjs --reps 3`: 15 scripted scenarios, 3 repetitions each, on the deferred backend with local RTT (≤ 33 ms, so the settle window is 4 ticks).

- **Ground truth.** In each scenario the second player or the console changes **the same keys** the bot acts on. Every key change on a scenario key from the scenario's first `start` on gets a causal label: Own iff caused by the bot's action and that action was not cancelled or rolled back (§14.5).
- **Rules.** Each change is tagged by three rules (`spike/lib/attribution.mjs`):
  - **P, provisional**: Own(a) iff the key is in a's affected set, between `start(a)` and the verdict + `max(4t, 2 × RTT)`, and a was not cancelled or rolled back.
  - **R, refined**: the key is in a's affected set; a is live (from start to the TickInput carrying its verdict); a was not cancelled or rolled back; the value agrees with a's prediction at confirmation granularity (if it has one); and the change is not a server correction of the bot's position or rotation.
  - **A, runtime-side (S-2 no-go)**: R recomputed after the fact from recorded data, as a runtime would after phase 2: start and verdict ticks, Deltas, rollbacks. It cannot see the backend's correction flag.

**Results [run].** 529 labelled changes. **No rule produced a single false Outside.**

| Scenario | Changes | P false Own | R false Own | A false Own |
| --- | --- | --- | --- | --- |
| S1 second player breaks the block being dug | 3 | 3 | 3 | 3 |
| S2 console replaces the block being dug with stone (dig Rejected) | 3 | **3** | 0 | 0 |
| S3 dig confirmed, console puts the block back right after | 9 | **3** | 0 | 0 |
| S4 dig confirmed, second player places a block in the cell right after | 9 | **3** | 0 | 0 |
| S5 place confirmed, console removes it right after | 9 | **3** | 0 | 0 |
| S6 console overwrites the placed block in the same tick | 6 | **3** | 0 | 0 |
| S7 pick_up of a slot the second player emptied a moment before | 3 | 3 | 3 | 3 |
| S8 put, second player adds to the same slot during the settle window | 6 | **3** | 0 | 0 |
| S9 console teleports the bot during `pathfind` | 262 | **3** | 0 | **3** |
| S9b console teleports the bot right after `pathfind` is confirmed | 60 | **3** | 0 | 0 |
| S10 second player punches the bot during `pathfind` (knockback ≈ 2.2 blocks) | 150 | 21 | 21 | 21 |
| S11 dig cancelled (freeze), then the second player breaks the block | 3 | 0 | 0 | 0 |
| S11b place started and cancelled in one tick, deferred flush | 0 | 0 | 0 | 0 |
| S11b same, immediate flush (block placed 3/3) | 3 | 0 | 0 | 0 |
| S12 async strand: first place refused, second rolled back in the same tick | 3 | 3 | 3 | 0 |
| **Total** | **529** | **54** | **30** | **30** |

**What each error costs (§9.8).** Attribution matters only when an `ensures` is false; it then decides between `Interfered` and `ContractViolation`.

- **False Own** masks interference.
  - An `ensures` that later fails on that key reports `ContractViolation`: uncatchable, and it disables the session's handlers (§11.4).
  - Example: a composite that digs a block and ensures the area is clear, run while someone puts the block back.
  - P's 24 extra false Own (S2–S6, S8, S9, S9b) are exactly this harmful kind. They are outside changes that **contradict** the action (a revert, a replacement, a teleport) yet fall inside the window after the verdict, or inside the action with a contradicting value.
- **False Outside** turns a defect into `Interfered`, which is catchable, and only when the `ensures` already fails. None was observed:
  - own late effects arrived before or with the verdict: tool damage, inventory decrements, block changes;
  - so R's tighter window (ending at the verdict) cost nothing measurable.
- **R's remaining 30 false Own:**
  - **6 benign** (S1, S7): the outside change equalled the prediction while the action was live. It can only make the action's own `ensures` hold. The dig's `BlockChanged` invariant still catches S1.
  - **21 knockback** (S10): the client-authoritative position integrates own input and outside velocity. No rule can separate them (SE-12). Bounded: `pathfind`'s `ensures` is `goal.reached`, which the pathfinder re-pursues after the push.
  - **3 same-tick rollback** (S12): the rolled-back action already had a verdict in the same TickInput, so the backend could not know at ingest. A, computed after phase 2, gets these right. Fix: the runtime re-tags (SE-3).
- **A's 3 extra false Own** (S9) are teleports. Without the backend's correction flag, a server-set position during `pathfind` looks like own movement.

**The no-go alternative (`attribution: "affected-keys"`, runtime attributes from recorded data).**

- It equals R except for two differences:
  - it fixes same-tick rollback, which R handles with a runtime re-tag;
  - it misses server corrections. Fixing that would need a new `correction` field in `KeyChange`, a 0.2 change.
- Its contract cost is also larger: `start` must return a Delta in sync mode, and `KeyChange.cause` becomes optional.
- **Recommendation:** keep `attribution: "backend"`, make R normative, and add the runtime re-tag for same-tick rollback (D3-4). The rule is normative and uses only recorded data plus the backend's correction knowledge, so a conformance test can recompute it from a recording.

**Verdict: conditional go.** The backend can attribute reliably with the refined rule; the provisional rule is not safe.

**The attribution rule, paste-ready for §14.5** (also proposed-errata.md SP-3):

> During ingest the backend tags every change to a world key as `Own(a)` or `Outside`. A change is a new value for a key; a server update that repeats a key's current value is not a change and is never attributed. The runtime records, per key, the last tick an `Outside` change touched it; §9.8 uses this to tell `Interfered` from `ContractViolation` (decision 41).
>
> **Affected keys.** Every action `a` has an *affected-key set*: the keys its primitive changes when it succeeds. Some of these keys have a *predicted value*, which is the value in `a`'s delta (§14.3). The others are open; the held slot's durability is an example. Each primitive's set is defined with the interface contracts.
>
> **Rule.** A change to key `k`, delivered in the TickInput of tick `t`, is `Own(a)` exactly when all of the following hold:
>
> 1. `k` is in `a`'s affected-key set;
> 2. `a` is *live* at `t`: `a` was started at or before `t`, and `t` is no later than the tick whose TickInput carries `a`'s verdict;
> 3. `a` was neither cancelled nor rolled back at or before `t`;
> 4. if `k` has a predicted value in `a`'s delta, the new value agrees with it at the granularity of `a`'s confirmation method (§14.3, Folding);
> 5. the change is not a server correction of a client-authoritative key, that is a server-set position or rotation of the bot (§14.1).
>
> If several actions qualify, the change is `Own` of the one started last. Every other change is `Outside`. Every action's verdict is processed before attribution (§15.2, phase 1, PD-11), so a change delivered together with its action's verdict is attributed while the action is still live.
>
> **Rollback in the same tick.** When phase 2 rolls back an action `k` (§14.4), the runtime treats every change of that tick's TickInput tagged `Own(k)` as `Outside`, even if `k` already had a verdict.

**Residual risk.**

- Only local RTT was tested. The refined rule has no RTT term; the provisional rule's window would widen on a real network.
- The affected-key set per primitive is not yet listed anywhere normative. The spike's sets are in `backend.mjs` (`affected()`), and the contracts or §17.1 need a column for them.
- Knockback (SE-12) is inherent.

## E5. Pathfinder under runtime control (S-5)

**Setup.** `node experiments/e5-pathfinder.mjs`. mineflayer-pathfinder 2.4.5 is configured per §18.4 (`spike/lib/goals.mjs`):

- `canDig = false`, `scafoldingBlocks = []`, `allow1by1towers = false`;
- `opts.avoid` as an `exclusionAreasStep` function returning a cost above the pathfinder's 100 cutoff (`movements.js:122-130, 352`).

The runtime tick runs before the pathfinder's `physicsTick` listener (`prependListener`). A cancel in phase 6 is therefore seen by the pathfinder in the same physics step.

**Results: cancel on freeze (§15.4) [run], 10 runs** cancelling a running `pathfind` mid-route:

- **Controls released in the same tick.** Controls before the cancel were `forward` + `sprint`. In the same tick after `cancel`, none were active, and none became active in any later tick (10/10).
- **Sprint stop sent inside `cancel`:** the `entity_action` stop-sprinting went out in phase 6 of the cancel tick (10/10).
- **The bot slides.** It moves 0.33 blocks over 7 ticks from a speed of 0.153 blocks/tick. This is vanilla ground friction acting on the remaining velocity, with no input. During the slide the physics step sent 8 movement packets; after that only Mineflayer's 1-second keep-alive `position` (+28 ticks, `physics.js:180-183`).
- **"No further movement packets" is therefore false in the strict sense.** The packets carry momentum, not pathfinding. A human releasing the keys produces the same packets.
- All 10 runs were cancelled at steady walking speed and gave identical numbers. Cancels mid-jump were not produced on flat ground.
- **Alternative tested:** `bot.pathfinder.stop()` released the controls only after 4 ticks, at the next node (`index.js:162-163`, `:582-585`). The backend must use `setGoal(null)`, which calls `resetPath` → `clearControlStates()` (`index.js:138`) [run + source].

**Results: `path_progress` per tick [run + source].**

- **How it is observable.** mineflayer-pathfinder exposes no node counter. It assigns `path = results.path` (`index.js:447,468`) and consumes nodes with `path.shift()` (`:586`), so the array emitted with `path_update` *is* the live path.
- The backend keeps that reference and reports `nodes completed in earlier plans + (initial length − current length)`. This relies on the pathfinder aliasing its internal array, which is fragile across pathfinder versions.
- On a 30-node route: non-null in 117 of 118 ticks (the start tick has no plan yet), never decreasing, max 5 ticks (mean 3.8) between increments.
- **Replanning.** The route was walled off mid-path: progress kept increasing across the replan, longest stall 6 ticks, well within `@progress … within 5s` (100 ticks).

**Results: `NoPath` (SE-9) [run + source].**

- **Open world.** A goal inside a closed box produced only `partial` (171) and `timeout` (1) path updates for 15 s (`astar.js:71,74`), never `noPath` (`:121`). The bot walked to the nearest node and stopped; progress stalled for 129 ticks. So the `@progress` clause (100 ticks) is what would end the call.
- **Enclosed bot.** With the bot itself enclosed (finite search space), `NoPath` arrived in 1 tick.
- **Unsatisfiable `AllOf`.** `AllOf` of two disjoint `At` goals behaved like the open world: 99 partial and 1 timeout in 10 s.

**Results: `Goal.Clear` and `Goal.AllOf` [run].**

- `Goal.Clear(pos)` is a custom goal: the bot's 0.6-wide box, centred in its node's column, must not intersect the cell.
  - Bot standing in the cell: Confirmed, moved to x = 39.685, and the exact bounding-box test holds.
  - In a 1-wide corridor: Confirmed by moving along the corridor.
- `Goal.AllOf([InReach(support), Clear(target)])` as `GoalCompositeAll` (the `place` composite's spot, decision 92): Confirmed with the box clear and the eye 2.27 blocks from the support centre.

**Results: avoid region [run].**

| Route | Verdict | Ticks with feet inside | Ticks with bounding box grazing |
| --- | --- | --- | --- |
| Region across the straight line | Confirmed (went around) | 0 | 3 |
| Region around the goal approach | Confirmed | 0 | 3 |
| Goal inside the region | no verdict in 15 s (open world, as `NoPath` above) | 0 | 0 |

The exclusion works on blocks, so the 0.3-block half-width box can clip a region's edge while passing a corner. SP-8 words the guarantee as "feet".

**Interaction with E2 and E4.**

- The pathfinder's control-state writes and the physics step's movement packets happen outside the runtime tick. With the gate they all leave in the next `flush()` (E2), one tick late.
- `player.position` is the client simulation (§14.1), so pushes during `pathfind` are tagged Own (E4 S10), while server teleports are Outside under the refined rule (E4 S9).

**Verdict: go** (D3-9).

**Residual risk.**

- Progress depends on the pathfinder's internal array aliasing; pin the pathfinder version.
- Parkour, water, ladders and doors were not exercised.
- `GoalNear` measures integer node distance, while the spec's `Goal.Near` measures from `bot.pos` to the cell centre. The backend's verdict must use the spec's `goal.reached`, not the pathfinder's `isEnd`, or a `ContractViolation` can follow.

## E6. Version data (S-3, question 5, finding 4)

**Setup.**

- `./scripts/datagen.sh`: the vanilla data generator, `java -DbundlerMainClass=net.minecraft.data.Main -jar server.jar --all`, 12 s, 37 MB.
- `./scripts/extract-shapes.sh`: a 147-line Java tool, `spike/tools/ShapeExtractor.java`. It bootstraps the pinned `server.jar` and reads, by reflection through Mojang's published `server_mappings.txt` (SHA-1 verified), every block state's outline and collision shape, hardness, `requiresCorrectToolForDrops`, and every `BlockItem`'s block, including wall variants. About 5 s.
- `node experiments/e6-data.mjs`: inventory, cross-checks, and validation against the running server.

**Data generator inventory [run].**

| Content | Present |
| --- | --- |
| Registries | 80 (including `minecraft:menu`, which confirmed the backend's menu ids) |
| Blocks / states | 1,095 / 27,866 |
| Items | 1,385; 33 with a `minecraft:tool` component (speeds and correct-for-drops rules) |
| Tags | 186 block, 173 item, 35 entity-type, and more |
| Recipes / loot tables | 1,370 (22 types) / 1,237 |
| Hardness, collision shapes, outline shapes, burn times, item → block, requires-correct-tool | **absent** |

**minecraft-data 3.117.0 (`pc/1.21.4`) vs the server [run].**

| Datum | Coverage | Agreement with server | Gaps |
| --- | --- | --- | --- |
| Blocks and state ids | 1,095 / 1,095 | 0 id mismatches vs the data generator | — |
| Hardness | 1,095 / 1,095 | 1,095 / 1,095 vs the extract | — |
| Requires correct tool (`harvestTools` present) | 1,095 | 1,095 / 1,095 vs the extract | — |
| Harvest tools per tier | 380 blocks | 11,625 / 11,625 tool × block pairs vs the data generator's tool rules | — |
| Tool speeds (`material` → `materials`) | all | **1,392 pairs disagree** with the data generator (828 on blocks with hardness > 0) | **Wrong for ores and obsidian.** Their `material` is `incorrect_for_wooden_tool`, which lists only wooden tools, so every other pickaxe gets speed 1. Composite materials (leaves, plants, cobweb) also miss hoe and sword speeds |
| Collision shapes | 27,866 / 27,866 states | 27,866 / 27,866 identical to the extract | — |
| Outline shapes | **none** | — | **14,512 states (302 blocks) have outline ≠ collision; 242 blocks have an empty collision shape but a real outline** (saplings, torches, wall torches, short grass, wheat). Reach ray casts (§17.3) cannot target them with collision shapes |
| Furnace burn times | **none** | — | items carry only id, name, display name, stack size |
| Item → block | by name only (943 items share a block name) | — | **74 block items place a differently named block or a wall variant** (`torch` → `torch`/`wall_torch`, `wheat_seeds` → `wheat`, coral fans, …): only the extract knows them |

**Validation against the server [run].**

*Dig times.* 16 block/tool combinations.

- The server breaks a block whose STOP came too early once enough progress accumulates ("delayed destroy"). Sending START and STOP together therefore measures the server's own dig time.
- Observed ticks minus the model are in **[0, 2] for all 16**: model = data-generator tool speed, extracted hardness, ×30 or ×100 by `can_harvest`, `serverDelayedTicks = ⌈1/perTick⌉ − 1`. The offset is the flush and network delay.
- **Mineflayer's own `bot.digTime` (prismarine-block over minecraft-data) was wrong for 9 of 16**: iron, gold and diamond ore with any pickaxe; obsidian 1,500 vs 188 ticks; cobweb with a sword 120 vs 8; leaves with a hoe.

| Block | Tool | Model ticks (client) | Observed (server) | Mineflayer | Drop |
| --- | --- | --- | --- | --- | --- |
| dirt | hand | 15 | 16 | 15 | dirt |
| oak_log | hand / stone_axe | 60 / 15 | 60 / 15 | 60 / 15 | oak_log |
| stone | hand / wooden_pickaxe | 150 / 23 | 149 / 23 | 150 / 23 | none / cobblestone |
| iron_ore | wooden / stone pickaxe | 150 / 23 | 151 / 23 | **300 / 91** | none / raw_iron |
| gold_ore | stone / iron pickaxe | 75 / 15 | 74 / 15 | **300 / 91** | none / raw_gold |
| diamond_ore | stone / iron pickaxe | 75 / 15 | 75 / 15 | **300 / 91** | none / diamond |
| obsidian | diamond_pickaxe | 188 | 187 | **1,500** | obsidian |
| oak_leaves | iron_hoe / hand | 0 (instant) / 6 | 1 / 6 | **6** / 6 | — |
| sand | wooden_shovel | 8 | 8 | 8 | sand |
| cobweb | iron_sword | 8 | 8 | **120** | string |

*`can_harvest`.* 16 / 16 drop outcomes agree with the model, across four tier boundaries:

| Block | No drop with | Drops with |
| --- | --- | --- |
| stone | hand | wooden pickaxe |
| iron_ore | wooden pickaxe | stone pickaxe |
| gold_ore | stone pickaxe | iron pickaxe |
| diamond_ore | stone pickaxe | iron pickaxe |

*Burn times.* The hand-authored table `spike/data/burn-times.json` agreed with the furnace's lit duration (window property 1) for **17 / 17 fuels**: logs, planks, stick, coal, charcoal, coal block, sapling, lava bucket, blaze rod, dried kelp block, bamboo, slab, wooden pickaxe, crafting table, scaffolding, stairs.

*Placement table.* The draft v0.1 table `spike/data/placement-table.json` (evaluator `spike/lib/placement.mjs`) agreed with the server in **17 / 19 cases**:

- rotated pillars on three faces;
- saplings on grass, and refused on stone;
- torch on top, on a side (`wall_torch[facing]`), and refused on the bottom face;
- wheat and carrots on farmland, and refused on grass;
- slab bottom/top by face and cursor height;
- stairs facing;
- chest facing;
- default-state cubes.

Both misses are known and explained:

1. A torch on a fence top: vanilla accepts centre support, while v0.1 requires a full face (out of scope).
2. Stairs with the look left to the physics step faced the stale yaw (E2 ordering finding). With the direct look the same case is correct.

**Placement table v0.1 scope (drafted).**

- **In:**
  - logs, wood, stems and other rotated pillars (axis from the face);
  - saplings (top face, on `#dirt` or farmland);
  - `torch`, `soul_torch`, `redstone_torch` (top → standing, side → wall with `facing`, bottom → refused, sturdy full face required);
  - crop seeds: wheat, beetroot, carrot, potato, melon, pumpkin (top face on farmland, `age=0`);
  - slabs and stairs per `supported_state` (core.golem: axis, horizontal facing, slab type, stair half);
  - chest, furnace, smoker and blast furnace facing;
  - full-cube scaffold blocks (dirt, cobblestone, stone, planks, cobbled deepslate, netherrack, sand, gravel, …) at their default state.
- **Out:** doors, beds, signs, banners, buttons, levers, rails, redstone wire, fences and walls (connection state), waterlogging, double slabs, stacking (snow, candles, pickles), non-full support.

This covers `contracts/examples/lumberjack/` (logs, `place`/`place_state` in `core.golem`) and the std listings' scaffold and replant needs.

**Data-source table (question 5).**

| Datum | Source | Version | Gaps | Fallback |
| --- | --- | --- | --- | --- |
| Registries, block states and ids, tags, recipes, menu ids | vanilla data generator | 1.21.4 `server.jar` | — | — |
| Tool speeds, correct-for-drops tiers | data generator: `reports/items.json` `minecraft:tool` + `mineable/*`, `incorrect_for_*` tags | 1.21.4 | — | minecraft-data `harvestTools` (agrees 11,625 / 11,625) for tiers; **not** its `materials` for speeds |
| Hardness | server-jar extract | 1.21.4 | — | minecraft-data 3.117.0 (agrees 1,095 / 1,095) |
| Requires correct tool for drops | server-jar extract | 1.21.4 | — | minecraft-data `harvestTools` presence (agrees 1,095 / 1,095) |
| Collision shapes | server-jar extract | 1.21.4 | — | minecraft-data (identical 27,866 / 27,866) |
| **Outline shapes** (reach, §17.3) | **server-jar extract** | 1.21.4 | random XZ offsets of flowers and grass are per position and not in a per-state shape | none: minecraft-data lacks them (242 blocks would be unreachable) |
| Item → block (incl. wall variants) | server-jar extract | 1.21.4 | — | name equality is wrong or absent for 74 of 955 block items; the placement table names the v0.1 ones |
| Placement rules (`can_place`, placed state) | hand-authored placement table, v0.1 scope | 1.21.4 | out-of-scope blocks; sturdy-face approximated by a full-cube collision shape | — |
| Furnace burn times | hand-authored table | 1.21.4 | items outside the table | the extractor could read vanilla's `FuelValues` with tags loaded (not attempted) |
| Dig-time formula | spec / vanilla, with the above | — | effects, enchantments, water and air multipliers not exercised | — |

**Toolchain dependency.** The compiler needs the data generator output, so it needs Java 21 and the version's `server.jar` (and the extract needs Mojang's `server_mappings.txt`). Both are fetched once per version by script.

**Verdict: conditional go, with sources different from the default.** minecraft-data alone is insufficient: no outline shapes, no burn times, wrong ore speeds. The extract plus the data generator covers every datum, validated against the server, except two that need hand-authored v0.1 tables: placement and burn times (D3-7, C-5).

**Residual risk.**

- The extractor depends on Mojang continuing to publish mappings. For 26.x, Mojang ships unobfuscated jars, which simplifies it.
- It uses reflection on internal method names, so each version bump must re-run its self-check (collision vs minecraft-data, which was exact).
- Enchantment and effect multipliers in dig time were not validated.
- The placement table is v0.1-scoped.

## Housekeeping

`contracts/CONTRACTS.md` (status paragraph) and `contracts/ESCALATIONS.md` (header and "Status" lines) still refer to `docs/spec/errata.md`. That file was deleted when errata v0.2.1 was applied into `golem-spec-v0.2.md` (commit 5e71ece). Left untouched because `contracts/` is frozen; the fix is part of C-6.

`cd contracts && npm test` passes at the end of the spike, and `git diff main -- contracts docs/spec` is empty.

## Version pins

| Component | Pin |
| --- | --- |
| Minecraft | 1.21.4, protocol 769, `server.jar` SHA-1 `4707d00eb834b446575d89a61a11b5d548d8c001`, mappings SHA-1 `0b1e60cc509cfb0172573ae56b436c29febbc187` |
| Java | 21 (tested with OpenJDK 21.0.12) |
| Node.js | ≥ 20 (tested with 22.22.0) |
| mineflayer | 4.39.0 |
| mineflayer-pathfinder | 2.4.5 |
| minecraft-protocol | 1.68.0 |
| minecraft-data | 3.117.0 |
| prismarine-physics / -block / -chunk / -windows / -item | 1.11.1 / 1.23.0 / 1.41.0 / 2.10.0 / 1.18.0 (transitive, locked) |
| vec3 | 0.2.0 |
| ajv (validation, from `contracts/`) | 8.17.1 |
