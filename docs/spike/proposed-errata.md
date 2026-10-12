# Proposed errata from the Phase 3 spike (for D3)

**Status: DRAFT, not applied.** Every change below is proposed for Paul to accept at decision point D3. Nothing under `docs/spec/` or `contracts/` has been edited. The evidence for each patch is in [REPORT.md](REPORT.md) (experiment E*n*) and the questions in [ESCALATIONS.md](ESCALATIONS.md) (SE-*n*).

**Numbering.** Spec patches are SP-1 to SP-10, proposed as **spec errata v0.2.2**; v0.2.1 is already applied into `golem-spec-v0.2.md`, commit 5e71ece. Contract changes are C-1 to C-6, each classified under the versioning rule of `contracts/CONTRACTS.md` ("Versioning and freeze policy").

| Patch | § | Item | Summary |
| --- | --- | --- | --- |
| SP-1 | §14.1 | SE-10 | Rotation convention and the confirmed rotation |
| SP-2 | §14.3 | SE-5, SE-6 | Folding granularity; the Delta is a pure function |
| SP-3 | §14.5 | S-2, SE-1–SE-4, SE-12 | Normative attribution rule; ghost blocks |
| SP-4 | §15.2 step 7 | S-1, SE-11 | Flush sends every queued packet |
| SP-5 | §15.5 | S-1, SE-6, SE-11 | Determinism at the ingest boundary |
| SP-6 | §17.1 | SE-7 | New confirmation method *resync*; window primitives use it |
| SP-7 | §17.1 | SE-5, S-3 | `place_block` predicts the placement-table state |
| SP-8 | §17.1 | SE-9 | `pathfind`: when `NoPath` arrives |
| SP-9 | §18.1 | S-3 | Version data sources |
| SP-10 | §18.4 | S-1, S-5, SE-8 | Backend table and the Mineflayer mapping |
| C-1 | `provisional.schema.json` `KeyCause` | S-2 | Description: the refined rule (0.1.1) |
| C-2 | `provisional.schema.json` `FlushMode`, `BackendCapabilities` | S-1, S-2 | Descriptions: both modes conforming; `"affected-keys"` stays reserved (0.1.1) |
| C-3 | `types/backend.d.ts` | S-1, SE-6, SE-8 | Doc comments on `start`, `cancel`, `flush`, `ingest` (0.1.1) |
| C-4 | `tick-input.schema.json` `Measurements` | S-5 | Description of `path_progress`: cumulative across replans (0.1.1) |
| C-5 | `provisional.schema.json` `VersionDataSources`, `examples/launch.json` | S-3 | Physics source becomes the server-jar extract; add `fuel` (0.1.1 under the D3 clause, or 0.2: SE-13) |
| C-6 | `SPIKE_DEPENDENCIES.md`, `CONTRACTS.md`, `ESCALATIONS.md` | all | Record the D3 outcome; drop the stale `docs/spec/errata.md` references |

---

## Spec patches

### SP-1: §14.1, rotation (SE-10)

**Old** (§14.1, last paragraph):

> The bot's own position follows vanilla: the client is authoritative for movement and the server only corrects it. The confirmed position is therefore the backend's simulated position, replaced whenever a correction arrives.

**New:**

> The bot's own position follows vanilla: the client is authoritative for movement and the server only corrects it. The confirmed position is therefore the backend's simulated position, replaced whenever a correction arrives. Likewise the confirmed rotation is the rotation the backend last sent to the server, replaced whenever a correction arrives. Rotations use vanilla's convention in radians: yaw 0 faces +z (south) and grows clockwise seen from above (west is π/2), normalised to (−π, π]; pitch is positive looking down.

### SP-2: §14.3, Folding (SE-5, SE-6)

**Old:**

> - **Folding.** When an action is confirmed its delta is dropped; the confirmed view already holds the server's values. A backend MUST report `Rejected`, not `Confirmed`, when the server's values for an action's predicted keys contradict the prediction.

**New:**

