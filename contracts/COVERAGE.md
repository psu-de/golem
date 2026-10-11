# Coverage inventory

This file lists every construct of spec v0.2 that the interface contracts must encode, each with its § reference. It was written before any schema (working order, step 1). The **Covered by** column names the definition that encodes each row. `scripts/check-docs.mjs` fails `npm test` if a row is blank, still says `TODO`, or names a definition that does not exist.

Reference forms used in **Covered by**:

- `wire#/$defs/BlockPos`: a `$defs` entry of `schemas/wire.schema.json`. `ir/expr#/$defs/Call` is `schemas/ir/expr.schema.json`.
- `backend.d.ts#Backend`: an exported declaration of the hand-written `types/backend.d.ts`.
- `CONTRACTS.md#cli`: a heading anchor in `CONTRACTS.md`.

## 1. Expression forms (§4.1, §7, §8)

| Construct | § | Covered by |
| --- | --- | --- |
| `INT` literal | §3.4, §6.8 | TODO |
| `FLOAT` literal | §3.4, §6.8 | TODO |
| `STRING` literal | §3.4 | TODO |
| String interpolation `"{e}"` via `Show` | §3.4, §7.3 | TODO |
| `DURATION` literal (`t s min h`) | §3.4 | TODO |
| `ANGLE` literal (`deg rad`) | §3.4 | TODO |
| `RESOURCE` literal as `ItemType`/`BlockType`/`EntityType` | §3.4, §6.8 | TODO |
| `RESOURCE`/`TAG` literal as a filter | §6.8, §8.2 | TODO |
| `TAG` literal as `Tag<T>` | §3.4, §6.8 | TODO |
| `BLOCKSTATE` literal | §3.4, §6.8 | TODO |
| `SELECTOR` literal `@e[…]` | §3.4, §8.5 | TODO |
| `true`, `false` | §3.3 | TODO |
| `none` | §6.2 | TODO |
| Local binding reference (`let`, `var`, pattern binder) | §5.4, §10.1 | TODO |
| Parameter reference | §5.4 | TODO |
| Activity parameter reference | §5.4, §11.1 | TODO |
| Activity `var` reference | §11.2 | TODO |
| Const reference | §5.4, §7.5 | TODO |
| `self` | §4.1, §6.5 | TODO |
| `bot` ambient | §7.6 | TODO |
| `world` ambient | §7.6 | TODO |
| `old(e)` | §9.4 | TODO |
| `result` in `ensures` | §9.4 | TODO |
| Struct field access `.f` | §6.3 | TODO |
| Property access (zero-argument member, no `()`) | §7.4 | TODO |
| Method call `x.m(args)` | §6.5, §7.4 | TODO |
| Free fn call, named arguments, defaults | §7.4, §9.9 | TODO |
| Static fn call `ItemFilter.of(t)` | §6.5, §8.1 | TODO |
| Static trait fn call `K.grid_width()` (after monomorphization) | §6.4, §6.5 | TODO |
| Associated const `ItemFilter.ANY` | §5.5, §6.5 | TODO |
| Type arguments in expressions `cast<K>()`, `Set<Int>()` | §4.2 | TODO |
| Extern fn call by name | §7.4, §18.2 | TODO |
| Optional chaining `?.` | §7.2, decision 105 | TODO |
| `??` | §7.2 | TODO |
| Index `xs[i]` | §7.1, §7.3 | TODO |
| Unary `-`, `!` | §7.2 | TODO |
| Arithmetic `+ - * / %` (incl. `Duration`, `Vec3`, `Angle`, `BlockPos`, `String`, `List`) | §7.2 | TODO |
| Comparison `== != < <= > >=` | §7.2 | TODO |
| `matches` | §7.2, §8.3 | TODO |
| `in` | §7.2 | TODO |
| `&&`, `\|\|` (short-circuit) | §7.1 | TODO |
| Filter combinators `\|`, `&`, `!` | §8.2 | TODO |
| Range `..`, `..=` | §7.2 | TODO |
| `if … then … else` | §4.1 | TODO |
| `match` expression with guards | §4.1, decision 109 | TODO |
| List literal `[a, b]` | §7.3 | TODO |
| `Set(items)` constructor | §7.3, decision 133 | TODO |
| `Map(entries)` constructor | §7.3, decision 133 | TODO |
| Struct construction (defaults filled) | §6.3 | TODO |
| Enum variant construction `Goal.At(p)`, `Face.Up` | §6.3 | TODO |
| Built-in value construction `BlockPos(…)`, `Vec3(…)`, `Region(…)` | §6.1 | TODO |
| Generated `copy(field = …)` | §6.3 | TODO |
| Resolved overload target on calls and operators | §6.7 | TODO |
| Resolved type on every node | §18.2 | TODO |
| Source span on every node | §18.2 | TODO |
| Pattern `_` | §4.1 | TODO |
| Pattern `none` | §4.1 | TODO |
| Pattern binder `IDENT` | §4.1 | TODO |
| Literal pattern | §4.1 | TODO |
| Variant pattern, qualified or not, bare or with fields | §4.1, decision 101 | TODO |
| Pattern alternatives `A \| B` | §4.1 | TODO |

