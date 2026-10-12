# Golem spec errata

This is the errata log of the Golem specification (decision 130). Each versioned patch amends `golem-spec-v0.2.md`. Where a patch and the base text differ, the patch wins.

## v0.2.1 (draft, 2026-10-12)

**Status: drafted by the architect agent, awaiting publication by Paul.** These patches put into the spec the answers Paul accepted at decision point D2 (2026-10-12) for the interface-contract escalations E-1 to E-13 (`contracts/ESCALATIONS.md`). The `@golem/contracts` 0.1.0 package already implements all of them.

Each patch names the escalation it settles, the section it changes, and the exact edit. Quoted text is the current v0.2 wording.

### P1: World keys omitted from §14.1 (E-1)

**§14.1, table.** Replace three rows:

| Current | Replacement |
| --- | --- |
| `\| Blocks \| block(pos) for every loaded position \|` | `\| Blocks \| block(pos), block_light(pos), sky_light(pos) and the sign text at pos, for every loaded position \|` |
| `\| Player \| position, rotation, …, dimension, held slot \|` | the same list, followed by `, on-fire, vehicle, attributes (block_interaction_range, entity_interaction_range)` |
| `\| Entities \| per entity id: type, position, name, health if sent, equipment, passengers, alive \|` | `\| Entities \| per entity id: type, position, name, health if sent, equipment, passengers, alive, the stack of an item entity, the owner of a projectile or fishing hook, the bite flag of a fishing hook \|` |

**§14.1.** Add after the table:

> `bot.path_progress` is not world state: the backend reports it with each tick's input (§18.4) and it is never attributed or read-tracked. The canonical string form of every key, as carried by `Interfered.key`, is fixed by the interface contracts.

### P2: Reply correlation (E-2)

**§16.3.** Add after the command table:

> Any command MAY carry `id`, a string of 1–128 characters chosen by the supervisor; its reply carries the same `id`. Without `id`, replies correlate with commands by order, since commands are applied and answered in arrival order. Every reply also carries `command`, the name of the command it answers.

**§6.9, last paragraph.** Replace the last sentence ("Command replies are objects: …") with:

> Command replies are objects: `{"reply": "accepted", "command": "assign", "job_id": "s-1"}` or `{"reply": "refused", "command": "assign", "job_id": "s-2", "reason": "Busy"}`, plus `id` when the command carried one (§16.3).

### P3: Malformed commands (E-3)

**§16.3.** Add after the command table:

> A line that is not a valid command (not JSON, an unknown `command`, a missing or mistyped field) is refused with `BadCommand`, carrying the readable `command` name or `""`. The runtime never closes the command stream because of one.

### P4: Selector arguments without a leaf (E-4)

**§8.1, `EntityFilter` row, Leaves column.** Append: `, and the selector-only leaves box and team (§8.5)`.

**§8.4.** Add after the first paragraph:

> The selector box serialises as `{"box": {"x": …, "y": …, "z": …, "dx": …, "dy": …, "dz": …}}` and `team=` as `{"team": "name"}`. A selector serialises as `{"all": […]}` of its argument leaves.

**§8.5, table.** In the `x= y= z= dx= dy= dz=` row, replace the meaning "a box as in vanilla; all six MUST be given together" with "the leaf `box`, matching vanilla; all six MUST be given together". In the `team=` row, replace "scoreboard team as known to the client" with "the leaf `team`: scoreboard team as known to the client".

**§8.5.** Add after the table:

> A `distance=` value that is a single number `n` means `within(n)`, not vanilla's exact distance.

### P5: Unique wire names (E-5)

**§13.1, row 14.** Replace "Bots: instance names unique, jobs valid, `start` in `jobs`, config keys known." with:

> Bots: instance names unique, jobs valid, `start` in `jobs`, config keys known; the user-declared failures, and the notices, that a bot reaches have distinct simple names, none equal to a built-in failure's name.

