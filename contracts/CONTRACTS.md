# Golem interface contracts (`@golem/contracts` 0.1.0)

This package is the typed, machine-checked contract between the Golem compiler, runtime and backend. It closes readiness-review finding 2: the compiler, runtime and backend can now be built independently against these schemas and types. It implements spec v0.2 (`docs/spec/golem-spec-v0.2.md`), which stays normative: where this package and the spec disagree, the spec wins and the difference is a bug here.

Drafted by the architect agent; signed off by Paul (spec owner) at decision point **D2** on 2026-10-12.

## D2 sign-off summary

Status: **D2 complete; frozen as v0.1.0 on 2026-10-12.** Paul accepted all 48 proposed decisions (PD-1 to PD-48) and all 13 escalations (E-1 to E-13) with their proposed answers. The escalations reach the spec through errata v0.2.1 (`docs/spec/errata.md`), drafted and awaiting publication. Only the spike-dependent items (S-1 to S-5) remain provisional, pending D3. `npm test` passes: every example validates, every negative fixture fails for its stated reason, `check-ir` passes on the Lumberjack IR, type regeneration produces no diff, and the stub backend and stub IR consumer compile under `tsc --strict`.

The PD and E ids stay as stable references in schemas and documents. Escalation E-n is spec errata v0.2.1 patch Pn (decision 130). Spike items (S) stay provisional until D3.

### Proposed decisions

