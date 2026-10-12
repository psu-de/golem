# Phase 3 spike report: Mineflayer backend feasibility (input to D3)

2026-10-12 · backend lead (agent) · for sign-off by Paul at decision point D3

This spike tested the backend assumptions behind spec §14–§15 against a real vanilla 1.21.4 server with Mineflayer, as SPIKE_DEPENDENCIES.md S-1 to S-5 and review question 3 require. Every number below comes from a recorded run whose summary is committed under `spike/results/<experiment>/summary.json`. The harness and a one-command reproduction are in `spike/` (see `spike/README.md`). Spec questions raised are in [ESCALATIONS.md](ESCALATIONS.md) (SE-1 to SE-13). The drafted spec and contract text is in [proposed-errata.md](proposed-errata.md).

**Kinds of evidence.** Each claim is marked with where it comes from:

- **[run]**: observed in a recorded run;
- **[source]**: read in library source, cited as file:line under `spike/node_modules/`;
- **[assumed]**: inferred from vanilla behaviour that was not tested directly.

## Summary

| Item | Verdict | Deciding evidence | Consequence |
| --- | --- | --- | --- |
| **S-1** packet flushing | **Go (deferred)** | E2: a write gate on `bot._client.write` held every play-state packet of 15 mappings to `flush()`. 0 escaped in 15 deferred runs; all succeeded. Mineflayer's high-level calls send outside phase 6: from timers, promise continuations and the physics step [run + source]. Cost: up to one tick of latency for packets produced between ticks (mean 49.6 ms) | Keep `flush: "deferred"`. Implement `dig`, `place_block` and window clicks as direct packets, not `bot.dig`/`bot.placeBlock`/`bot.clickWindow`. Wording errata for §15.2 step 7, §15.5 and §18.4 (SP-4, SP-5, SP-10) |
| **S-2** attribution | **Conditional go (rule changes)** | E4: 526 labelled changes. The provisional rule gave ⟨P⟩ false Own; ⟨Pharm⟩ of them were outside changes inside its post-verdict window, the harmful kind. The refined rule gave ⟨R⟩ false Own: ⟨Rkb⟩ knockback, which no rule can label; ⟨Rben⟩ benign; ⟨Rrb⟩ same-tick rollback, fixed by a runtime re-tag. Neither rule gave a false Outside. The runtime-side variant (no-go option) misses server corrections | Adopt the refined rule as normative §14.5 text. Attribution stays `"backend"`; no contract shape change. Errata SP-3, C-1 |
| **S-3** version data | **Conditional go (sources change)** | E6. The data generator gives registries, states, tags, recipes and tool rules, but no hardness, shapes, burn times or item→block mapping. minecraft-data 3.117.0 matches the server on hardness and collision shapes. It has no outline shapes and no burn times, and gives wrong ore dig speeds (Mineflayer's dig time 91 vs 23 ticks observed). A server.jar extractor via Mojang's mappings supplies outline shapes; burn-time and placement tables were validated against the server | `physics` source becomes the server-jar extract; add a `fuel` table; a placement table with explicit v0.1 scope. Errata SP-9, C-5 |
| **S-4 / Q3** version pin | **Go: 1.21.4, protocol 769** | E0: mineflayer 4.39.0, minecraft-protocol 1.68.0 and minecraft-data 3.117.0 list 1.21.4 as supported. mineflayer-pathfinder 2.4.5 is version-agnostic and worked on it in E5. Every experiment ran on 1.21.4 | No change to the contracts examples |
| **S-5** pathfinder | **Go** | E5: cancel by `setGoal(null)` releases the controls in the same tick (⟨c⟩ of 10). The bot then slides ⟨slide⟩ blocks over ⟨still⟩ ticks (vanilla momentum) with no input-driven movement. `path_progress` is readable every tick and never decreases, max ⟨gap⟩ ticks between increments, across replans. `Goal.Clear` and `Goal.AllOf` work. `NoPath` appears only for an exhausted search (SE-9) | Keep `Measurements.path_progress`. Errata: cancel via `setGoal(null)`, `NoPath` wording (SP-8, SP-10) |

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
| D3-1 | Pin Minecraft **1.21.4** (protocol 769), Java 21, mineflayer 4.39.0, mineflayer-pathfinder 2.4.5, minecraft-protocol 1.68.0, minecraft-data 3.117.0, exact versions with a lockfile | All four list or tolerate 1.21.4 (E0); every experiment ran on it; the contracts examples already use it | Proposed |
| D3-2 | S-1: **deferred flush** through a write gate on `bot._client.write`; `cancel` drops still-queued packets; immediate flushing is also conforming | E2: 0 escaped, all mappings work; E4 S11b: a start and cancel in one tick never reaches the server. Determinism is at the ingest boundary (§15.5) | Proposed |
| D3-3 | Implement `dig`, `place_block` and the window primitives as **direct packets**, not `bot.dig`/`bot.placeBlock`/`bot.clickWindow`; send the look before `use_item_on` in the same flush | E2: the high-level calls send from timers and continuations and write predictions into Mineflayer's world; E6: a look left to the physics step makes stairs face the old way | Proposed |
| D3-4 | S-2: **refined attribution rule**, normative in §14.5 (live = start to verdict TickInput; value-consistent; server corrections Outside; same-value updates are not changes; runtime re-tags same-tick rollbacks); `capabilities.attribution` stays `"backend"` | E4: false Own ⟨P⟩ → ⟨R⟩, the harmful post-verdict class eliminated, 0 false Outside; runtime-side computation lacks the correction signal | Proposed |
| D3-5 | Window primitives confirm by **resync** (no-op probe click with a stale state id) instead of settle | E3 W11: settle falsely confirmed an ignored click and left a lasting desync; W13: probe confirms by state in 1 tick; W14: an ignored click stays unconfirmed | Proposed |
| D3-6 | Ack-confirmed actions: the backend delivers a matching affected-key change in the **same TickInput as the acknowledgement** | Prevents a spurious `BlockChanged` on the bot's own success (SE-8); locally ⟨split⟩ of ⟨digs⟩ digs arrived together, but nothing guarantees it on a network | Proposed |
| D3-7 | S-3: version data from the data generator (registries, tags, recipes, tool rules) + a **server.jar extract via Mojang's mappings** (hardness, requires-tool, outline and collision shapes, item→block) + hand-authored **placement** and **burn-time** tables with explicit v0.1 scope | E6: the extract matches minecraft-data on 27,866/27,866 collision shapes and 1,095/1,095 hardness values, and adds outline shapes (242 blocks have outline but no collision). Burn times 17/17 and placement ⟨pl⟩ validated on the server | Proposed |
| D3-8 | Contracts: C-1 to C-4 and C-6 as **0.1.1** (descriptions only); C-5 (`VersionDataSources`) as **0.1.1 under the D3 clause** (SE-13) | Only provisional definitions change; no IR, report or command shape changes | Proposed |
| D3-9 | S-5: keep `Measurements.path_progress` (cumulative nodes reached); cancel `pathfind` with `setGoal(null)`; `NoPath` only on an exhausted search, otherwise the `@progress` clause ends the call | E5 | Proposed |
| D3-10 | `RecordedTick` stays as is; the Delta must be a pure function of (primitive, args, confirmed view, version data) so replay recomputes it | E1: replay is identical with the deltas and diverges without them (SE-6) | Proposed |
| D3-11 | Accept the spec errata SP-1 to SP-10 as spec v0.2.2 | Wording only; no semantic redesign | Proposed |

---

⟨E-sections follow⟩