> - **Folding.** When an action is confirmed its delta is dropped; the confirmed view already holds the server's values. A backend MUST report `Rejected`, not `Confirmed`, when the server's values for an action's predicted keys contradict the prediction at the granularity of the primitive's confirmation method (§17.1): for `place_block` the block type at the target cell, for every other primitive the whole value.
> - **Determinism of predictions.** A backend computes an action's delta only from the primitive, its arguments, the confirmed view and the version data (§18.1), so the simulator can recompute it during replay (§15.5).

### SP-3: §14.5, Attribution (S-2, SE-1 to SE-4, SE-12)

**Old** (all of §14.5):

> During ingest the backend tags every change to a world key as `Own(action)`, when the change is an expected effect of a live action of this bot, or `Outside` otherwise. Changes caused by cancelled or rolled-back actions count as `Outside`. The runtime records, per key, the last tick an `Outside` change touched it; §9.8 uses this to tell `Interfered` from `ContractViolation` (decision 41).
>
> **Pitfalls this settles.** Ghost blocks after a rejected dig are an `Outside` change back to the old state, so a caller's later `ensures` reports `Interfered`, not a defect. An `ensures` holds at completion only; the IR marks every `ensures` as a point-in-time fact, so an orchestrator must re-check before relying on it.

**New:**

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
>
> **Pitfalls this settles.**
>
> - A refused action leaves the confirmed view unchanged. The server's corrective update for a ghost block repeats the current value, so it is not a change. The prediction lived only in the strand's predicted view, and rollback discards it (§14.4).
> - An outside change that happens to equal an action's prediction while the action is live is tagged `Own`. This is harmless: it can only make the action's own `ensures` hold.
> - The bot's position is simulated by the client. While an action whose affected keys include the position is live, outside forces such as knockback are folded into `Own` changes; only server corrections are `Outside` (rule 5).
> - An `ensures` holds at completion only; the IR marks every `ensures` as a point-in-time fact, so an orchestrator must re-check before relying on it.

### SP-4: §15.2, step 7 (S-1, SE-11)

**Old:**

> 7. **Flush.** The backend sends this tick's packets; report events are emitted (§16.2).

**New:**

> 7. **Flush.** The backend sends every packet it has queued since the previous flush: packets of this tick's `start` and `cancel` calls, and packets its own timers and its client simulation produced between ticks. Report events are emitted (§16.2). A backend MAY instead send a packet when it is produced (`flush: "immediate"`); §15.5 holds either way.

### SP-5: §15.5, Determinism (S-1, SE-6, SE-11)

**Old:**

> Given the same IR, the same per-tick backend input (server data, action reports, attribution) and the same supervisor commands, the runtime MUST make the same decisions in the same ticks. The language has no randomness and no wall clock; `world.tick` counts ticks since connect. Recording the backend input is enough to replay a session exactly in the simulator (§18.4).

**New:**

> Given the same IR, the same per-tick backend input (server data, action reports, attribution, measurements) and the same supervisor commands, the runtime MUST make the same decisions in the same ticks. Determinism is defined at this ingest boundary. When the backend's packets leave (§15.2 step 7) can change what the server does, but whatever the server does reaches the runtime only through a later TickInput, so it is part of the recorded input. The language has no randomness and no wall clock; `world.tick` counts ticks since connect. Recording the backend input is enough to replay a session exactly in the simulator (§18.4): the deltas that `start` returns are recomputed from the recorded confirmed view (§14.3).

### SP-6: §17.1, the resync confirmation method (SE-7)

**Old** (paragraph after the §17.1 introduction):

> Confirmation methods: **ack** = the server's Acknowledge Block Change carrying the action's sequence number (protocol 1.19+); **settle** = no server correction for the affected keys during the settle window, `max(4t, 2 × round-trip time)`; **state** = the affected keys reach the predicted values on the confirmed view; **sent** = confirmed when sent (unchecked, nothing to observe).

**New:**

> Confirmation methods: **ack** = the server's Acknowledge Block Change carrying the action's sequence number (protocol 1.19+); **settle** = no server correction for the affected keys during the settle window, `max(4t, 2 × round-trip time)`; **resync** = after the action's click, the backend sends a click that changes nothing (slot −1, a stale state id), which makes the server send the whole window; the affected keys must then hold the predicted values, and a window close before that answer is a rejection; **state** = the affected keys reach the predicted values on the confirmed view; **sent** = confirmed when sent (unchecked, nothing to observe).