## 2. Statement forms (§4.1, §10)

| Construct | § | Covered by |
| --- | --- | --- |
| `let x = e` / `var x = e` | §10.1 | TODO |
| `let _ = e` | §10.1 | TODO |
| `let x = e else fail F` | §10.1 | TODO |
| `let x = e else { diverging block }` | §10.1 | TODO |
| Assignment `= += -= *=` to a local | §10.1 | TODO |
| Assignment to an activity `var` | §10.1, §11.2 | TODO |
| `if` / `else if` / `else` | §10.2 | TODO |
| `if let x = e` | §10.2 | TODO |
| `match` statement | §10.2, decision 108 | TODO |
| `for x in e` (List, Set, Range, Map keys) | §10.2 | TODO |
| `repeat n` | §10.2 | TODO |
| `while c decreasing v [by m]` | §10.2 | TODO |
| `loop every D` | §10.2 | TODO |
| `break`, `continue` | §10.2 | TODO |
| `return [e]` | §10.2 | TODO |
| `wait D` | §10.3 | TODO |
| `wait until c timeout D [else fail F]` | §10.3 | TODO |
| `abort when c { B }` | §10.4 | TODO |
| `with t(args) { B }` | §10.4 | TODO |
| `defer t(args)` | §10.4 | TODO |
| `fail F(args)` | §10.5 | TODO |
| `try { B } catch { arms }` | §10.5 | TODO |
| `t(args) catch { arms }` (postfix) | §10.5 | TODO |
| Catch-arm patterns (`Name`, `Name(binders)`, `A \| B`, `_`) | §10.5, decision 101 | TODO |
| `retry n on F1, F2 { B }` | §10.5, decision 69 | TODO |
| `atomic { B }` | §10.7 | TODO |
| `confirm async { B }` | §10.8 | TODO |
| `sync t(args)` inside `confirm async` | §10.8 | TODO |
| `notify N(args)` | §10.9 | TODO |
| `heartbeat` | §9.3, decision 76 | TODO |
| Task-call expression statement | §9.9 | TODO |
| fn bodies (statements without suspension) | §7.4 | TODO |

## 3. Statechart constructs (§18.3, §10.6, §11.4)

| Construct | § | Covered by |
| --- | --- | --- |
| Statechart per task, handler and job root | §18.1 step 7 | TODO |
| Atomic state: extern call awaiting its verdict | §18.3 | TODO |
| Atomic state: `wait` | §18.3 | TODO |
| Atomic state: `wait until` | §18.3 | TODO |
| Atomic state: pending limit (`max_pending`) | §14.3, §18.3 | TODO |
| Atomic state: async barrier | §14.3, §18.3 | TODO |
| Atomic state: `when … until` restart point | §11.4, §18.3, decision 135 | TODO |
| Composite call, callee nested by reference | §18.3 | TODO |
| Compound state: `abort when` | §18.3 | TODO |
| Compound state: `try` and catch postfix | §18.3 | TODO |
| Compound state: `retry` | §18.3 | TODO |
| Compound state: `atomic` | §18.3 | TODO |
| Compound state: `confirm async` | §18.3 | TODO |
| Compound state: `defer` scope and deferred-call states | §18.3, §10.4 | TODO |
| Parallel state: `with` (child strand and body regions) | §18.3, §10.4 | TODO |
| Choice pseudo-state (branching and loop heads) | §18.3 | TODO |
| Final state (completion and `return`) | §9.7 | TODO |
| Transition with guard | §18.3 | TODO |
| Transition actions for straight-line code | §18.3 | TODO |
| Failure-pattern transitions (catch arms) | §10.5 | TODO |
| Unwinding order (defers, child strands, outer checks) | §10.6 | TODO |
| Frame locals and `old` snapshot slots | §9.4, §14.4 | TODO |
| Handler states Idle, Active, Backoff, disabled | §11.4 | TODO |
| State-id grammar `module.task#i.j.k` with region segments | §18.3 | TODO |
| State-id stability rule | §18.3 | TODO |

