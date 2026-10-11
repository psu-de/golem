# Spike-dependent items (pending D3)

The Phase 3 Mineflayer feasibility spike decides whether the backend assumptions behind spec §14–§15 hold (review findings 3 and 4, questions 3–5). When these contracts were drafted, `docs/spike/` did not exist, so no early findings were available. Every item below therefore uses the readiness review's suggested default and is **provisional until decision point D3**.

Each item is isolated so that a D3 outcome touches as few files as possible. The data shapes live in `schemas/provisional.schema.json` (its definitions name the item they belong to), and the call semantics live in `types/backend.d.ts`. Each item below lists the files a no-go would change.

| Item | Question | Provisional default | Isolated in |
| --- | --- | --- | --- |
| S-1 | When do packets leave? (finding 3) | Deferred: `start` queues, `flush()` sends in phase 7 | `provisional#/$defs/FlushMode`, `BackendCapabilities.flush`; `backend.d.ts` `flush`, `start` |
| S-2 | Who attributes changes, and by what rule? (question 4) | The backend tags Own/Outside. Own iff the key is in the action's affected-key set between `start` and verdict plus the settle window | `provisional#/$defs/KeyCause`, `RoundTripTime`, `BackendCapabilities.attribution` |
| S-3 | Where does each runtime datum come from? (question 5) | Data generator for registries, tags and recipes; minecraft-data for physics; a hand-authored placement table | `provisional#/$defs/VersionDataSources` (used by `launch.json` `data`) |
| S-4 | Which Minecraft and protocol version? (question 3) | 1.21.4, protocol 769, if the pinned Mineflayer supports it fully | example values only: `examples/launch.json`, `examples/tick-inputs.jsonl`, IR `header.minecraft` |
| S-5 | Can the pathfinder run under runtime control and report progress? | Yes: cancellable on freeze, with node progress readable per tick | `tick-input#/$defs/Measurements.path_progress` |

---

## S-1: Packet flushing (review finding 3)

**Assumption.** §15.2 phase 7: "The backend sends this tick's packets". `start` (phase 6) only queues, and `flush()` sends. Mineflayer's high-level calls (`bot.dig`, `bot.clickWindow`, `bot.lookAt`) send immediately and run their own timers, so they may not be deferrable.

**Default in the contracts.** The backend reports `flush: "deferred"` in `ConnectResult.capabilities`. `Backend.start` documents queueing, and `Backend.flush` sends.

**On a no-go.** The backend reports `flush: "immediate"`: packets leave inside `start`/`cancel` during phase 6, and `flush()` sends whatever is left. The contracts are written so this is still conforming, because determinism is defined at the ingest boundary (§15.5): the runtime's decisions depend only on `TickInput` and commands, never on when packets left. The data shapes don't change. What needs D3's confirmation is the normative sentence: §15.2 step 7 and §18.4 would say "sends any packets not yet sent". Files touched: `schemas/provisional.schema.json` (`FlushMode` description only), `types/backend.d.ts` (doc comments), spec §15.2 and §15.5 (errata).

## S-2: Attribution rule (review question 4, finding 3)

**Assumption.** §14.5: "During ingest the backend tags every change to a world key as `Own(action)` … or `Outside`." Mineflayer has no such notion. Misattribution turns `Interfered` into `ContractViolation`, which is uncatchable and disables handlers for the session (§11.4).

**Default in the contracts.** Every `KeyChange` carries `cause: "outside" | {"own": actionId}` (`KeyCause`), set by the backend. The rule the backend applies is the review's default: a change is Own(a) exactly when

- the key is in action a's affected-key set,
- the change arrives between `start(a)` and a's verdict plus the settle window `max(4t, 2 × RTT)`, and
- a was neither cancelled nor rolled back.

Every other change is Outside. `ConnectResult.capabilities.attribution` is `"backend"`. The backend records the RTT it used in `Measurements.round_trip_ms` (`RoundTripTime`), so a replay sees the same inputs.

**On a no-go** (the backend cannot attribute reliably, or the rule must move into the runtime so that it is normative and testable, as the review recommends):

1. `capabilities.attribution` becomes `"affected-keys"`.
2. `start` returns the action's affected-key `Delta` in both modes, not only async. Its signature in `types/backend.d.ts` changes from `Delta | undefined` to `Delta`.
3. `KeyChange.cause` becomes optional: the runtime attributes from the affected-key sets, `start` ticks, verdict ticks and `round_trip_ms`, which are all already in the recording.

Files touched: `schemas/provisional.schema.json` (`KeyCause`, `BackendCapabilities`), `schemas/tick-input.schema.json` (`KeyChange.required`), `types/backend.d.ts` (`start`), spec §14.5 and §18.4 (errata). IR, reports, commands, world keys: unchanged.

## S-3: Version data sources (review question 5, finding 4)

**Assumption.** §18.1 names only the vanilla data generator, which provides registries, block states, tags and recipes. The runtime also needs:

- hardness and tool tiers (dig time, `can_harvest`, decision 80)
- outline and collision shapes (reach and ray casts, §17.3)
- furnace burn times (`burn_time`, §17.2)
- placement rules (`can_place`, `place_state`, decisions 68, 87)

**Default in the contracts.** `launch.json` carries `data: VersionDataSources` with three sources:

- `registries`: the data-generator output directory;
- `physics`: minecraft-data at a pinned version;
- `placement`: a hand-authored placement table, with an explicit v0.1 scope.

The IR embeds none of this (CONTRACTS.md, "IR"). The compiler needs the data generator output at compile time; that needs Java, so the toolchain does too.

**On a no-go** (a source is missing or wrong for the pinned version): only `VersionDataSources` changes, by adding or replacing a source kind. No IR, report or backend shape depends on where the data comes from. Files touched: `schemas/provisional.schema.json`, `examples/launch.json`, and the invalid fixture `examples/invalid/launch.inline-password.json`.

## S-4: Version pin (review question 3)

**Default.** Minecraft 1.21.4 (protocol 769), if the pinned Mineflayer fully supports it. This appears only as example data (`examples/launch.json`, `examples/tick-inputs.jsonl`, the Lumberjack IR's `header.minecraft`). No schema constrains the version beyond its syntax.

**On a no-go.** Change the example values and regenerate the Lumberjack IR (`npm run build-examples`) and the report examples. No schema changes.

## S-5: Pathfinder under runtime control

**Assumption.** `pathfind` is durative with `@progress bot.path_progress increasing within 5s` (§17.9). The backend must report path progress every tick and cancel mineflayer-pathfinder on freeze (§15.4).

**Default.** `Measurements.path_progress` carries the node count reached by the current `pathfind`, or null. The runtime exposes it as `bot.path_progress`.

**On a no-go** (progress is not observable): `path_progress` would have to be derived by the runtime, for example from distance to goal. That is a semantic change to `pathfind`'s contract and needs a spec decision. In the contracts it only removes `Measurements.path_progress`. Files touched: `schemas/tick-input.schema.json`.