**Old → new**, "Confirmed by" column of these rows:

| Row | Old | New |
| --- | --- | --- |
| `pick_up(w, slot: Int, half: Bool = false)` | settle | resync |
| `put(w, slot: Int, one: Bool = false)` | settle | resync |
| `quick_move(w, slot: Int)` | settle | resync |
| `swap_hotbar(w, slot: Int, hotbar: Int)` | settle | resync |
| `throw(w, slot: Int, all: Bool = false)` | settle | resync |
| `throw_cursor(w)` | settle | resync |

`click_button`, `select_trade` and `rename` use other packets. They keep **settle**; the spike did not exercise them (REPORT.md E3, residual risk).

### SP-7: §17.1, `place_block` (SE-5, S-3)

**Old** (contract cell of the `place_block` row):

> … clicks `face` of `support` and predicts the item's default placement state at `support.offset(face)`; a refusal fails `Rejected` (decision 92)

**New:**

> … clicks `face` of `support` and predicts, at `support.offset(face)`, the state the placement table gives for the item, face and support (§18.1); a refusal fails `Rejected` (decision 92)

### SP-8: §17.1, `pathfind` (SE-9)

**Old** (contract cell of the `pathfind` row):

> ensures `goal.reached`; progress `bot.path_progress` increasing within `5s`; timeout `limit`; fails `NoPath`; never breaks or places blocks and never enters `opts.avoid` (decision 93)

**New:**

> ensures `goal.reached`; progress `bot.path_progress` increasing within `5s`; timeout `limit`; fails `NoPath` when the search space is exhausted (an unreachable goal in open terrain ends through the progress clause instead); never breaks or places blocks and never stands with its feet in `opts.avoid` (decision 93)

*Why "feet":* E5 measured 0 ticks with the feet block inside the region, but 3 ticks in which the 0.6-wide bounding box grazed its edge. The pathfinder excludes blocks, not boxes.

### SP-9: §18.1, version data (S-3)

**Old** (§18.1, step 1):

> 1. **Registry import.** The compiler loads registry, block-state and tag data for the project's version, produced once by the vanilla data generator (`java -DbundlerMainClass=net.minecraft.data.Main -jar server.jar --all`) and cached per version.

**New:**

> 1. **Registry import.** The compiler loads registry, block-state and tag data for the project's version, produced once by the vanilla data generator (`java -DbundlerMainClass=net.minecraft.data.Main -jar server.jar --all`) and cached per version. The compiler therefore needs Java (the version's `javaVersion`, 21 for 1.21.4) and the version's `server.jar`.

**New paragraph** at the end of §18.1:

> **Version data.** The runtime computes reach, dig times, `can_harvest`, `can_place`, placement and `burn_time` from these sources, all produced once per version and cached next to the data-generator output:
>
> | Datum | Source |
> | --- | --- |
> | registries, block states and ids, tags, recipes, menu ids | data generator: `reports/`, `data/` |
> | tool speeds and correct-for-drops rules | data generator: the `minecraft:tool` component in `reports/items.json`, with the `mineable/*` and `incorrect_for_*` tags |
> | hardness, requires-correct-tool, collision and outline shapes, item → block (including wall variants) | an extract of the version's `server.jar` taken through Mojang's published mappings |
> | placement rules (`can_place`, the placed state) | a hand-authored placement table with an explicit v0.1 scope |
> | furnace burn times | a hand-authored table, checked against the server |
>
> minecraft-data MAY replace the extract for collision shapes and hardness when it covers the version. It never replaces it for outline shapes or tool speeds.

### SP-10: §18.4, backend interface and Mineflayer mapping (S-1, S-5, SE-8)

**Old** (table rows):

> | `ingest() -> TickInput` | phase 1 | server changes with attribution, discrete events, action reports, infrastructure events |
> | `flush()` | phase 7 | send this tick's packets |

**New:**

> | `ingest() -> TickInput` | phase 1 | server changes with attribution (§14.5), discrete events, action reports, infrastructure events, measurements |
> | `flush()` | phase 7 | send every queued packet (§15.2 step 7) |

**Old** (Mineflayer mapping, first paragraph after the table):