## 4. Tasks, clauses and modifiers (§9)

| Construct | § | Covered by |
| --- | --- | --- |
| Modifier `extern` and primitive class (instant, durative, ongoing) | §9.1, §9.6 | TODO |
| Modifier `ongoing` | §9.1 | TODO |
| Modifier `unchecked` | §9.1 | TODO |
| Modifier `irreversible`, declared or inferred | §9.1 | TODO |
| Clause `@uses` (declared) and inferred `uses` | §9.2, §13.3 | TODO |
| Clause `@requires E [else fail F]` | §9.3 | TODO |
| Clause `@invariant E [else fail F]` | §9.3 | TODO |
| Clause `@ensures E` (point-in-time) | §9.3, §14.5 | TODO |
| Clause `@maintains E [tolerate D] [else fail F]` | §9.3 | TODO |
| Clause `@progress M increasing\|decreasing [by m] within W` | §9.3 | TODO |
| Clause `@timeout D` | §9.3 | TODO |
| Clause `@fails F, …` | §9.5 | TODO |
| Clause `@stalls_after D` | §9.3, decision 76 | TODO |
| Clause `@attaches a(args)` | §11.7, decision 90 | TODO |
| Implicit clause `requires !bot.dead` | §9.6 | TODO |
| Implicit clause `requires w.open else fail WindowClosed` | §17.1 | TODO |
| Clause source text (for `Unmet`/`Broken` fields) | §9.3 | TODO |
| Inferred failure set | §13.5 | TODO |
| Boundedness and may-pin flags | §13.4, §15.1 | TODO |
| `contracts` section for planners | §18.2, decision 45 | TODO |

## 5. Activities, handlers and bots (§11, §12)

| Construct | § | Covered by |
| --- | --- | --- |
| Trigger `on Event(binders) [if g]` | §11.3 | TODO |
| Trigger `on enter c` | §11.3 | TODO |
| Trigger `on exit c` | §11.3 | TODO |
| Trigger `when c [for D] [until u]` | §11.3, §11.4 | TODO |
| Trigger `every D` | §11.4, decision 95 | TODO |
| Option `@priority` | §11.5 | TODO |
| Option `@backoff` | §11.5 | TODO |
| Option `@queue` | §11.5 | TODO |
| Activity `var` declarations | §11.2 | TODO |
| Activity instance with bound parameters (`use … as name`) | §12.1 | TODO |
| `@attaches` instance (job-scoped) | §11.7 | TODO |
| Handler order | §11.6 | TODO |
| `jobs` and job signatures | §12.1 | TODO |
| `start` job with wire-encoded args | §12.1 | TODO |
| Setting `job_priority` | §12.2 | TODO |
| Setting `confirm_timeout` | §12.2 | TODO |
| Setting `max_pending` | §12.2 | TODO |
| Setting `atomic_limit` | §12.2 | TODO |
| Setting `reconnect_delay` | §12.2 | TODO |
| Setting `max_reconnects` | §12.2 | TODO |
| IR `header` | §18.2 | TODO |
| IR `types` (structs, enums, kinds) | §18.2 | TODO |
| IR `failures`, `notices` | §18.2 | TODO |
| IR `consts` (evaluated) | §18.2 | TODO |
| IR `fns` (bodies and extern fns by name) | §18.2 | TODO |
| Fully qualified names, monomorphized instances | §6.4, §18.2 | TODO |
| Type-reference encoding | §18.2 | TODO |
| No embedded registries or version data | §18.1 | TODO |

## 6. Wire values (§6.9, §8.4)