Each is a choice the spec leaves open, made in the simplest way consistent with it. Rationale is in [Proposed decisions](#proposed-decisions). All 48 were accepted by Paul on 2026-10-12.

| ID | Decision | Status |
| --- | --- | --- |
| PD-1 | One package; JSON Schema 2020-12 is the single source of truth for data; `.d.ts` generated and drift-checked; versioned `$id`s under `…/contracts/0.1/` | Accepted 2026-10-12 |
| PD-2 | The backend owns the 20 Hz clock and calls the runtime's `tick()` synchronously; tick-phase calls are synchronous; connect/disconnect async; connection outcomes arrive as TickInput infra events | Accepted 2026-10-12 |
| PD-3 | `BlockState` on the wire: all properties, ascending by key; a listed subset is accepted with defaults | Accepted 2026-10-12 |
| PD-4 | `ItemStack.components`: object keyed by component id, values as vanilla's component codec writes them | Accepted 2026-10-12 |
| PD-5 | `ANY` = `{"all":[]}`, `NOTHING` = `{"any":[]}`; zero-argument leaves are `{"air":{}}` | Accepted 2026-10-12 |
| PD-6 | Filter leaf keys `block`, `state` and `entity` for literal leaves; tag leaves without `#` (as in §8.4) | Accepted 2026-10-12 |
| PD-7 | `Defect.at` is `path:line:column` of the faulting expression | Accepted 2026-10-12 |
| PD-8 | Backend-only handles: `{"entity": id}` and `{"window": id, "generation": n}`, the generation assigned by the backend per opening | Accepted 2026-10-12 |
| PD-9 | One canonical world-key string grammar and a value shape per key family; `null` means absent | Accepted 2026-10-12 |
| PD-10 | Bulk `chunk_load` / `chunk_unload` changes, defined as exact abbreviations of per-key changes | Accepted 2026-10-12 |
| PD-11 | TickInput processing order: `connected`, changes, events, reports, other infra | Accepted 2026-10-12 |
| PD-12 | `ActionId` is an Int from 1, +1 per `start`, per session | Accepted 2026-10-12 |
| PD-13 | `spawned` and `died` events come from infra events; the backend never reports them twice | Accepted 2026-10-12 |
| PD-14 | Qualified names: module path, receiver type, name, `<type args>` for instances, `(param types)` only when the overload set has several members | Accepted 2026-10-12 |
| PD-15 | Type references are canonical strings (`Window<golem.windows.Container>?`) with an ABNF | Accepted 2026-10-12 |
| PD-16 | IR spans are `[file, line, col, end_line, end_col]`; columns count code points; diagnostic offsets are UTF-8 bytes | Accepted 2026-10-12 |
| PD-17 | Four IR-only expression nodes (`opt`, `unwrap`, `is_none`, `iter_more`); frame-local slot names with `~n` renames and `$` temporaries | Accepted 2026-10-12 |
| PD-18 | Call arguments are positional with defaults filled; `order` records a non-ascending evaluation order of named arguments | Accepted 2026-10-12 |
| PD-19 | Statecharts are flat maps with `parent` links; transitions may leave compounds and the runtime runs exit behaviour | Accepted 2026-10-12 |
| PD-20 | State ids: the owner alone is the root, `#end` and `#restart` are reserved, a fixed set of region names, `<instance>/<i>` handler owners and `job:<task>` owners | Accepted 2026-10-12 |
| PD-21 | A handler's identity is its declaration index (answer to E-9) | Accepted 2026-10-12 |
| PD-22 | A job's wire name is its task's qualified name (`woodcutting.chop_trees`) | Accepted 2026-10-12 |
| PD-23 | `job_id`: a supervisor string of 1–128 characters; the start job gets `start-<n>` | Accepted 2026-10-12 |
| PD-24 | `seq` counts from 1 per runtime session; `tick` is the backend clock's tick | Accepted 2026-10-12 |
| PD-25 | A few report fields beyond §16.2's list, where a supervisor needs them (listed in [Reports](#reports-commands-and-replies)) | Accepted 2026-10-12 |
| PD-26 | Trace frames list innermost first; each gives the statement its frame was at (an extern frame gives its declaration) | Accepted 2026-10-12 |
| PD-27 | Commands discriminated by `command`; `assign` args by name with defaults; replies echo `command` and may carry `detail` | Accepted 2026-10-12 |
| PD-28 | Snapshot adds instances (handler states, vars); non-wire arguments omitted; an extern frame's state is its task name | Accepted 2026-10-12 |
| PD-29 | Transport: stdio JSON Lines (commands in; reports and replies out; logs on stderr) | Accepted 2026-10-12 |
| PD-30 | `launch.json` fields; auth by profile reference only | Accepted 2026-10-12 |
| PD-31 | One JSON state file per bot; backoff stored as remaining ticks | Accepted 2026-10-12 |
| PD-32 | CLI `golem build` / `golem run` arguments, outputs and exit codes | Accepted 2026-10-12 |
| PD-33 | Diagnostic codes `C<check>/<slug>`, with `C00` for lexical and syntax errors | Accepted 2026-10-12 |
| PD-34 | Backend primitive names are the §17.1 names; the overloaded `interact` is split by signature | Accepted 2026-10-12 |
| PD-35 | The `contracts` section copies the clause trees, and `check-ir` verifies the copy | Accepted 2026-10-12 |
| PD-36 | IR sources table; std modules appear as `std/golem/<m>.golem`, the prelude as `std/prelude.golem` | Accepted 2026-10-12 |
| PD-37 | Goal-typed constants use the backend Goal encoding | Accepted 2026-10-12 |
| PD-38 | Evaluated filter constants flatten associative `\|`/`&` chains | Accepted 2026-10-12 |
| PD-39 | Canonical ordering inside the IR: map keys ascending, resource sets in §2 order, failure sets sorted | Accepted 2026-10-12 |
| PD-40 | Lowering of straight-line code: choice states for `if`/`match`/`let … else`/loop heads, `$` temporaries, counters, iterators | Accepted 2026-10-12 |
| PD-41 | Implicit clauses are explicit IR clauses whose nodes point at the declaration | Accepted 2026-10-12 |
| PD-42 | Defaults filled at call sites as `const` literals spanning the callee's default expression | Accepted 2026-10-12 |
| PD-43 | Each job root is a chart (`job:<task>`) with one composite call | Accepted 2026-10-12 |
| PD-44 | `when … until` charts: completion and `return` go to `#restart`, whose transition replays the root's initial transition | Accepted 2026-10-12 |
| PD-45 | Catch arms sit outside the protected compound; deferred calls are `<i>.defer.call` states; `#end` runs the root's defers before `ensures` | Accepted 2026-10-12 |
| PD-46 | Handler charts per instance, with options and periods evaluated per instance | Accepted 2026-10-12 |
| PD-47 | `impl Trait` parameters become type arguments in order; `Window<K>` members are extern fns per kind | Accepted 2026-10-12 |
| PD-48 | One `old` slot per `old(…)` occurrence in source order; `?.` binders are scoped to their expression | Accepted 2026-10-12 |

### Escalations

All 13 were accepted by Paul on 2026-10-12 with the answers below. Full context is in [ESCALATIONS.md](ESCALATIONS.md); the spec text is in errata v0.2.1.

| ID | Question | Accepted answer (2026-10-12) |
| --- | --- | --- |
| E-1 | §14.1 lacks keys that §17.2 reads (light, sign text, on-fire, vehicle, reach attributes, entity item/owner/bite) | Add the keys as drafted; keep `path_progress` a measurement |
| E-2 | Replies have no correlation id | Add optional `id`, echoed in the reply |
| E-3 | No outcome for a malformed or unknown command | Add refusal `BadCommand` |
| E-4 | Selector box and `team=` have no filter leaf | Add `box` and `team` leaves; confirm that `distance=n` means `within(n)` |
| E-5 | Simple failure and notice names can collide on the wire | Compile error on a collision within one bot |
| E-6 | §18.5's persistence mismatch report has no type | Add `state_not_restored` |
| E-7 | Is `D` in `when … for D` constant? | Yes, like `every D` |
| E-8 | Session end has no report | `disconnected.final` plus exit status 1 |
| E-9 | Handlers have no names, but §18.5 keys them by name | Use the declaration index |
| E-10 | Registry types' order "by id" | The string id, so wire order needs no version data |
| E-11 | No terminal report for a cancelled frame | Add `task_cancelled` |
| E-12 | Does §13.5's "may call an extern task" mean directly or transitively? | Direct; callee failures propagate minus caught |
| E-13 | `Unit?` has no unambiguous wire form | Make it a non-wire type |

### Spike-dependent items (D3)

S-1 packet flushing, S-2 attribution rule, S-3 data sources, S-4 version pin and S-5 pathfinder progress are provisional and isolated. See [SPIKE_DEPENDENCIES.md](SPIKE_DEPENDENCIES.md). A no-go changes at most `schemas/provisional.schema.json`, `types/backend.d.ts`, one `required` list in `tick-input.schema.json`, and example data.

---

## Package

```
contracts/
  schemas/      JSON Schema 2020-12; one $id per file: https://psu-de.github.io/golem/contracts/0.1/<file>
  types/        generated .d.ts (one per schema), index.d.ts, hand-written backend.d.ts
  examples/     Lumberjack.golem-ir.json and the session examples; invalid/ negative fixtures
    lumberjack/ verbatim copies of the spec's code blocks the IR's spans point into
    author/     the hand-written source of the Lumberjack IR (state by state) and its helpers
  scripts/      generate-types, check-ir, validate-all, check-docs
  test/         stub-backend.ts (implements Backend), stub-ir-consumer.ts
```

`npm test` runs, in order:

1. `generate-types --check` and the Lumberjack builder's `--check` (no drift);
2. `validate-all` (examples, semantic checks, negative fixtures);
3. `check-ir` on the Lumberjack IR;
4. `tsc` over the types and the stubs (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`);
5. `check-docs` (no uncovered COVERAGE row, every PD/E/S reference defined, the example sources verbatim from the spec).

Node ≥ 20, no runtime dependencies. The dev dependencies are pinned exactly: `ajv` 8.17.1 and `typescript` 5.9.3.

**Single source of truth.** Every data shape is a JSON Schema. `scripts/generate-types.mjs` turns each `$defs` entry into an exported type of the same name. Def names are unique across the package, so `types/index.d.ts` re-exports everything. The generator supports exactly the keyword subset the schemas use and fails on any other keyword, so a schema change can never be silently dropped from the types. json-schema-to-typescript was tried first and rejected: version 16 turns `prefixItems` tuples into `never[]` and copies cross-file types into every file. `types/backend.d.ts` is hand-written because it defines methods, and it imports only generated types.

**What schemas cannot say** is checked by scripts:

- sets and non-string-keyed maps ascending and duplicate-free (`scripts/lib/wire.mjs`);
- referential integrity of the IR (`check-ir`);
- delta key uniqueness, run-length totals, and report sequencing and consistency with the IR (`validate-all`).

### Section to schema mapping

| Spec | Schema / file |
| --- | --- |
| §2 program model, resources | `ir/types#/$defs/Resource`, `ResourceSet` |
| §3.4 literals | `ir/expr#/$defs/ExprLit` |
| §4.1 expressions | `ir/expr#/$defs/Expr`, `Pattern` |
| §4.1, §10 statements | `ir/stmt-actions#/$defs/FnStmt` (fns), `Action` and `ir/statechart` (tasks, handlers) |
| §6.1–§6.4 types, generics | `ir/types#/$defs/TypeRef`, `TypeDecl`, [Type references](#type-references) |
| §6.9 wire forms | `wire.schema.json` |
| §7 fns | `ir.schema.json#/$defs/Fn`, `FnBody` |
| §8 filters | `wire#/$defs/ItemFilter`, `BlockFilter`, `EntityFilter` |
| §9 tasks and clauses | `ir.schema.json#/$defs/Task`, `Clauses` and the clause defs |
| §9.6 action reports | `tick-input#/$defs/ActionReport` |
| §10.4–§10.8 scopes | `ir/statechart#/$defs/StateAbort`, `StateWith`, `StateTry`, `StateRetry`, `StateAtomic`, `StateAsync`, `StateScope` |
| §11 activities | `ir/handlers.schema.json` |
| §12 bots | `ir.schema.json#/$defs/Bot`, `Job`, `StartJob`, `Settings` |
| §13.1 checks | `diagnostic.schema.json` |
| §14.1 world keys | `world.schema.json` |
| §14.3 predictions | `delta.schema.json` |
| §14.5 attribution | `provisional#/$defs/KeyCause` (S-2) |
| §15.2 phase 1 | `tick-input.schema.json` |
| §15.5 replay | `tick-input#/$defs/RecordedTick` |
| §16.1 failures | `wire#/$defs/BuiltinFailure`, `UserFailure`, `report#/$defs/Failure` |
| §16.2 reports | `report.schema.json` |
| §16.3 commands, replies | `command.schema.json`, `reply.schema.json` |
| §17.1 primitives | `backend-data.schema.json` |
| §17.3 goals | `wire#/$defs/Goal`, `PathOpts`, `BuildOpts` |
| §17.6 events | `tick-input#/$defs/EventName`, `BackendEvent` |
| §18.2 IR | `ir.schema.json` |
| §18.3 statecharts | `ir/statechart.schema.json` |
| §18.4 backend | `types/backend.d.ts`, `backend-data.schema.json` |
| §18.5 persistence | `persistence.schema.json` |
| question 7 | `launch.schema.json`, [Transport](#transport), [CLI](#cli) |
| finding 15 | `diagnostic.schema.json` |

### Versioning and freeze policy

- **Contract version** `0.1` is in every `$id` path, the IR `header.ir_format` (`golem-ir/0.1`), `hello.protocol` (`golem-protocol/0.1`), `launch.format` and the state file `format`. The package version became `0.1.0` at the D2 freeze on 2026-10-12.
- **Frozen since D2 (2026-10-12)**, `0.1` schemas change only through errata that fix a contradiction with the spec. Each erratum is a patch release (`0.1.1`, …) noted here, and never adds, removes or retypes a field that a conforming producer emits. Any other change, including an additive field (validators reject unknown fields under `additionalProperties: false`), is a new contract version `0.2` with new `$id`s, `ir_format` and `protocol`. A runtime refuses an IR whose `ir_format` it does not implement.
- **D3 outcomes** may still change the provisional items listed in [SPIKE_DEPENDENCIES.md](SPIKE_DEPENDENCIES.md). Because D3 comes after D2, such a change is an erratum confined to those definitions.
- The `$id`s are identifiers, not fetched URLs.

---

## Names

Every task, fn, const, type, failure, notice and activity in the IR has a fully qualified name (PD-14). There are no generics and no unresolved names.

```abnf
qualified   = [ module "." ] [ receiver "." ] member [ type-args ] [ signature ]
module      = ident *( "." ident )                ; source module path, e.g. golem.core, woodcutting
receiver    = type                                ; impl member: golem.windows.Window<golem.windows.Container>.slot
member      = ident / type-ident
type-args   = "<" type *( "," type ) ">"          ; instance of a generic declaration, in parameter order
signature   = "(" [ type *( "," type ) ] ")"      ; only when the overload set has more than one member
ident       = %x61-7A / "_" ... (§3.2 IDENT); type-ident = §3.2 TYPE_IDENT; type = see Type references
```

Rules:

- **Declarations in modules** are `module.name`: `woodcutting.chop_trees`, `golem.prim.NoPath`, `golem.filters.SAFE_FOOD`.
- **Monomorphized instances** append the type arguments of the generic declaration in order: `golem.core.open<golem.windows.Container>`. An `impl Trait` parameter is an anonymous type parameter, numbered in order of appearance after the named ones (PD-47): `golem.core.deposit<golem.windows.Container>`, `golem.prim.close<golem.windows.AnyKind>`.
- **Overloads** append the parameter types, as instantiated and without the receiver, when the module's overload set for that name has more than one member: `golem.core.goto(Goal,Int,PathOpts)`, `golem.core.goto(Entity,Float)`, `golem.prim.interact(BlockPos,Face)`. A name that is not overloaded never carries a signature.
- **Members of built-in types** have no module: `Bot.food`, `World.blocks`, `Inventory.count`, `Entity.alive`, `Goal.reached`, `List<BlockPos>.first`, `ItemFilter.of`. Members declared in a std impl keep the module: `golem.windows.Window<golem.windows.Container>.slot`. Window members are monomorphized per kind like everything else (PD-47).
- **Prelude fns** have no module and follow the overload rule: `floor`, `min(Int,Int)`.
- **Prelude types** with a Golem declaration (`Goal`, `PathOpts`, `BuildOpts`, `Face`, `Hand`, `Ingredient`, `ProcessingKind`, the recipe structs, `Entry<K,V>` instances) have no module.
- **On the wire**, implicit-failure `task` fields, trace frames and report `task` fields carry the qualified name. Failure and notice `type`/`name` fields carry the simple declared name (§16.2; E-5).
- **Jobs** are named by their task's qualified name (PD-22); jobs are never generic or overloaded (§12.1).
- **Activity instances** are named by their `use` name (`auto_eat`), or `job.activity` for `@attaches` instances (§11.7).

## Type references

Types are canonical strings (PD-15). Whitespace never appears; aliases are resolved (`SlotRange` is written `Range`).

```abnf
type        = base [ "?" ]                        ; T?? is not a type (§6.1)
base        = type-name [ "<" type *( "," type ) ">" ]
type-name   = builtin / [ module "." ] type-ident
builtin     = "Unit" / "Bool" / "Int" / "Float" / "String" / "Duration" / "Angle" / "List" / "Set" / "Map"
            / "Range" / "BlockPos" / "Vec3" / "Region" / "ItemType" / "BlockType" / "BlockState" / "EntityType"
            / "ItemStack" / "Tag" / "ItemFilter" / "BlockFilter" / "EntityFilter" / "Entity" / "Window"
            / "Inventory" / "Bot" / "World"
```

Built-in types take a fixed number of type arguments: one for `List`, `Set`, `Tag` and `Window`, two for `Map`, none for the rest. Every other name must be a key of the IR's `types` section, instance included (`Entry<ItemType,Int>`). Window kinds are empty structs (`golem.windows.Container`) whose `window_kind` data carries their menu types, capability traits and grid. `scripts/lib/names.mjs` implements this grammar and the one above.

## IR

`<Bot>.golem-ir.json` (§18.2) has exactly the sections `header`, `types`, `failures`, `notices`, `consts`, `fns`, `tasks`, `activities`, `bot` and `contracts`, and holds only what the bot reaches (`check-ir` rejects anything unreached).

- **No version data.** The IR embeds no registries, block states, tags, recipes, hardness, shapes, burn times or placement rules. Registry ids and tags in literals were checked at compile time against the target version (§6.8). The runtime loads version data itself (`launch.json` `data`, S-3), and the backend's announced tags and recipes arrive as world keys (§14.1). One IR can therefore run against any data source for its `header.minecraft`.
- **Maps.** Map sections are keyed by qualified name, ascending (PD-39). `fns` includes extern fns by name with their monomorphized signature and no body (§18.2: "extern fns by name"). User failures and notices carry their wire name; built-in failures (§16.1) are fixed by the spec and not listed.
- **Tasks.** A task carries its signature and written modifiers; its effective irreversibility (inferred for composites, §9.1); its primitive name, class and confirmation methods (externs only); its clauses as expression trees, implicit ones first (PD-41); its `old` snapshot expressions (PD-48); its inferred `uses` (§13.3); its inferred failure set (§13.5, read per E-12); its boundedness and may-pin flags; and its statechart (composites only).
- **Consts.** Consts are evaluated to wire values (PD-37, PD-38). Defaults are filled at every call site (PD-42), so the runtime never evaluates a default expression.
- **Contracts.** `contracts` repeats every task's params, result, `requires` and `ensures` for external planners (decision 45), with each `ensures` marked `point_in_time` (§14.5). `check-ir` verifies the copy (PD-35).

### Expressions

`ir/expr.schema.json` is a closed union discriminated by `kind`. It covers every expression form of §4.1 and §7 (see COVERAGE.md §1). Every node carries its resolved `type` and `span`.

- **Calls** carry the resolved overload's qualified name in `target` (§6.7). That name is always a key of `fns`, and the call carries `form` (property, method, static, free).
- **Operators** carry `target`: either a built-in signature such as `+(Duration,Duration)`, `matches(BlockState?,BlockFilter)` or `|(ItemFilter,ItemFilter)`, or the qualified name of a user operator impl.
- **Literals** carry their value in the §6.9 wire form of their type. RESOURCE, TAG and SELECTOR literals typed as filters carry their §8.4 tree. `form: "const"` marks compile-time-folded constants such as filled defaults.
- **IR-only nodes** (PD-17). Four nodes keep lowering simple without adding semantics:
  - `opt`: `?.` with an explicit binder;
  - `unwrap`: the `T` of a `T?` already tested non-none;
  - `is_none`: needs no `Eq`, unlike `e == none`;
  - `iter_more`: the guard of a lowered `for`.
- **Evaluation order** (§7.1) is left to right. Arguments appear in parameter order; when named arguments were written in another order, `order` lists the written ones in evaluation order (PD-18).

### Statecharts

Each task body, handler body and job root is lowered to one statechart (§18.1 step 7, §18.3; PD-19). A chart is a flat map from state id to state, with `parent` links giving the hierarchy. `root` is the owner's `scope` state, and `locals` types every frame-local slot.

| §18.3 construct | State kind |
| --- | --- |
| extern call awaiting its verdict | `extern_call` (atomic) |
| `wait` | `wait` |
| `wait until` | `wait_until` |
| the pending limit | `pending` (`<call>.call.pending`) |
| an async barrier | `barrier` (`<async>.async.barrier`) |
| a `when … until` restart point | `restart` (`#restart`) |
| a call into a composite, callee nested by reference | `composite_call` (callee's chart is `tasks.<callee>.chart`) |
| `abort when` | `abort` (compound, region `abort.body`) |
| `try` / catch postfix | `try` (`form: try`, regions `try.body`, `try.catch<k>`; `form: postfix`, regions `catch.call`, `catch.arm<k>`) |
| `retry` | `retry` (region `retry.body`) |
| `atomic` | `atomic` (region `atomic.body`) |
| `confirm async` | `async` (region `async.body`, child `barrier`) |
| `defer` scope | `scope` with `defers: true` (the root, or a block region that registers defers); deferred calls are `<stmt>.defer.call` call states |
| `with` | `with` (parallel: `with.child` is the ongoing call strand, `with.body` a scope) |
| `loop every` head | `loop_every` |
| branching and loop heads in straight-line code | `choice` pseudo-state |
| completion and `return` | `final` (`#end`) |

**Transitions** carry an optional guard, a list of actions and a target. The actions form a closed set: `bind`, `assign`, `eval`, `notify`, `heartbeat`, `fail`, `return`, `defer`, `check`, `counter_init`, `counter_step`, `iter_init`, `iter_next`, `variant`. `target` is null exactly when the last action is `fail`. A `return` is always last and leads to `#end`, or to `#restart` in a `when … until` handler. In a `choice`, every transition but the last has a guard.

**Lowering of straight-line code** (PD-40). Statements between suspension points become actions on the transition that reaches the next state:

- `if`, `match`, `let … else` and loop heads become `choice` states at the statement's id.
- `let x = e else …` binds a temporary `$t<n> = e`, then a choice tests `is_none($t<n>)`, then `bind x = unwrap($t<n>)`.
- `if let` works the same way.
- `repeat n` and `retry n` use counter slots: `counter_init` with min 0 or 1 (the Defect check of §10.2/§10.5), a `$c > 0` guard and `counter_step`.
- `for` uses `iter_init`, `iter_more` and `iter_next`.
- `while c decreasing v` checks `v` with the `variant` action.
- `break` and `continue` are transitions to the loop's exit or head.
- Code after a branch is repeated on each incoming transition.

**Failure-pattern transitions** (`catches` on `try` and `retry`) implement catch arms (§10.5). The first matching arm fires after the unwind to the compound has finished (§10.6). A `retry`'s single catch transition is guarded by `$c > 1`, steps the counter and re-enters the retry state. Catch-arm states are outside the protected compound: their parent is the try's parent, while their ids keep the try's prefix (PD-45).

**Exit behaviour** (PD-19, PD-45). A transition may leave any number of compound states; the runtime runs their exit behaviour innermost first before reaching the target:

- a scope with `defers` runs its pending deferred calls, last in first out, each in its `.defer.call` state;
- leaving a `with` body cancels the child strand;
- leaving an `async` passes through its barrier.

Reaching `#end` exits the root scope, so its defers run before the frame's `ensures` are checked (§9.7).

**Handlers** (§11.4). Each handler of each instance has its own chart, owned by `<instance>/<index>` (PD-46). Without `until`, a completed run reaches `#end`. With `until`, completion and `return` lead to `#restart`, whose `next` repeats the root's initial transition, so the next run starts from statement 0 (PD-44, decision 135). An ongoing call as the last statement has no `next`. The handler's own states (Idle, Active, Backoff, disabled) belong to the runtime and are exported as `HandlerState` in snapshots.

**Job roots** (PD-43) are charts owned by `job:<task>`. Each has one `composite_call` of the job task with the job's parameters, then `#end`.

### State ids

The grammar (PD-20), as ABNF:

```abnf
state-id      = owner [ "#" path ]                ; the owner alone is the chart's root scope
owner         = task-name / handler-owner / job-owner
task-name     = qualified                         ; see Names
handler-owner = instance "/" index                ; auto_eat/0, patrol.guard/1
instance      = ident [ "." ident ]
job-owner     = "job:" qualified                  ; job:woodcutting.chop_trees
path          = "end" / "restart" / steps
steps         = index *( "." region "." index ) [ "." region ]
index         = "0" / %x31-39 *DIGIT              ; statement index within its block, 0-based
region        = "if.then" / "if.else" / "if.elif" pos-int / "match.arm" index
              / "for.body" / "repeat.body" / "while.body" / "loop.body"
              / "abort.body" / "with.child" / "with.body"
              / "try.body" / "try.catch" index / "catch.call" / "catch.arm" index
              / "retry.body" / "atomic.body" / "async.body" / "async.barrier"
              / "defer.call" / "let.else" / "call.pending"
pos-int       = %x31-39 *DIGIT
```

The equivalent regular expression (`ir/statechart#/$defs/StateId`, `scripts/lib/names.mjs`), with `IDX` = `(0|[1-9][0-9]*)` and `REGION` the alternation above:

```
^(job:[^#/:]+|[^#/:]+|[a-z_][A-Za-z0-9_]*(\.[a-z_][A-Za-z0-9_]*)?/IDX)(#(end|restart|IDX(\.REGION\.IDX)*(\.REGION)?))?$
```

Region segments by compound statement:

| Statement | Region segments |
| --- | --- |
| `if c {…} else if d {…} else {…}` | `if.then`, `if.elif1`, `if.elif2`, …, `if.else` |
| `match` statement | `match.arm0`, `match.arm1`, … |
| `for`, `repeat`, `while`, `loop every` | `for.body`, `repeat.body`, `while.body`, `loop.body` |
| `abort when` | `abort.body` |
| `with t() {…}` | `with.child` (the ongoing call), `with.body` |
| `try {…} catch {…}` | `try.body`, `try.catch0`, `try.catch1`, … |
| `t(args) catch {…}` | `catch.call` (the call), `catch.arm0`, … |
| `retry n on … {…}` | `retry.body` |
| `atomic {…}` | `atomic.body` |
| `confirm async {…}` | `async.body`, `async.barrier` |
| `defer t(args)` | `defer.call` (the deferred call) |
| `let x = e else {…}` | `let.else` |
| extern call inside `confirm async` | `call.pending` (its pending-limit wait) |

Examples: `woodcutting.chop_trees#0.repeat.body.3.catch.call` is the `mine(log)` call; `golem.core.consume#2.with.body.0` is the `wait until`; `woodcutting.stash_logs#2.defer.call` is the deferred `close(w)`; `auto_eat/0#restart` is the restart point.

**Stability rule (§18.3).** An id depends only on the owner and on the indices and region names along its path. It therefore stays stable as long as the statements before it on its path are unchanged. Editing a later statement, a statement in another block, or an expression inside a statement never changes it. `check-ir` verifies that every id parses, that ids are unique (they are map keys, and the owner prefix makes them unique across charts), that every parent is a compound whose id is a prefix, that every transition target exists, and that no state is unreachable.

### Unwinding

§10.6 is runtime semantics. The IR gives the runtime what it needs to carry it out: the compound hierarchy (`parent`), the defer scopes and `.defer.call` states, the `with` regions (child strands unwind first), and the `catches` of each `try`/`retry` (the unwind target). The order is innermost first. Each exiting scope runs its pending defers last in first out, as normal frames with contracts. Outer frames keep their checks, and a failing outer frame moves the target outward. A deferred call failing during unwinding is reported (`defer_failed`) and the rest still run. Infrastructure failures skip defers (decision 62).

## World keys

One canonical string per key (PD-9). This is what `Interfered.key` carries, and what a backend reports.

```abnf
key            = block-key / light-key / sign-key / player-key / inventory-key / window-key / entity-key / world-key
int            = "0" / [ "-" ] %x31-39 *DIGIT     ; canonical decimal, no "+" and no "-0"
pos            = int "," int "," int
block-key      = "block(" pos ")"
light-key      = "light." ( "block" / "sky" ) "(" pos ")"                    ; E-1
sign-key       = "sign(" pos ")"                                             ; E-1
player-key     = "player." ( "position" / "rotation" / "health" / "food" / "saturation" / "oxygen" / "effects"
               / "on_ground" / "in_water" / "in_lava" / "sneaking" / "sprinting" / "using_item" / "sleeping"
               / "dead" / "dimension" / "held_slot" / "on_fire" / "vehicle" )   ; on_fire, vehicle: E-1
               / "player.attribute(" resource ")"                            ; E-1
inventory-key  = "inventory.slot(" slot ")" / "inventory.cursor"             ; slot 0..45
window-key     = "window.id" / "window.kind" / "window.slot(" nat ")" / "window.property(" nat ")"
entity-key     = "entity(" int ")." ( "type" / "position" / "name" / "health" / "equipment" / "passengers"
               / "alive" / "item" / "owner" / "biting" )                     ; item, owner, biting: E-1
world-key      = "world.time_of_day" / "world.weather" / "world.recipes"
               / "world.tag(" ( "item" / "block" / "entity_type" ) "," resource ")"
resource       = §3.4 RESOURCE
```

Value shapes are in `world.schema.json`, one definition per family; `null` means absent:

- **Blocks**: a `BlockState` string, or `null` when unloaded.
- **Player**: position `Vec3`; rotation `{yaw, pitch}`; effects ascending by id `{effect, amplifier, duration}`; dimension and attributes by id.
- **Inventory**: slots and cursor are `ItemStack | null`.
- **Window**: `window.id` is a `WindowHandle` or `null`; `window.kind` is the menu type, or `null` for the horse screen, which has no menu type.
- **Entities**: a non-alive entity keeps its last values (§17.2).
- **World**: tag contents and recipe ids are ascending id lists.

`chunk_load` and `chunk_unload` (PD-10) abbreviate the per-key changes of one chunk column, palette plus runs in y, z, x order, and always count as Outside.

## Backend interface

`types/backend.d.ts` defines `Backend` with exactly the six §18.4 operations. Data shapes come from `backend-data.schema.json`, `tick-input.schema.json`, `delta.schema.json` and `launch.schema.json`.

**Clock and call discipline (PD-2).** The spec makes the tick clock the backend's 20 Hz physics tick, so the backend drives the runtime:

- `connect(launch, clock)` receives the runtime's `TickClock`. From the first successful connect until `disconnect()`, the backend calls `clock.tick()` exactly once per physics tick: never re-entrantly, never concurrently with another call into the runtime.
- The clock keeps running across server disconnects (a local 50 ms timer), so `reconnect_delay` can be counted in ticks.
- Inside `tick()` the runtime calls `ingest()` once (phase 1), then `start`/`cancel` (phases 2, 5, 6), then `flush()` once (phase 7). All four are synchronous and never wait on I/O, so a tick's decisions depend only on its TickInput and commands (§15.5).
- `connect` and `disconnect` are async and only called outside `tick()`. The runtime acts on a connection outcome only when it arrives as a `connected` or `connect_failed` infra event, so a recording replays it at the same tick.
- To reconnect, the runtime calls `connect` again; `disconnect()` ends the session and stops the clock.
- `TickInput.tick` numbers clock ticks from 0. Reports carry the same number (PD-24); `world.tick` counts from the last `connected` (§15.5).

**Actions.** `ActionId`s are assigned by the runtime, 1 then +1 per `start` call, and replay reproduces them (PD-12). A durative frame restarted after a freeze gets a new action. `StartMode` is `"sync"` or `"async"`. In async mode `start` must return the predicted `Delta`; in sync mode it returns `undefined`. `cancel` on an action that already has a verdict is a no-op.

**Arguments.** `PrimitiveArgs<P>` is keyed by primitive name (PD-34), derived from the generated `PrimitiveCall` union (one argument object per §17.1 row, every parameter present, defaults filled). Handles use backend-only encodings (PD-8):

- `Entity` is `{"entity": id}`.
- `Window<K>` is `{"window": protocolId, "generation": n}`, where the backend assigns `generation` on every opening (window 0 is `{0, 0}` and never stale). A stale handle reaches the runtime as `Failed(WindowClosed)` and is never thrown.
- `Goal` is the §6.9 enum form with `NearEntity.target` as an entity handle.

**TickInput** is fully JSON-serialisable. It holds attributed key changes (`KeyChange`, `ChunkLoad`, `ChunkUnload`), backend events (§17.6 without `spawned` and `died`, which come from infra events: PD-13), action reports (`Running`, `Issued`, `Confirmed`, `Rejected(detail)`, `Failed(failure)`), infra events (`connected`, `connect_failed`, `disconnected`, `kicked`, `died`, `spawned`) and measurements (`path_progress`; `round_trip_ms`, S-2).

The runtime processes a TickInput in a fixed order (PD-11): a `connected` event first (it resets the confirmed view), then changes in order, then events, then reports, then the other infra events.

`RecordedTick` pairs a TickInput with the commands applied that tick: a replay recording (§15.5).

## Reports, commands and replies

**Envelope** (§16.2): `seq` (1, then +1 per message for the whole runtime session, PD-24), `tick`, `bot`, `type`.

**Failures** are `{type, fields, trace}`. `type` is the simple name (E-5), and `fields` are typed per §16.1 or the IR's failure declaration. `trace` lists the frames the failure unwound, innermost first. Each frame is `{task, file, line, column}`: where that frame was executing, with an extern frame at its declaration (PD-26).

Field types for every "Extra fields" entry of §16.2 are in `report.schema.json`. The additions (PD-25) are:

| Report | Addition | Why |
| --- | --- | --- |
| `job_started` | `job`, `args` | which job started (the start job is assigned by the runtime) |
| `thread_started` | `job_id`, or `instance` + `handler` | which job or handler the thread runs, as `notice` already does |
| `thread_ended` | `failure` when the outcome is failed | |
| `resumed` | `by`: `"resume"` or `null` | §16.2 lists `by`; this is its meaning for resumes |
| `handler_failed`, `handler_disabled` | `failure` | |
| `handler_backoff` | `failures`, `duration` | |
| `event_dropped` | `event` | |
| `disconnected` | `kind`, `final` | `final` answers E-8 |
| `reconnected` | `attempt` | |

`hello` adds `protocol`. New types: `task_cancelled` (E-11) and `state_not_restored` (E-6).

**Commands** (§16.3, PD-27) are discriminated by `command`: `assign {job, args, job_id}`, `cancel`, `pause` and `resume` with `{job_id}`, and `snapshot {}`. `assign.args` is an object by parameter name; omitted parameters take their declared defaults, unknown names or undecodable values are `BadArgs`. An optional `id` is echoed in the reply (E-2).

**Replies** extend §6.9's `{"reply": "accepted"|"refused", "job_id": …}` with `command` (echoed), an optional human-readable `detail` on refusals, and the optional `id`.

- **Refusal reasons**: `Busy`, `UnknownJob`, `BadArgs`, `NotReady`, `NoJob`, `NotPaused`, plus `BadCommand` (E-3).
- **Idempotence**: `pause` of a paused job is accepted; `resume` of a running job is `NotPaused`.
- **Snapshot**: `snapshot` is accepted with a `MachineSnapshot` (PD-28):
  - each thread with its state, pin flag and origin;
  - each strand with its frames;
  - each frame with its task, state id (an extern frame awaiting its verdict reports its task name as its state), active elapsed ticks and wire-typed arguments (handles omitted);
  - each activity instance with its vars and per-handler state, failure count and backoff end.

## Transport

The question 7 default (PD-29) is stdio JSON Lines: one UTF-8 JSON object per line, `\n` terminated.

- **stdin** carries commands.
- **stdout** carries reports and replies, interleaved in emission order; a reply has `reply` where a report has `type`.
- **stderr** carries human-readable logs, never parsed.

Replies to the commands of one tick are written in that tick's phase 3, in arrival order. EOF on stdin does not stop the bot; it only ends the supervisor's ability to command it. SIGINT or SIGTERM end the session: the runtime cancels the job (running defers), disconnects, flushes the state file and exits 0. One process runs one bot.

## CLI

PD-32 is the question 7 default. The CLI is specified here and not implemented yet.

```
golem build [--project DIR] [--bot NAME]... [--out DIR] [--format text|json] [--data DIR]
```

Compiles the project in `DIR` (default `.`, containing `golem.toml`) and writes `<Bot>.golem-ir.json` to `--out` (default `build/`) for each bot, or only those named with `--bot`. `--data` is the data-generator cache for the target version (§18.1; default `~/.golem/data/<version>`). With `--format json`, diagnostics go to stdout one per line (`diagnostic.schema.json`), sorted by file, then offset, then code; with `text` (the default) they go to stderr as `file:line:col: severity code: message [§ref]`.

| Exit code | Meaning |
| --- | --- |
| 0 | success; warnings may have been reported |
| 1 | compile errors; no IR is written for any bot with errors |
| 2 | usage or I/O error (no `golem.toml`, unknown `--bot`, missing version data) |
| 3 | internal compiler error |

```
golem run LAUNCH.json [--record FILE] [--replay FILE]
```

Runs the bot described by the launch file, speaking the transport above. `--record` writes one `RecordedTick` per line, and `--replay` runs the recording against the simulator backend instead of a server (§15.5, §18.4).

| Exit code | Meaning |
| --- | --- |
| 0 | the session ended by signal, or a replay finished |
| 1 | the session ended because `max_reconnects` was exhausted (the last report is `disconnected` with `final: true`, E-8) |
| 2 | usage error, or the launch file failed `launch.schema.json` |
| 3 | the IR failed to load: schema or `ir_format` mismatch, `header.minecraft` differs from `launch.minecraft` (decision 46), or the server runs another version (decision 46) |
| 4 | internal runtime error |

## launch.json

`launch.schema.json` (PD-30) carries:

- the format tag, bot name and IR path;
- the expected Minecraft version (must match the IR, decision 46);
- the server `{host, port}`;
- `auth`: `{mode: "offline", username}`, or `{mode: "microsoft", profile, cache}`, which names an entry in a token cache created beforehand by an interactive login;
- the persistence path;
- version-data sources (S-3);
- an optional log level.

No password, token or secret can appear: unknown fields are rejected (`examples/invalid/launch.inline-password.json`). Paths are relative to the launch file. One IR can drive many accounts through many launch files (§12.2).

## Persistence

One JSON file per bot (§18.5, PD-31): `format`, `bot`, the writer's `ir_hash` (informative), and `instances` keyed by instance name. Each instance holds its `activity`, its `vars` as `{type, value}` (restored only when the new IR has the same instance, name and type), and each handler's `{handler, failures, remaining}` backoff state. `remaining` counts ticks, because tick numbers restart with a new session.

The file is rewritten after every tick in which something in it changed. Attached instances, disabled flags (session-scoped, §11.4) and jobs are never stored. Mismatches are reported as `state_not_restored` (E-6).

## Diagnostics

`diagnostic.schema.json` (finding 15, PD-33) defines one object per diagnostic:

- `code`: `C<nn>/<slug>`, where `nn` is the §13.1 check number 01–14, or 00 for lexical and syntax errors of §3–§4; slugs are kebab-case and never reused for another meaning;
- `severity`: `error` or `warning`; the warnings are `C08/unreachable-catch-arm`, `C01/unused-import` and `C07/implied-requires`, as §13.1 lists them;
- `message`;
- `span`: the file plus start and end, each `{line, column, offset}`, with 1-based lines, columns in code points and offsets in UTF-8 bytes (PD-16);
- `spec`: the violated §;
- `related`: optional extra spans with their own messages.

`examples/diagnostics.jsonl` has at least one error per check and each warning, which is the starting code catalog.

---

## Proposed decisions

All 48 were accepted by Paul on 2026-10-12 and are frozen for v0.1. Each entry gives the choice and why it is the simplest one consistent with spec v0.2.

- **PD-1, package and versioning.** One standalone package, so three teams depend on exactly one artifact. JSON Schema is the source of truth because every producer and consumer can validate against it, including non-TypeScript ones such as an azalea backend (decision 64). The custom generator is about 200 lines, because the stock generator mishandled tuples and cross-file references (see [Package](#package)).
- **PD-2, clock.** §18.4 makes the clock the backend's physics tick. Synchronous tick-phase calls are the only way to make a tick's decisions a pure function of TickInput and commands (§15.5). Routing connection outcomes through TickInput keeps reconnects replayable. Keeping the clock alive across disconnects is the simplest way to count `reconnect_delay` in ticks (§12.2).
- **PD-3, BlockState.** §6.9 says "the BLOCKSTATE literal text", and a literal may list a subset of properties (§6.8: unlisted properties are defaults). Emitting every property makes the text canonical; accepting subsets matches literal typing.
- **PD-4, components.** The spec names `components` but not their encoding. Vanilla's own JSON form is the only one both sides already have, and `has_component(id)` tests key presence.
- **PD-5, ANY and NOTHING.** An empty conjunction is true and an empty disjunction false, so no new leaves are needed. `{}` for zero-argument leaves is §8.4's object form with no arguments.
- **PD-6, leaf names.** §8.4 shows `item`, `tag`, `within`, `placed` and `near`; `block`, `state` and `entity` follow the same naming. Tag leaves keep §8.4's `{"tag": "minecraft:logs"}` without `#`; the filter's type says which registry is meant.
- **PD-7, Defect.at.** `at` is a `String` (§16.1). A source position is what a supervisor can act on.
- **PD-8, handles.** Protocol window ids are reused (0–255), so a generation counter is the minimal way to detect the staleness of decision 32. The backend assigns it because it sees the open-window packets; the runtime learns it from `window.id`.
- **PD-9, world keys.** `Interfered.key` is a `String` on the wire (§16.1), so keys need one canonical spelling. Function-call syntax mirrors the spec's own `block(pos)`. Null-as-absent avoids a separate remove operation.
- **PD-10, chunks.** Loading one chunk column is about 98,000 `block(...)` changes. A palette plus runs is an exact abbreviation that keeps recordings small, and chunk data is never Own.
- **PD-11, order.** Phase 1 (§15.2) lists apply, queue, record and act-on-infra without saying how changes, events, reports and infra interleave. Any fixed order makes the phase deterministic. `connected` must come first because it resets the view.
- **PD-12, action ids.** They must be deterministic for replay (§15.5). A per-session counter is the simplest deterministic choice.
- **PD-13, spawned and died.** §12.3 makes `Died` an infrastructure event, and §17.6 makes `died` and `spawned` events. Deriving the event from the infra report guarantees they agree.
- **PD-14, names.** §9.3 needs "the task's qualified name" for implicit failures, and monomorphization and overloads make simple names ambiguous. Signatures only on overloaded names keep the common case readable.
- **PD-15, type strings.** Every node carries a type; structured JSON types would roughly triple the IR's size. The grammar is small and parsed exactly by `check-ir`.
- **PD-16, spans.** Spans are on every node, so they are a compact tuple. Line and column are what a trace shows (§16.1). Code points match how Golem measures strings (decision 91). Diagnostics add byte offsets for tools.
- **PD-17, IR-only nodes.** `?.` and `let … else` need a binder and a non-Eq none test that no surface expression provides. All four nodes are pure and total.
- **PD-18, argument order.** Defects are uncatchable but visible in reports, so which defect fires first is observable. Recording the written order keeps §7.1's left to right exact without verbose named argument lists.
- **PD-19, flat charts.** A flat map gives O(1) lookup by state id (snapshots, persistence) and makes uniqueness structural. Exit behaviour on the runtime side is standard statechart semantics and keeps transitions free of duplicated cleanup.
- **PD-20, ids.** §18.3 gives `module.task#i.j.k` and one example region. The owner-only root, the two reserved terminals and the closed region table are the minimal completion.
- **PD-21, handler identity.** This is the answer to E-9. The index is already the normative handler order (§11.6).
- **PD-22, job names.** Jobs are non-generic and non-overloaded (§12.1), so the qualified task name is unique and unambiguous across modules. `hello` advertises the names.
- **PD-23, job ids.** The supervisor chooses ids in `assign` (§16.3). The start job is assigned by the runtime and needs an id the supervisor can `cancel` or `pause`.
- **PD-24, seq and tick.** A per-bot counter must survive reconnects to keep the stream ordered. `world.tick` resets on connect (§15.5), so reports use the monotonic clock tick.
- **PD-25, extra fields.** Each addition is information a supervisor needs to act and cannot reconstruct otherwise. Nothing the spec lists is removed or retyped.
- **PD-26, traces.** "Each with task name and source position" (§16.1). Innermost first matches unwinding order. An extern frame has no body, so its declaration is its position.
- **PD-27, commands and replies.** The `command` tag mirrors §6.9's `reply` tag. Named args match §6.9's "fields are always written by name". Echoing `command` lets order-correlating supervisors resynchronise.
- **PD-28, snapshot.** Decision 37 exports machine state read-only. Instances and handler states are part of that state. Handles are not wire types (§6.9).
- **PD-29, transport.** This is the question 7 default. stdio needs no port, and each bot is one process.
- **PD-30, launch.** The question 7 default plus §12.2: connection details live outside source, and secrets live outside the launch file.
- **PD-31, persistence.** The question 7 default. Relative backoff survives restarts, whose tick counters start from 0.
- **PD-32, CLI.** The question 7 default. Distinct exit codes let orchestration tell a bot that gave up from one that could not start.
- **PD-33, diagnostic codes.** Finding 15 asks for codes namespaced by the §13.1 check. `C00` covers §3–§4, which §13.1 does not number.
- **PD-34, primitive names.** Backends implement §17.1 by name. Only `interact` is overloaded, so only it carries a signature.
- **PD-35, contracts copy.** §18.2 asks for contracts "as data" for planners. A self-contained copy is easiest to consume, and `check-ir` keeps it honest.
- **PD-36, source table.** Spans need a file. std is shipped as Golem source (§17.9), so it has real paths. §17.3's Goal and option structs live in the prelude.
- **PD-37, Goal constants.** `Goal` is not a wire type, but constants of it can exist; the backend encoding is its only JSON form.
- **PD-38, flattening.** `a | b | c` is one disjunction semantically. Flat trees are canonical and smaller.
- **PD-39, ordering.** Deterministic output makes IR files diffable and hashable (`hello.ir_hash`). The resource order is §2's.
- **PD-40, straight-line lowering.** §18.3 makes straight-line code into transition actions. Choice states plus a closed action set express every control-flow form with no general-purpose code in transitions.
- **PD-41, implicit clauses.** §9.6 and §17.1 make them real clauses, with real failures (`Unmet(task, "alive")`, `WindowClosed`). Writing them out means the runtime has no special cases, and the declaration is the only honest span.
- **PD-42, defaults.** Defaults are constant expressions (§6.3), so filling them at compile time is exact. Their span shows where the value came from.
- **PD-43, job roots.** §18.1 lowers job roots; the minimal root is one call of the job task with the assigned arguments.
- **PD-44, restart.** This is decision 135's "the next run starts in the step phase of the next tick". Re-running the root's initial transition is exactly "starts again".
- **PD-45, catch arms and defers.** An arm runs "in place of the rest of B" (§10.5), outside the try's protection, so its parent is the try's parent. A defer runs "when the enclosing block exits" (§10.4), and the root block exits before `ensures` (§9.7).
- **PD-46, instances.** Options and parameters are per-instance constants (§11.5, §12.1). Per-instance charts give unique state ids.
- **PD-47, monomorphization names.** "The IR has no generics" (§18.2) applies to std members too. Numbering `impl Trait` parameters in order is the only stable name they have.
- **PD-48, old slots.** "All `old` expressions of a frame are evaluated once … in source order" (§9.4). One slot per occurrence is the literal reading.

## Lumberjack IR

`examples/Lumberjack.golem-ir.json` is the exit criterion of Phase 2. It holds everything the §12 bot reaches:

- `woodcutting` (§19.1);
- the std composites `goto` (both overloads used), `mine`, `equip`, `collect`, `consume`, `fight`, `open<Container>` and `deposit<Container>`;
- the fns `next_log`, `next_drop`, `free_slot<Container>`, `feet_of` (in core and prim), `threat`, `count_in` and `window_total<Container>`;
- the 15 primitives it calls, as extern tasks with their full clauses;
- 47 extern fns by name;
- the four survival activities;
- the two job roots and the start job.

It is written state by state in `examples/author/lumberjack.mjs`, against verbatim copies of the spec's code blocks in `examples/lumberjack/`, so every span points at real text. The builder only computes spans and prints JSON. Its `infer()` derives `uses`, may-pin and failure sets per §13.3 and §13.5 with E-12's reading, from the call edges and catches written next to each task.

Lowering choices not covered above: none. Every place where lowering needed a choice the spec does not make is one of PD-40 to PD-48.