> The tick clock is the backend's physics tick at 20 Hz. **Mineflayer mapping (first backend):** `pathfind` maps to mineflayer-pathfinder (`GoalBlock`, `GoalNear`, `GoalXZ`, `GoalY`, `GoalLookAtBlock`, `GoalFollow`, `GoalInvert`, `GoalCompositeAny`); `dig`, `look_at`, `attack`, `chat` and `respawn` to `bot.dig`, `bot.lookAt`, `bot.attack`, `bot.chat` and `bot.respawn`; `interact` to `bot.activateBlock` and `bot.activateEntity`; `sneak`, `sprint` and `hold_jump` to `bot.setControlState`; `hold_use` to `bot.activateItem` and `bot.deactivateItem`; `select_hotbar` to `bot.setQuickBarSlot`; `close` to `bot.closeWindow`. Window primitives map to `bot.clickWindow` with vanilla click modes: `pick_up` and `put` mode 0 (button 0 whole, button 1 half or one), `quick_move` mode 1, `swap_hotbar` mode 2, `throw` mode 4, and `throw_cursor` mode 0 on slot −999. The remaining primitives send their protocol packets directly. Each mapping is verified by the conformance suite rather than trusted.

**New:**

> The tick clock is the backend's physics tick at 20 Hz: the Mineflayer backend runs the runtime's tick inside the `physicsTick` event, before any plugin's listener, and from a local 50 ms timer while the physics plugin is dormant (disconnected, dead, before the first position packet).
>
> **Packets.** The Mineflayer backend wraps `bot._client.write` and queues every play-state packet until `flush()`, so all packets leave in phase 7, including those written by Mineflayer's timers and its physics step. `cancel` drops the cancelled action's packets that are still queued.
>
> **Mineflayer mapping (first backend):**
>
> - `pathfind` maps to mineflayer-pathfinder (`GoalBlock`, `GoalNear`, `GoalXZ`, `GoalY`, `GoalLookAtBlock`, `GoalFollow`, `GoalInvert`, `GoalCompositeAny`). It is cancelled with `setGoal(null)`, which releases the controls at once, never with `stop()`, which waits for the next node. `bot.path_progress` counts the nodes reached, read each tick from the pathfinder's current path, cumulated across replans.
> - `attack`, `chat` and `respawn` map to `bot.attack`, `bot.chat` and `bot.respawn`; `interact` to `bot.activateBlock` and `bot.activateEntity`; `sneak`, `sprint` and `hold_jump` to `bot.setControlState`; `hold_use` to `bot.activateItem` and `bot.deactivateItem`; `select_hotbar` to `bot.setQuickBarSlot`; `close` to `bot.closeWindow`.
> - `look_at` maps to `bot.look`, which the physics step sends gradually.
> - `dig` does not map to `bot.dig`, which starts after an awaited look, finishes on its own timer and writes its prediction into Mineflayer's world. Instead `start` sends a look and *start digging* with a fresh sequence number; the backend counts the dig time in ticks from version data and sends *finish digging* in the flush of the tick it elapses.
> - Window primitives do not map to `bot.clickWindow`, which waits after digs and predicts into Mineflayer's own window. Each sends one `window_click` with vanilla click modes: `pick_up` and `put` mode 0 (button 0 whole, button 1 half or one), `quick_move` mode 1, `swap_hotbar` mode 2, `throw` mode 4, and `throw_cursor` mode 0 on slot −999. The click carries the predicted changed slots and cursor and is confirmed by resync (§17.1).
> - The remaining primitives send their protocol packets directly.
>
> Each mapping is verified by the conformance suite rather than trusted.
>
> **Acknowledged changes.** A change to an affected key of a live ack-confirmed action that agrees with the prediction is delivered in the TickInput that carries the action's acknowledgement; the backend holds it back until then, at most `confirm_timeout`. Any other change is delivered in the next TickInput.

**Old** (second paragraph):

> … `place_block` sends one use-item-on-block packet for the clicked face, without `bot.placeBlock`'s own wait, and reports the verdict from the ack and the block update (decision 92). …

**New:**

