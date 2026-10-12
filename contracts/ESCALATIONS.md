# Escalations for Paul (spec owner)

These are the questions the contracts could not settle without a semantic choice, or where spec v0.2 contradicts itself or leaves a wire-visible gap. Each one gives the context, the § references, the proposed answer, and where that answer is applied.

**All 13 were accepted by Paul on 2026-10-12 (decision point D2) with their proposed answers.** Escalation E-n is put into the spec by patch Pn of errata v0.2.1 (`docs/spec/errata.md`, decision 130), drafted alongside and awaiting publication. The definitions under **Applied in** are final for contracts 0.1.0.

The D2 sign-off summary at the top of [CONTRACTS.md](CONTRACTS.md#d2-sign-off-summary) lists them with the proposed decisions.

---

## E-1: §14.1 omits world keys that §17.2 members read

**Status.** Accepted 2026-10-12; spec errata v0.2.1 patch P1.

**Context.** §14.1 says the world model is a map from keys to values, and that keys are the unit of change tracking and read tracking. Several `bot`/`world`/`Entity` members of §17.2 read state that none of the six §14.1 families contains. Without a key there is nothing to attribute (§14.5), nothing for `Interfered.key` to name (§9.8), and nothing for a backend to report:

| Member | Needs | Decision |
| --- | --- | --- |
| `world.block_light(p)`, `world.sky_light(p)` | light per position | 81 says "two keys", but they are not in §14.1 |
| `world.sign_text(p, front)`, `edit_sign` ensures | sign text per position | 116 |
| `bot.on_fire` | the entity-metadata burning flag | 82 |
| `bot.riding`, `steer`, `dismount` | the vehicle | 57 |
| `bot.block_reach`, `bot.entity_reach` | the two interaction-range attributes | §17.3 |
| `Entity.item` | an item entity's stack | 123 |
| `bot.bobber` | a projectile's owner id | 75 |
| `Entity.biting` | the fishing-hook bite flag | 75 |

`bot.path_progress` is not server state at all; it comes from the pathfinder.

**§ refs.** §14.1, §14.5, §9.8, §17.2, §17.3, decisions 57, 75, 81, 82, 116, 123.

**Answer (accepted).** Extend §14.1 with these keys, all with the grammar of `world.schema.json`:

- `light.block(x,y,z)` and `light.sky(x,y,z)`
- `sign(x,y,z)`
- `player.on_fire`, `player.vehicle` and `player.attribute(<id>)`
- `entity(id).item`, `entity(id).owner` and `entity(id).biting`

Keep `bot.path_progress` out of the world model: it is a TickInput measurement (`Measurements.path_progress`), recorded for replay like everything else the backend hands over.

**Applied in.** `world.schema.json`: `WorldKey`, `LightKeyValue`, `SignKeyValue`, `PlayerFlagKeyValue` (`on_fire`), `PlayerVehicleKeyValue`, `PlayerAttributeKeyValue`, `EntityItemKeyValue`, `EntityOwnerKeyValue`, `EntityBitingKeyValue`, and the optional light runs of `ChunkLoad`. `tick-input.schema.json`: `Measurements`.

## E-2: Replies have no correlation id

**Status.** Accepted 2026-10-12; spec errata v0.2.1 patch P2.

**Context.** §16.3 gives each command a reply, but `snapshot {}` carries no id at all, and several commands can name the same `job_id` (for example `cancel` sent twice). Over an ordered transport (stdio, PD-29) replies can be matched by order, because commands are applied and answered in arrival order. That breaks as soon as a supervisor pipelines commands over a transport that does not preserve order, or loses its place after a parse error.

**§ refs.** §16.3, §6.9 (reply form).

**Answer (accepted).** Add an optional client-chosen `id` (1–128 characters) to every command, echoed as `id` in its reply. When it is absent, replies correlate by order as today. Replies also echo `command` (PD-27).

**Applied in.** `command.schema.json` `CorrelationId` and every command; `reply.schema.json` `JobAccepted`, `SnapshotAccepted`, `Refused`.

## E-3: No refusal reason for a malformed or unknown command

**Status.** Accepted 2026-10-12; spec errata v0.2.1 patch P3.

**Context.** §16.3 lists refusals per command, and every one of them assumes the line already parsed as a known command. A line that is not JSON, names no known `command`, or lacks a required field has no specified outcome. "No silent failure" (§16) says it must still get an answer.

**§ refs.** §16, §16.3.

**Answer (accepted).** Add refusal reason `BadCommand`, replied with the `command` text if one was readable (else `""`) and a `detail`. The runtime never closes the stream because of one.

**Applied in.** `reply.schema.json` `RefusalReason`; `examples/replies.jsonl` (last line).

## E-4: Selector arguments without a filter leaf

**Status.** Accepted 2026-10-12; spec errata v0.2.1 patch P4.

**Context.** §8.5 lowers `@e[…]` to an `EntityFilter` whose arguments "combine with `&`", and §8.4 serialises filters as leaves. Two selector arguments have no §8.1 leaf to lower to:

- the box `x= y= z= dx= dy= dz=` (`in_region` takes a `Region` of block positions with inclusive integer bounds, not vanilla's floating box against the hitbox);
- `team=`.

A selector filter sent as a job argument therefore has no wire form.

A related reading: §8.5 maps `distance=` with a single number to `within(b)`, i.e. "at most n", whereas vanilla `distance=n` means exactly n. We read the spec as written.

**§ refs.** §8.1, §8.4, §8.5, decision 61.

**Answer (accepted).** Add two `EntityFilter` leaves:

- `{"box": {"x", "y", "z", "dx", "dy", "dz"}}`, with vanilla's meaning;
- `{"team": "name"}`, the scoreboard team as the client knows it.

They exist only as selector lowerings, not as `golem.filters` fns. Confirm that `distance=n` means `within(n)`.

**Applied in.** `wire.schema.json` `EntityFilter` (`box`, `team`) and `SelectorBox`.

## E-5: Failure and notice names on the wire can collide

**Status.** Accepted 2026-10-12; spec errata v0.2.1 patch P5.

**Context.** §16.2 writes failures as `{"type": "NoPath", …}` and notices with their `name`: the simple declared name. Failures and notices are declared per module, so two modules a bot reaches can declare `failure Missing` with different fields. A supervisor then cannot tell them apart or decode their fields.

**§ refs.** §16.1, §16.2, §5.3, decision 94.

**Answer (accepted).** Keep simple names on the wire. Make it a compile error (§13.1 check 14, bots) for two user-declared failures, or two notices, reachable from one bot to share a simple name, or for one to reuse a built-in failure's name. The IR records the wire name next to the qualified name.

**Applied in.** `ir/types.schema.json` `FailureDecl.wire_name`, `NoticeDecl.wire_name`; `scripts/check-ir.mjs` (`wire-name-clash`); `wire.schema.json` `FailureName`.

## E-6: The persistence mismatch report has no message type

**Status.** Accepted 2026-10-12; spec errata v0.2.1 patch P6.

**Context.** §18.5: "otherwise the declared initial value is used and the mismatch is reported." §16.2 lists no message for it, and §16.2's table is otherwise closed.

**§ refs.** §18.5, §16.2.

**Answer (accepted).** Add report `state_not_restored {instance, name, reason}`, where:

- `name` is the var name, or `handler:<index>` for a handler's backoff state;
- `reason` is `missing` (the new IR has the var but the file does not), `type_changed`, or `instance_gone` (the file has an instance the new IR lacks).

It is emitted once per item, right after the session's first `hello`.

**Applied in.** `report.schema.json` `StateNotRestored`; `examples/reports.jsonl` line 2.

## E-7: Is `D` in `when c for D` a constant?

**Status.** Accepted 2026-10-12; spec errata v0.2.1 patch P7.

**Context.** §11.5 makes handler options constant expressions, and decision 95 makes `every D` constant (it may use the activity's parameters). For the debounce `D` of `when c for D`, §11.3–§11.4 say only "debounce `D` (default `1t`)". If `D` may be view-dependent, the trigger phase has to re-evaluate it every tick, and the counter semantics ("true for `D` consecutive wall ticks") become ill-defined when `D` changes.

**§ refs.** §11.3, §11.4, §11.5, decision 95, §7.5.

**Answer (accepted).** `D` in `for D` is a constant expression that may use the activity's parameters, exactly like `every D`, and must be ≥ `1t`. Add it to §7.5's list and §13.1 check 13.

**Applied in.** `ir/handlers.schema.json` `When.debounce` is a resolved tick count.

## E-8: Session end has no report

**Status.** Accepted 2026-10-12; spec errata v0.2.1 patch P8.

**Context.** §12.3: after `max_reconnects` consecutive failed reconnects "the session ends". No §16.2 message tells the supervisor that the runtime has given up, as opposed to still waiting `reconnect_delay`.

**§ refs.** §12.2, §12.3, §16.2.

**Answer (accepted).** Do not add a type. `disconnected` gains `final: Bool`, true on the disconnect after which no reconnect will be attempted. The process then exits with status 1 (CONTRACTS.md, CLI).

**Applied in.** `report.schema.json` `Disconnected.final`; [CLI](CONTRACTS.md#cli) exit codes.

## E-9: Handlers have no names, but §18.5 keys them by name

**Status.** Accepted 2026-10-12; spec errata v0.2.1 patch P9.

**Context.** §18.5 stores "each handler's backoff state, keyed by instance and name", and §16.2's `handler_*` and `event_dropped` reports carry `instance, handler`. The grammar gives handlers no name: `Handler = { HandlerOpt ";" } Trigger Block`.

**§ refs.** §18.5, §16.2, §11.6, §4.1.

**Answer (accepted).** A handler is identified by its 0-based index in its activity's declaration order. That order is already the normative evaluation order (§11.6). Reports carry it as `handler: Int`; persistence and state ids use it too (`auto_eat/0#restart`). Renaming or reordering handlers is a reload mismatch like renaming a var.

**Applied in.** `report.schema.json` `HandlerIndex`; `persistence.schema.json` `PersistedBackoff`; `ir/handlers.schema.json` `Handler.index`; state-id owners `<instance>/<index>` (PD-20).

## E-10: What order is "by id" for registry types?

**Status.** Accepted 2026-10-12; spec errata v0.2.1 patch P10.

**Context.** §6.1 orders `ItemType`, `BlockType` and `EntityType` "by id", and §6.9 requires wire sets and map keys to be ascending. If "id" means the numeric registry id, wire order depends on version data that supervisors do not have, and on the data source question (review question 5). §17.5's `plan` also visits "types in ascending registry id".

**§ refs.** §6.1, §6.9, §17.5.

**Answer (accepted).** "By id" means by the full string id (`namespace:path`), compared by code point like `String`. This order is version-independent, so a supervisor can produce a valid `Set<ItemType>` with no version data. `plan`'s visiting order uses the same order.

**Applied in.** `scripts/lib/wire.mjs` `compare`; `world.schema.json` `WorldTagKeyValue`, `WorldRecipesKeyValue` (ascending ids).

## E-11: A cancelled frame has no terminal report

**Status.** Accepted 2026-10-12; spec errata v0.2.1 patch P11.

**Context.** §16.2 reports `task_started` for every frame of a `pub` task, and `task_completed` or `task_failed` at its end. Frames that end by cancellation have neither. Normal code does this all the time: a `with` child when its body ends (every `consume` cancels `hold_use`), an `abort when`, a `cancel` command, `until` cancelling a handler run. A supervisor tracking frames sees them start and never end.

**§ refs.** §16.2, §10.4, §10.6, §11.4, §16.3.

**Answer (accepted).** Add `task_cancelled {thread, frame, task}`, emitted when a cancelled frame finishes unwinding.

**Applied in.** `report.schema.json` `TaskCancelled`; `examples/reports.jsonl` (`hold_use` at tick 148).

## E-12: Failure inference: is "may call an extern task" direct or transitive?

**Status.** Accepted 2026-10-12; spec errata v0.2.1 patch P12.

**Context.** §13.5 builds a task's failure set from its own clauses, "implicit failures by condition (… `Rejected` and `Unconfirmed` if it may call an extern task, `Interfered` if it or a callee has `ensures` …)", and "the inferred sets of its callees minus failures caught around each call". If "may call" is transitive, `woodcutting.chop_trees` keeps `Rejected` even though it catches `Rejected` around `mine`, its only call that can raise it. The exported set then over-approximates, and the "catch arm for a failure that cannot occur" warning loses precision. The set is exported in the IR (decision 10) and read by planners.

**§ refs.** §13.5, §13.1 warnings, decision 10.

**Answer (accepted).** The condition clauses describe a task's own direct effects. `Rejected` and `Unconfirmed` come from calling an extern task directly (or being one); `Interfered` comes from the task's own `ensures`. Everything a callee can raise reaches the caller only through "the callee's inferred set minus failures caught around that call".

**Applied in.** `examples/author/lumberjack.mjs` `infer()`; every `tasks.*.failures` in `examples/Lumberjack.golem-ir.json`.

## E-13: `Unit?` has no unambiguous wire form

**Status.** Accepted 2026-10-12; spec errata v0.2.1 patch P13.

**Context.** §6.9 writes `Unit` as `null` and `T?`'s `none` as `null`, so `Unit?` cannot be decoded. It can appear wherever a wire type is required: a job result, a failure field, a var.

**§ refs.** §6.1, §6.9.

**Answer (accepted).** Make `Unit?` (and any type containing it) a non-wire type, so §13.1 check 12 rejects it where a wire type is required. Nothing in std uses it.

**Applied in.** `wire.schema.json` `OptionalValue` (description only).