| Construct | § | Covered by |
| --- | --- | --- |
| `Unit` | §6.9 | TODO |
| `Bool` | §6.9 | TODO |
| `Int` bounded to \|n\| ≤ 2^53 − 1 | §6.9, decision 65 | TODO |
| `Float` | §6.9 | TODO |
| `String` | §6.9 | TODO |
| `Duration` | §6.9 | TODO |
| `Angle` | §6.9 | TODO |
| `BlockPos` | §6.9 | TODO |
| `Vec3` | §6.9 | TODO |
| `Region` | §6.9 | TODO |
| `Range`, `SlotRange` | §6.9 | TODO |
| `ItemType`, `BlockType`, `EntityType` | §6.9 | TODO |
| `Tag<T>` | §6.9 | TODO |
| `BlockState` | §6.9 | TODO |
| `ItemStack` | §6.9 | TODO |
| Struct (incl. `Entry`) | §6.9 | TODO |
| Enum variant without fields | §6.9 | TODO |
| Enum variant with fields | §6.9 | TODO |
| `List<T>` | §6.9 | TODO |
| `Set<T>` (ascending, duplicate-free) | §6.9 | TODO |
| `Map<String, V>` | §6.9 | TODO |
| Other `Map<K, V>` (ascending pairs) | §6.9 | TODO |
| `T?` | §6.9 | TODO |
| Filter `any` (`\|`), `all` (`&`), `not` (`!`) | §8.4 | TODO |
| Item leaves: item, tag, ANY, NOTHING, `damaged`, `durability_at_least`, `named`, `has_component`, `edible`, `of` | §8.1, §8.4 | TODO |
| Block leaves: block, state, tag, ANY, NOTHING, `air`, `liquid`, `solid`, `replaceable`, `breakable`, `prop`, `of`, `placed` | §8.1, §8.4 | TODO |
| Entity leaves: type, tag, ANY, NOTHING, `within`, `named`, `is_player`, `hostile_type`, `in_region`, `near` | §8.1, §8.4 | TODO |
| Selector arguments `type= distance= name= x/y/z/dx/dy/dz= team=` | §8.5 | TODO |
| Failure value (type, fields) | §16.1, §16.2 | TODO |
| Built-in failures | §16.1 | TODO |
| `Defect` kinds | §7.1 | TODO |

## 7. World keys (§14.1)

| Construct | § | Covered by |
| --- | --- | --- |
| Canonical key string grammar | §14.1, §16.1 (`Interfered.key`) | TODO |
| Blocks: `block(pos)` | §14.1 | TODO |
| Player: position | §14.1 | TODO |
| Player: rotation | §14.1 | TODO |
| Player: health | §14.1 | TODO |
| Player: food | §14.1 | TODO |
| Player: saturation | §14.1 | TODO |
| Player: oxygen | §14.1 | TODO |
| Player: effects | §14.1 | TODO |
| Player: on-ground | §14.1 | TODO |
| Player: in-water | §14.1 | TODO |
| Player: in-lava | §14.1 | TODO |
| Player: sneaking | §14.1 | TODO |
| Player: sprinting | §14.1 | TODO |
| Player: using-item | §14.1 | TODO |
| Player: sleeping | §14.1 | TODO |
| Player: dead | §14.1 | TODO |
| Player: dimension | §14.1 | TODO |
| Player: held slot | §14.1 | TODO |
| Inventory: slots 0–45 | §14.1 | TODO |
| Inventory: cursor | §14.1 | TODO |
| Window: id | §14.1 | TODO |
| Window: kind | §14.1 | TODO |
| Window: slots | §14.1 | TODO |
| Window: properties | §14.1 | TODO |
| Entity: type | §14.1 | TODO |
| Entity: position | §14.1 | TODO |
| Entity: name | §14.1 | TODO |
| Entity: health | §14.1 | TODO |
| Entity: equipment | §14.1 | TODO |
| Entity: passengers | §14.1 | TODO |
| Entity: alive | §14.1 | TODO |
| World: time of day | §14.1 | TODO |
| World: weather | §14.1 | TODO |
| World: tag contents | §14.1 | TODO |
| World: known recipes | §14.1 | TODO |
| Keys §17.2 reads that §14.1 omits (light, sign text, on-fire, vehicle, reach attributes, entity item/owner/bite) | §17.2, decisions 75, 81, 82, 123 | TODO |
| Bulk chunk load and unload | §14.1, §15.2 | TODO |

## 8. Backend interface (§18.4, §14, §15)