> … `place_block` sends a look at the clicked point and then one use-item-on-block packet for the clicked face, in the same flush and in that order (the server reads the rotation for stairs, chests and furnaces), without `bot.placeBlock`'s own wait, and reports the verdict from the ack and the block update (decision 92). …

---

## Contract changes

Classification follows `contracts/CONTRACTS.md`, "Versioning and freeze policy":

- An erratum that changes no field is a **patch** (`0.1.1`).
- Any additive field is **`0.2`**.
- Except that "D3 outcomes may still change the provisional items listed in SPIKE_DEPENDENCIES.md … such a change is an erratum confined to those definitions."

C-1 to C-4 and C-6 change only descriptions and doc comments: **0.1.1**. C-5 changes the shape of a provisional definition: **0.1.1 under the D3 clause**, which is the spike's recommendation, or **0.2** if Paul reads the general rule as taking precedence (SE-13).

### C-1: `schemas/provisional.schema.json`, `$defs.KeyCause.description` (0.1.1)

**Old:**

> "S-2, §14.5 attribution of one key change: {\"own\": actionId} when the change is an expected effect of a live action of this bot, else \"outside\". Provisional rule (review question 4 default): Own exactly when the key is in the action's affected-key set and the change arrives between start and the action's verdict plus the settle window max(4t, 2 x round-trip time); changes caused by cancelled or rolled-back actions are Outside."

**New:**

> "S-2 (settled at D3), §14.5 attribution of one key change: {\"own\": actionId} or \"outside\". Own(a) exactly when the key is in a's affected-key set, a is live (started at or before this tick, verdict not in an earlier TickInput), a was neither cancelled nor rolled back, the value agrees with a's prediction for the key where it has one (at the confirmation granularity), and the change is not a server correction of the bot's position or rotation. A value that repeats the key's current value is not a change. The runtime re-tags Own(k) as Outside when it rolls k back in the same tick."

### C-2: `schemas/provisional.schema.json`, `FlushMode` and `BackendCapabilities` descriptions (0.1.1)

**`$defs.FlushMode.description`. Old:**

> "S-1, finding 3: when the backend's packets for an action leave. \"deferred\": start() only queues, flush() in phase 7 sends (§15.2 as written). \"immediate\": packets leave during start() or cancel() in phase 6 and flush() sends what remains. Determinism is defined at the ingest boundary in both modes (§15.5), so either is conforming if D3 confirms that; the runtime only logs the mode."

**New:**

> "S-1 (settled at D3), §15.2 step 7: when the backend's packets leave. \"deferred\" (recommended): every play-state packet, including those produced between ticks by the backend's timers and client simulation, is queued and sent by flush() in phase 7; cancel() drops a cancelled action's queued packets. \"immediate\": packets leave when produced and flush() sends what remains. Determinism is defined at the ingest boundary (§15.5), so both are conforming; the runtime only logs the mode."

**`$defs.BackendCapabilities.properties.attribution.description`. Old:**

> "S-2: \"backend\" when the backend tags every change Own or Outside (§14.5 as written); \"affected-keys\" is reserved for a no-go outcome in which the runtime attributes from Delta affected-key sets instead."

**New:**

> "S-2 (settled at D3): \"backend\": the backend tags every change by the §14.5 rule. \"affected-keys\" stays reserved and unused in v0.1: a runtime-side computation lacks the backend's knowledge of server corrections (REPORT.md E4)."

### C-3: `types/backend.d.ts`, doc comments (0.1.1)

`ingest`. **Old:**

> `… with every key change attributed Own(action) or Outside (§14.5), discrete events, …`

**New:**

> `… with every key change attributed by the §14.5 rule (a value that repeats the key's current value is not a change), discrete events, … A change to an affected key of a live ack-confirmed action that agrees with its prediction is delivered together with the action's acknowledgement (§18.4).`

`start`. Add after the first sentence:

> `The Delta depends only on primitive, args, the confirmed view and version data, so a simulator can recompute it (§14.3, §15.5).`

`cancel`. **Old:**

> `Packets already sent cannot be unsent (decision 19); later changes they cause are attributed Outside (§14.5).`

**New:**

> `In "deferred" flush mode the action's packets still queued are dropped and never sent. Packets already sent cannot be unsent (decision 19); later changes they cause are attributed Outside (§14.5).`