**§16.2.** Add after the first paragraph:

> Failure `type` and notice `name` are the declared simple names; §13.1 check 14 makes them unique per bot.

### P6: Persistence mismatch report (E-6)

**§16.2, table.** Add a row:

> `| state_not_restored | §18.5, once per item, after the session's first hello | instance, name (a var name, or handler:<index>), reason (missing, type_changed or instance_gone) |`

**§18.5, first paragraph.** Replace "the mismatch is reported" with "the mismatch is reported (`state_not_restored`, §16.2)".

### P7: Debounce is constant (E-7)

**§11.3, `when` row.** Replace "Level trigger with debounce `D` (default `1t`) and hysteresis `u`; see §11.4." with:

> Level trigger with debounce `D` (default `1t`) and hysteresis `u`; see §11.4. `D` is a constant expression that MAY use the activity's parameters and MUST be ≥ `1t`.

**§7.5, last sentence.** Add "debounce durations" to the list of places that require constants.

**§13.1, row 13.** Replace "options are constant" with "options and debounce durations are constant".

### P8: Session end (E-8)

**§16.2, table.** In the `disconnected` / `reconnected` / `died` / `respawned` row, extend the Extra fields cell to:

> `reason`; `disconnected` also `kind` (`Disconnected` or `Kicked`) and `final`, true when no reconnect will follow

**§12.3, first bullet.** Append: "When the limit is reached, the last `disconnected` report has `final` true and the session ends."

### P9: Handler identity (E-9, with PD-21)

**§11.6.** Append: "A handler's index in its activity's declaration order is its identity in reports, snapshots and persistence."

**§18.5, first paragraph.** Replace "each handler's backoff state, keyed by instance and name" with "each handler's backoff state, keyed by instance and var name or handler index (§11.6)".

**§16.2.** Add after the table: "The `handler` field is the handler's index (§11.6)."

### P10: Order of registry types (E-10)

**§6.1, table.** In the `ItemType`, `BlockType`, `EntityType` row, replace the Ord cell "by id" with "by id string, by code point".

**§17.5, `plan` paragraph.** Replace "types in ascending registry id" with "types in ascending id (§6.1)".

### P11: Cancelled frames (E-11)

**§16.2, table.** Replace the row `task_started` / `task_completed` / `task_failed` with:

> `| task_started / task_completed / task_failed / task_cancelled | every frame of a task marked pub; task_cancelled when a cancelled frame finishes unwinding | thread, frame, task, failure |`

### P12: Failure inference (E-12)

**§13.5.** Replace the sentence "It is the union of: … and the inferred sets of its callees minus failures caught around each call." with the same sentence after one edit: in the parenthesis of implicit failures by condition, replace "`Rejected` and `Unconfirmed` if it may call an extern task, `Interfered` if it or a callee has `ensures`" with "`Rejected` and `Unconfirmed` if it is or directly calls an extern task, `Interfered` if it has `ensures`". Then add:

> Failures of callees reach the caller only through the callees' inferred sets minus the failures caught around each call.

### P13: `Unit?` is not a wire type (E-13)

**§6.1, table.** In the `T?` row, replace the Wire cell "if `T: Wire`" with "if `T: Wire` and `T` is not `Unit`".

**§6.9.** Add after the table: "`Unit?` is not a wire type: its `none` and its value would both be `null`."

### P14: Editorial (review finding 2 closed)

**§16.2, last paragraph.** Replace "The field types of these messages are fixed by the report schema of the interface contracts, which v0.2 does not yet include (review finding 2)." with "The field types of these messages are fixed by the report schema of the interface contracts, `@golem/contracts` 0.1.0 (`contracts/`)."

**§18, introduction.** Replace "The IR schema and the typed backend interface are the subject of the interface contracts (review finding 2) and are not yet part of v0.2." with "The IR schema and the typed backend interface are defined by the interface contracts, `@golem/contracts` 0.1.0 (`contracts/`)."