| Construct | § | Covered by |
| --- | --- | --- |
| `connect(launch)` | §18.4 | TODO |
| `disconnect()` | §18.4 | TODO |
| `ingest() -> TickInput` | §18.4 | TODO |
| `start(action, primitive, args, mode) -> Delta?` | §18.4 | TODO |
| `cancel(action)` | §18.4 | TODO |
| `flush()` | §18.4 | TODO |
| 20 Hz clock ownership | §18.4, §15.5 | TODO |
| Action ids (deterministic) | §15.5 | TODO |
| `StartMode` sync/async | §10.8, §14.3 | TODO |
| Backend-only handle encodings: `Entity`, `Window` | §6.1, §15.4 | TODO |
| Backend-only `Goal` encoding | §17.3 | TODO |
| `PathOpts`, `BuildOpts` | §17.3 | TODO |
| `TickInput` | §15.2 phase 1 | TODO |
| Attributed key change `Own(action)` / `Outside` | §14.5 | TODO |
| Action report `Running` | §9.6 | TODO |
| Action report `Issued` | §9.6 | TODO |
| Action report `Confirmed` | §9.6 | TODO |
| Action report `Rejected(detail)` | §9.6 | TODO |
| Action report `Failed(failure)` | §9.6 | TODO |
| Infrastructure: connected, `Disconnected`, `Kicked` | §12.3 | TODO |
| Infrastructure: `Died`, spawn and respawn | §12.3 | TODO |
| Measurements (round-trip time, path progress) | §17.1, §17.2 | TODO |
| `Delta` (predicted key values) | §14.3 | TODO |
| Recording for replay | §15.5 | TODO |

## 9. Primitives (§17.1, §17.9 `golem.prim`)

| Construct | § | Covered by |
| --- | --- | --- |
| `pathfind` | §17.1 | TODO |
| `pathfind_build` | §17.1 | TODO |
| `sneak` | §17.1 | TODO |
| `sprint` | §17.1 | TODO |
| `hold_jump` | §17.1 | TODO |
| `steer` | §17.1 | TODO |
| `dismount` | §17.1 | TODO |
| `look_at` | §17.1 | TODO |
| `dig` | §17.1 | TODO |
| `interact(pos, face)` | §17.1 | TODO |
| `place_block` | §17.1 | TODO |
| `interact(target)` | §17.1 | TODO |
| `attack` | §17.1 | TODO |
| `use_item` | §17.1 | TODO |
| `hold_use` | §17.1 | TODO |
| `swap_hands` | §17.1 | TODO |
| `select_hotbar` | §17.1 | TODO |
| `pick_up` | §17.1 | TODO |
| `put` | §17.1 | TODO |
| `quick_move` | §17.1 | TODO |
| `swap_hotbar` | §17.1 | TODO |
| `throw` | §17.1 | TODO |
| `throw_cursor` | §17.1 | TODO |
| `click_button` | §17.1 | TODO |
| `select_trade` | §17.1 | TODO |
| `rename` | §17.1 | TODO |
| `close` | §17.1 | TODO |
| `edit_sign` | §17.1 | TODO |
| `write_book` | §17.1 | TODO |
| `sign_book` | §17.1 | TODO |
| `respawn` | §17.1 | TODO |
| `leave_bed` | §17.1 | TODO |
| `chat` | §17.1 | TODO |
| `command` | §17.1 | TODO |

## 10. Events (§17.6)

| Construct | § | Covered by |
| --- | --- | --- |
| `spawned` | §17.6 | TODO |
| `died(cause)` | §17.6 | TODO |
| `hurt(amount, attacker)` | §17.6 | TODO |
| `entity_hurt(e, attacker)` | §17.6 | TODO |
| `chat(sender, text)` | §17.6 | TODO |
| `whisper(sender, text)` | §17.6 | TODO |
| `system(text)` | §17.6 | TODO |
| `entity_appeared(e)` | §17.6 | TODO |
| `entity_gone(id, kind)` | §17.6 | TODO |
| `item_collected(stack)` | §17.6 | TODO |
| `window_opened(menu_type)` | §17.6 | TODO |
| `window_closed` | §17.6 | TODO |

## 11. Reports (§16.2)