`flush`. **Old:**

> `/** §18.4 phase 7: send this tick's packets (when they leave is spike item S-1). */`

**New:**

> `/** §15.2 step 7, §18.4 phase 7: send every packet queued since the previous flush, including packets the backend's own timers and client simulation produced between ticks. */`

### C-4: `schemas/tick-input.schema.json`, `$defs.Measurements.description` (0.1.1)

**Old:**

> "… path_progress backs bot.path_progress (§17.2, nodes reached by the current pathfind, null when none runs); …"

**New:**

> "… path_progress backs bot.path_progress (§17.2, nodes reached by the current pathfind, cumulative across the pathfinder's replans so it never decreases within one action; null when none runs); …"

### C-5: `schemas/provisional.schema.json`, `$defs.VersionDataSources`; `examples/launch.json` (S-3)

The `physics` source changes from minecraft-data to the server-jar extract (E6):

- minecraft-data 3.117.0 has no outline shapes and no burn times;
- its `material` field gives wrong tool speeds for ores (Mineflayer's own dig time is 4× too long for iron ore with a stone pickaxe).

A `fuel` source is added. `required` becomes `["registries", "physics", "placement", "fuel"]`.

**Old** (`properties.physics`):

```json
"physics": {
  "description": "Package and data version supplying hardness, shapes, burn times and tool tiers.",
  "type": "object", "additionalProperties": false, "required": ["source", "version"],
  "properties": {
    "source": { "const": "minecraft-data" },
    "version": { "type": "string", "minLength": 1 }
  }
}
```

**New** (`properties.physics` and a new `properties.fuel`):

```json
"physics": {
  "description": "S-3 (settled at D3): hardness, requires-correct-tool, outline and collision shapes and the item -> block mapping, extracted from the version's server.jar through Mojang's published mappings (§18.1, REPORT.md E6). Tool speeds and correct-for-drops rules come from the data generator (registries).",
  "type": "object", "additionalProperties": false, "required": ["source", "path"],
  "properties": {
    "source": { "const": "server-extract" },
    "path": { "type": "string", "minLength": 1 }
  }
},
"fuel": {
  "description": "S-3 (settled at D3): hand-authored furnace burn times in ticks, item ids or #tags, validated against the server (REPORT.md E6).",
  "type": "object", "additionalProperties": false, "required": ["source", "path"],
  "properties": {
    "source": { "const": "fuel-table" },
    "path": { "type": "string", "minLength": 1 }
  }
}
```

**`examples/launch.json`. Old:**

```json
"physics": { "source": "minecraft-data", "version": "1.21.4" },
```

**New:**

```json
"physics": { "source": "server-extract", "path": "~/.golem/data/1.21.4/extracted/blocks-shapes.json" },
"fuel": { "source": "fuel-table", "path": "~/.golem/data/1.21.4/burn-times.json" },
```

Also regenerate `types/provisional.d.ts` (`npm run generate-types`). Update `examples/invalid/launch.inline-password.json` only if it lists `data` (it does: add the `fuel` entry and the new `physics` shape so it still fails only for its stated reason).

**Alternative that keeps the 0.1 shape:** leave `VersionDataSources` as it is, and point `placement.path` at a directory that holds the placement table, the burn-time table and the extract. The spike does not recommend it: it hides two sources behind a field named for a third.

### C-6: Documents (0.1.1)

- `SPIKE_DEPENDENCIES.md`: add a "D3 outcome" line to each S-item (S-1 deferred go; S-2 refined rule, attribution stays `"backend"`; S-3 C-5; S-4 1.21.4 confirmed; S-5 go) and change "provisional until decision point D3" to the D3 date.
- `CONTRACTS.md` status paragraph and `ESCALATIONS.md` header and status lines: replace "errata v0.2.1 (`docs/spec/errata.md`), drafted and awaiting publication" with "errata v0.2.1, applied into `docs/spec/golem-spec-v0.2.md` (commit 5e71ece)". This also fixes the stale references to the deleted file.
- No change to the IR schema, reports, commands, world keys or the Lumberjack IR: S-4 keeps 1.21.4 (E0).