| Construct | § | Covered by |
| --- | --- | --- |
| Envelope `seq`, `tick`, `bot`, `type` | §16.2 | TODO |
| Failure object `{type, fields, trace}` and trace frame | §16.1, §16.2 | TODO |
| `hello` | §16.2 | TODO |
| `job_started` | §16.2 | TODO |
| `job_completed` | §16.2 | TODO |
| `job_failed` | §16.2 | TODO |
| `job_cancelled` | §16.2 | TODO |
| `thread_started` | §16.2 | TODO |
| `thread_ended` | §16.2 | TODO |
| `frozen` | §16.2 | TODO |
| `resumed` | §16.2 | TODO |
| `task_started` | §16.2 | TODO |
| `task_completed` | §16.2 | TODO |
| `task_failed` | §16.2 | TODO |
| `progress` | §16.2 | TODO |
| `rollback` | §16.2 | TODO |
| `notice` | §16.2, decision 94 | TODO |
| `handler_failed` | §16.2 | TODO |
| `handler_backoff` | §16.2 | TODO |
| `handler_disabled` | §16.2 | TODO |
| `event_dropped` | §16.2 | TODO |
| `defer_failed` | §16.2 | TODO |
| `disconnected` | §16.2 | TODO |
| `reconnected` | §16.2 | TODO |
| `died` | §16.2 | TODO |
| `respawned` | §16.2 | TODO |
| Persistence mismatch report | §18.5 | TODO |

## 12. Commands, replies and refusals (§16.3, §6.9)

| Construct | § | Covered by |
| --- | --- | --- |
| `assign {job, args, job_id}` | §16.3 | TODO |
| `cancel {job_id}` | §16.3 | TODO |
| `pause {job_id}` | §16.3 | TODO |
| `resume {job_id}` | §16.3 | TODO |
| `snapshot {}` | §16.3 | TODO |
| Reply `accepted` | §6.9, §16.3 | TODO |
| Reply `refused` with reason | §6.9, §16.3 | TODO |
| Refusal `Busy` | §16.3 | TODO |
| Refusal `UnknownJob` | §16.3 | TODO |
| Refusal `BadArgs` | §16.3, §6.9, §8.4 | TODO |
| Refusal `NotReady` | §16.3, §12.3 | TODO |
| Refusal `NoJob` | §16.3 | TODO |
| Refusal `NotPaused` | §16.3 | TODO |
| Snapshot reply: threads, strands, frames, state ids, elapsed ticks, wire args | §16.3 | TODO |
| Reply correlation | §16.3 | TODO |

## 13. Diagnostics (§13.1, finding 15)

| Construct | § | Covered by |
| --- | --- | --- |
| Diagnostic object (code, severity, message, span, spec, related) | finding 15 | TODO |
| Lexical and syntax errors (§3–§4) | §3, §4 | TODO |
| Check 1: names, imports, case | §13.1 | TODO |
| Check 2: types, overloads, registries, `Eq + Ord` keys | §13.1 | TODO |
| Check 3: fn effects, task-call positions | §13.1 | TODO |
| Check 4: acyclic calls and consts | §13.1 | TODO |
| Check 5: resources, disjoint `with` | §13.1 | TODO |
| Check 6: termination | §13.1 | TODO |
| Check 7: clause placement, `old`, `result` | §13.1 | TODO |
| Check 8: exact `fails`, failure inference | §13.1 | TODO |
| Check 9: async-safe and atomic bodies | §13.1 | TODO |
| Check 10: ongoing rules | §13.1 | TODO |
| Check 11: exhaustive `match`, diverging `let … else` | §13.1 | TODO |
| Check 12: wire types where required | §13.1 | TODO |
| Check 13: handlers | §13.1 | TODO |
| Check 14: bots | §13.1 | TODO |
| Warning: catch arm for a failure that cannot occur | §13.1 | TODO |
| Warning: unused import | §13.1 | TODO |
| Warning: `requires` implied by a callee | §13.1 | TODO |

## 14. Question 7 defaults and persistence (§16.3, §18.5)

| Construct | § | Covered by |
| --- | --- | --- |
| Transport: stdio JSON Lines | §16.3, question 7 | TODO |
| `launch.json` | §12.2, question 7 | TODO |
| Auth by reference, never inline secrets | §12.2 | TODO |
| Per-bot persistence file | §18.5, question 7 | TODO |
| Persisted activity `var`s (instance, name, type) | §18.5 | TODO |
| Persisted handler backoff state | §18.5 | TODO |
| CLI `golem build` | question 7 | TODO |
| CLI `golem run` | question 7 | TODO |
