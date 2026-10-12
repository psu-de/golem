# Golem — Language Specification v0.2

Oct 11, 2026 · @Paul

## 0. Status and conventions

Golem v0.2 is self-contained: this document alone defines the language, its standard library and the runtime and backend contracts, and no other document is normative.

**Precedence.** Decisions 1–36 are restated in Appendix A, as amended in §1; decisions 37 onward are in §1. The design log, the four std draft files and the prototypes are archived and bind in no part (decisions 129, 131, 137). Where a decision's wording and the body of this spec differ, the body wins and the difference is an erratum.

**Sources.** v0.2 is v0.1 as amended by the Phase 0 decisions (96–130) and the Phase 1 decisions (131–137). The std signatures are those of the module listings in §17.9; the draft files `primitives.mcb`, `filters.mcb`, `windows.mcb` and `core.mcb` are superseded (decision 131).

**Escalations.** Paul owns this spec. Implementers, human or agent, send him every ambiguity or contradiction they find and get an answer within one business day; every answer that changes normative text is published as a versioned patch (v0.2.1, v0.2.2, …) in an errata log kept with the spec (decision 130).

**Normative words.** MUST and MUST NOT state absolute requirements. SHOULD states a requirement that may be ignored only for a stated reason. MAY states an option. A program that violates a MUST in §3–§13 is rejected by the compiler. A runtime or backend that violates one is non-conforming.

**Conformance targets.** The compiler (§3–§13, §18), the runtime (§14–§16) and the backend (§17–§18).

**Notation.** Grammar in EBNF (§4). Code samples are Golem, and every code block is a case of the golden corpus: it compiles unless the text above it says it is rejected. Durations are in ticks, 20 per second; `t` is the tick suffix. A *view* is the world state an expression reads (§14). Labels such as Q4, F12, S5, P2 and R9 in §1 name the review item that raised a decision; they are historical and carry no normative content.

**Out of scope.** The orchestrator itself, goal planning (decision 45), several Minecraft versions per project (decision 46), hot reload of a running job (§18.5), Bedrock Edition.

**Changes since v0.1.**

- Decisions 1–36 are inlined in Appendix A; the design log is no longer normative (finding 1).
- The std listings of §17.9 are normative and the drafts are archived (decision 131).
- `Ord` no longer appears to imply `Eq`: set elements and map keys need both, so `Float` and `Angle` cannot be keys (decision 132, §6.1, §6.6).
- `Set(items)` and `Map(entries)` construct collections; `Entry<K, V>` joins the prelude (decision 133, §7.3).
- `Duration / Int` truncates toward zero like `Int /` (decision 134, §7.2).
- A `when … until` run that completes restarts no earlier than the next tick (decision 135, §11.4).
- `atomic_limit` bounds every pin cause: `atomic`, `confirm async` and cursor items (decision 136, §10.7, §15.3).
- Prototype references are replaced by inline examples (§11.4, §11.7); log references are removed (§17.4, §19.3).
- Editorial: the check order of §15.2 step 6, the clause names in §9.2 and §13.5, and the open-question count in §1 (finding 13).

## 1. Decisions 37–137

Decisions 37–53 resolve the design questions Q1, Q2 and Q4–Q18, numbered after decisions 1–36 (Appendix A); rows marked — are revisions needed to stay contradiction-free. Q3 was resolved earlier, by decision 34 (Appendix A), which closes finding 13. Decisions 96–128 come from the syntax review, the parser check and the std review; they freeze the syntax and the std signatures of §17.9. Decisions 129 and 130 settle the design log's status and escalations. Decisions 131–137 are the Phase 1 decisions that make this spec self-contained.

| # | Resolves | Decision | Rationale |
| --- | --- | --- | --- |
| 37 | Q1 | The supervisor assigns whole jobs and may cancel, pause and resume them. It cannot change a running job's parameters or write machine state; machine state is exported read-only through the report stream (§16). | Pause reuses freezing. Tasks are restartable (19), so "change parameters" is cancel + assign. |
| 38 | Q2 | `ItemFilter`, `BlockFilter` and `EntityFilter` are three concrete data types. Every combinator returns the type it combines; mixing kinds is a type error at the combinator. No `dyn` type exists. | Branches unify, runtime-chosen filters are plain values, errors point at the cause. Refines 28. |
| 39 | Q4 | Sync is the default confirmation mode. Defaults: `confirm_timeout = 5s`, `max_pending = 8`, both bot `config` keys. | Reliability first. Std composites opt into `confirm async` internally where throughput matters. |
| 40 | Q5 | Rollback is per strand and exact: a rejected action rewinds its strand to the checkpoint taken when that action was issued, and the failure is raised at that call site. No other strand reads those predictions. | Same meaning as a synchronous failure of that call; no read tracking needed. |
| 41 | Q6 | The runtime attributes every state change to one of the bot's actions or to the outside. An `ensures` that is false because an outside change touched a key it read fails with `Interfered`; otherwise with `ContractViolation`. | Shared-state contracts stay expressible; interference is retryable, defects stay defects. |
| 42 | Q7 | Triggers are `on Event(...)` (discrete), `on enter C` / `on exit C` (edges) and `when C [for D] [until U]` (level, with debounce and hysteresis). Every handler declares `priority`. | Distinct forms for edge and level; explicit priorities make arbitration auditable. |
| 43 | Q8 | No positional literals. `BlockPos(1, 64, -3)` and `Vec3(0.5, 64, 2.5)` are ordinary constructors; numeric literals take their type from context. | Integer-versus-decimal syntax is a silent-bug trap: `(1, 64, 2.0)`. |
| 44 | Q9 | No blackboard. State lives in task locals and activity `var`s; facts for the supervisor leave through `notify`. | Shared mutable state would break exact rollback (40). |
| 45 | Q10 | No planner in v0.1. The IR exports every contract as data so an external planner can use it later. | A planner belongs in the orchestrator (2). |
| 46 | Q11 | One Minecraft version per project, set in `golem.toml`. The runtime refuses servers of any other version. | One registry, one set of compile-time checks. |
| 47 | Q12 | A window handle invalidated while its task is frozen makes the task fail with `WindowClosed` on resume. Freezing a thread that holds `screen` closes its window. Std composites that own a window reopen it explicitly. | No hidden reopen; any reopen is visible in source. |
| 48 | Q13 | The language is **Golem**; source files end in `.golem`; the manifest is `golem.toml`. | A golem is a servant built for one job (2). |
| 49 | Q14 | The bot is ambient: `bot` is the bot and `world` its world view, both read-only. Neither can be passed, bound or stored. | A task can only act through its own connection. |
| 50 | Q15 | Activities are attached at compile time with `use` inside a `bot` declaration; arguments are constant expressions. | Static priorities and resources make arbitration checkable. |
| 51 | Q16 | One declaration shape for everything: `keyword name(params) -> Type`, then clauses, then a body. No arrow functions. | Contract clauses need a slot between signature and body. Supersedes 36. |
| 52 | Q17 | A failed handler run is reported and the handler backs off: default `5s`, doubled per consecutive failure, capped at 32×. Failures never propagate out of a handler. | Stops refire loops (eating without food) without hiding them. |
| 53 | Q18 | The prelude holds core types, implicit failures and core math fns. Every task, std or primitive, is imported explicitly. | Every effect has a visible source (35). |
| 54 | — | Confirmation is per primitive action and decided by the backend; predictions are the deltas the backend reports. A task's `ensures` is evaluated on the view its body ran in. | Refines 17; replaces "a composite's ensures serves as its prediction". |
| 55 | — | On resume, the invariants of every frame are re-checked and durative primitives restart with their `requires` re-checked. Composite `requires` are not re-checked. | Composites legitimately consume their preconditions: crafting uses up its logs. |
| 56 | — | New resource `screen`. Freezing releases every physical hold. `atomic { }` blocks, confirm-async blocks and threads holding cursor items cannot be frozen (§15.3). | A preemptor closing a window while items sit on the cursor would drop them. |
| 57 | — | `wait` is a statement, not a primitive. New primitives: `sprint`, `hold_jump`, `swap_hands`, `throw_cursor`, `select_trade`, `rename`, `edit_sign`, `write_book`, `sign_book`, `dismount`, `steer`. | Closes the std primitive TODOs; waiting needs no backend. |
| 58 | — | `Float`, `Vec3` and `Angle` have no `==`; use `approx(a, b, tol)`. Arithmetic faults raise `Defect`. A `fn` may read the current view. | Turns the floating-point pitfall into a compile error. Refines 26. |
| 59 | — | The call graph over tasks and fns is acyclic: no recursion. | Finite statecharts (1) and guaranteed termination. |
| 60 | — | `uses` and `irreversible` appear only on `extern` tasks. `ongoing` is declared. Every task has an `ensures`, or is `unchecked`, or is `ongoing`. | Inference cannot drift (11); no task silently lacks a contract. |
| 61 | — | `@e[...]` is the only selector form and denotes an `EntityFilter`. Selection is explicit: `world.entities(f)` returns a sorted snapshot, `world.nearest(f)` one live handle. | Settles the cardinality and snapshot-versus-live pitfalls. |
| 62 | — | `Disconnected`, `Kicked` and `Died` cancel all threads without running `defer`s. | Cleanup cannot act on a world the bot has left. |
| 63 | Syntax | Contract clauses are annotations written directly before the task declaration: `@uses`, `@requires`, `@invariant`, `@ensures`, `@maintains`, `@progress`, `@timeout`, `@fails`. Modifiers (`extern`, `ongoing`, `unchecked`, `irreversible`) stay keywords. Supersedes the clause placement of 51. | The contract reads first and signature and body stay together; one rule, `@clause expression`, covers every clause. |
| 64 | Implementation | Compiler, runtime and the first backend are written in TypeScript. The first backend is Mineflayer, in the same Node.js process. Azalea may follow behind the §18.4 interface. | One language and process with Mineflayer, simple web integration; azalea's scaling benefit is not needed yet. |
| 65 | Types | `Int` is limited to \|n\| ≤ 2^53 − 1; leaving that range raises `Defect(Overflow)`. | Exact in JavaScript numbers without BigInt; every value a Minecraft client sees fits. |
| 66 | Syntax | Handler options are annotations written before the trigger: `@priority`, `@backoff`, `@queue`. | Same style as contract clauses (63); the trigger line holds only the condition. |
| 67 | Filters (F1) | The named leaves become static fns of their filter types: `ItemFilter.named(s)`, `EntityFilter.named(s)`. | Overloading by return type contradicted §6.7. |
| 68 | Std (F3) | `bot.can_place(item, pos)` checks vanilla placement rules; `place` requires it, else `CannotPlace`, and re-checks it right before interacting. | An unplaceable item was reported as a defect. |
| 69 | Statements (F4) | New statement `retry n on F1, F2 { block }`. | Bounded, explicit retries; the last failure propagates (18: the caller decides). |
| 70 | Std (F5) | `collect` returns the number of items picked up and never fails on an empty area. | "Nothing in range" is a normal outcome, not a defect. |
| 71 | Std (F6) | `withdraw` and `deposit` take `exact: Bool = false`. | "Keep exactly N" needs the last stack split. |
| 72 | Std (F7) | `world.crafting_recipes_for(f: ItemFilter)` and `CraftingRecipe.fits_grid(w, h)`. | Recipes by tag (any planks); fitting as a fn, not only prose. |
| 73 | Std (F8, F10) | Signatures needing static trait fns use named type parameters; std crafting fails with `NoRecipe` or `MissingIngredients`; new composite `craft_item`. | Grid size was unreachable through `impl Trait`; the single failure was misleading. |
| 74 | Syntax (F11) | No `;` is inserted when the next line starts with `else`, `catch`, `.`, `?.`, `&&`, `\|\|` or `??`. | Long lines become splittable; a trap for human and agent authors disappears. |
| 75 | World model (F12) | `bot.bobber` is the bot's own fishing hook; entity-type members are typed `T?` and `none` for other types, starting with `Entity.biting`. | Fishing needs the bite flag and the bot's own hook. |
| 76 | Contracts (F13) | Clause `@stalls_after D` on ongoing tasks, reset by a `heartbeat` statement in the task's body. | Stall detection for endless loops without hand-written counters. |
| 77 | Types (F14) | `BlockPos` members `center`, `above`, `below` and `offset(f: Face)`. | Removes coordinate arithmetic noise. |
| 78 | Std (F15) | `stash(chest: BlockPos, f: ItemFilter) -> Int` in `golem.core`, failing with `ChestFull`. | The same pattern appeared in two prototypes. |
| 79 | Process (F2, F9) | Kept as is: one level handler per mode; no bare block statement. | Verbose but clear; a small task is a better scope for `defer`, with its own contract. |
| 80 | Std (F16) | `bot.can_harvest(pos)` holds when some inventory item, or the empty hand, meets the block's correct-tool and tier rule from version data. `mine(pos, harvest: Bool = true)` requires it when `harvest` is true, else `WrongTool(pos)`, and equips the fastest tool among those that harvest. | A worn-out pickaxe turned ore into nothing without a failure. Refined: `can_harvest` looks at the inventory, not the held item, because `mine` chooses the tool. |
| 81 | World model (F17) | `world.block_light(p) -> Int?` and `world.sky_light(p) -> Int?`, `none` if unloaded, from chunk and light-update data. | Spawn-proofing becomes checkable. Refined: two keys instead of one `light(pos)`, because sky light depends on the time of day and hostile spawning since 1.18 tests block light alone. |
| 82 | Std (F18) | New member `bot.on_fire: Bool`. Std activity `escape_lava(priority: Int = 95)`: in lava or standing in fire, pathfind to the nearest dry standing spot within 8 blocks. | Lava had no reflex although in-lava was a key. Refined: the trigger is lava or a fire block at the feet, since a burning bot on dry ground gains nothing by moving; `on_fire` is still exported for bots that seek water. |
| 83 | Std (F19, F21) | `smelt` is split into `load_smelter` and `empty_smelter` and composes them around a wait with the window shut, bounded by `r.time × n` plus a margin and cut short when the furnace's `lit` state goes false. `world.burn_time(i: ItemType) -> Duration?` from version data. | The window was held for minutes, blocking every screen reflex. Refined: `lit` alone over-waits, because a furnace stays lit until its current fuel item burns out (80 s for coal). |
| 84 | Std (F20) | `close` on a closed handle completes without acting; `close` is the one window primitive without the implicit `requires w.open`. | Deferred closes no longer report `defer_failed` after a freeze or a server-side close. |
| 85 | Std (F22, F23) | Window member `find(f: ItemFilter) -> Int?` over `player_slots`. Recipe lookups are `*_for(result: ItemFilter)` and `*_from(input: ItemType)` for crafting, processing and stonecutting; `crafting_recipes(i)` is removed. `ProcessingKind` joins the prelude. | Slot numbers differ per window; the lookup direction is in the name. Refined: the naming covers all three recipe kinds, not only processing. |
| 86 | Types (F24) | Static fns `ItemFilter.of(t: ItemType)`, `BlockFilter.of(t: BlockType)`, `BlockFilter.of(s: BlockState)` (exact state) and `BlockFilter.placed(s: BlockState)` (block type plus the properties placement sets). Members `BlockState.block: BlockType` and `BlockType.item: ItemType?`. | Data naming one block is stored once: a builder palette can be a `List<BlockState>`. |
| 87 | Std (F29) | Std `place_state(s: BlockState, pos: BlockPos)` chooses support face, aim point and standing yaw from version placement rules and ensures `world.block(pos) matches BlockFilter.placed(s)`. It supports axis, horizontal and full facing, slab type and stair or trapdoor half; any other placement property fails `UnsupportedState(s)` at the start, and no spot satisfying both aim and yaw fails `CannotPlace(pos)`. | Oriented blocks could not be built. Refined: `ensures` checks only placement-set properties, since stair shape, connections and waterlogging come from neighbours; listing the classes bounds the version-data work. |
| 88 | Events (F25) | Event `entity_hurt(e: Entity, attacker: Entity?)` for tracked entities, from the damage-event packet. Using it in a project for Minecraft below 1.19.4 is a compile error. | A guard can react to attacks on its ward. One version per project (46) makes the version check static. |
| 89 | Activities (F26) | Every std activity takes `priority: Int`, defaulting to its current value, and uses it in `@priority`. | Bots can reorder std reflexes. Options may already use activity parameters (§11.5). |
| 90 | Activities (F27) | Clause `@attaches a(args)` on a task some bot lists in `jobs`. The instance lives from `job_started` until the job's thread ends, also while paused; its arguments may name the job's parameters. Priorities and resource footprints stay static. Refines 50. | Handlers serve the job they belong to, and the ward is named once. |
| 91 | Types (F28, F33) | `Vec3.distance(o: Vec3) -> Float`; `EntityFilter` leaf `near(center: Vec3, d: Float)`; `String` members `len`, `chars: List<String>` and `split(sep: String) -> List<String>`, all by code point. | Distances to points other than the bot; schematics as text. |
| 92 | Std (F30, F32) | New instant primitive `place_block(support: BlockPos, face: Face)`, confirmed by ack and state; `place` calls it instead of `interact`. `can_place` also requires that no other entity intersects the cell, and `place` moves the bot itself out of it: it approaches with `Goal.AllOf([InReach(support), Clear(pos)])`; `AllOf` and `Clear` are new goals. | A refused placement now fails `Rejected`, which is catchable, instead of `ContractViolation`. Refined: `Clear(pos)` replaces `Away(pos.center, 1.0)`, which a bot one block lower satisfies while its head is in the cell; `can_place` leaves out the bot because `place`'s `requires` is checked before the bot moves. |
| 93 | Std (F31) | `pathfind` and `goto` take `opts: PathOpts = PathOpts()` with `avoid: Region? = none` and never dig or place blocks. Paths that dig or scaffold use the new primitive `pathfind_build(goal, limit, opts: BuildOpts)`, whose `uses` are legs, head, hands and inventory. | Builders no longer tunnel through their own walls. Refined: `uses` is static per extern task (60), so a dig flag on `pathfind` would take hands on every walk and block eating while walking. |
| 94 | Protocol (F34, F35) | §6.9 gives a normative JSON form for every wire type and for command replies. `notice` reports carry `thread` plus `job_id`, or `instance` and `handler`. | A supervisor and a runtime cannot disagree on encodings; notices are attributed directly. |
| 95 | Activities (F36) | Trigger `every D` runs a bounded body once per period of `D` wall ticks, starting in the first tick; a period that begins while the previous run is Active or in Backoff is skipped. | Periodic handlers say what they mean instead of `when true until false`. |
| 96 | Syntax review S1 | The ambient bot is `bot`; a method's receiver is `self`; `this` is no longer a keyword. | Python and Rust read `self` as the receiver and TypeScript reads `this`; one name per meaning, and `bot` pairs with `world`. |
| 97 | Syntax review S4 | Const names are SCREAMING\_SNAKE\_CASE `TYPE_IDENT`s; the std filter consts are `FOOD`, `SAFE_FOOD`, `HOSTILE`, `FIGHTABLE` and `CLEARED`. | The convention of Rust, TypeScript and Python, and what every example already wrote. |
| 98 | Syntax review S5 | Signatures are written `name(params) -> T` everywhere, reference tables included; `name: T` is for fields and properties. | One notation. |
| 99 | Syntax review S6 | A method whose only parameter is `self` is a property, never called with `()`; inherent impls may declare associated consts such as `ItemFilter.ANY`. | One spelling per member. |
| 100 | Syntax review S7 | A failure after `else` is always written `else fail F`: in clauses, in `wait until` and in `let`. | One rule for `else`; a bare `else F` read like a default value. |
| 101 | Syntax review S8 | A bare failure or variant name in a pattern matches any fields; parenthesised binders must match the field count. | Catch arms survive a failure gaining a field. |
| 102 | Syntax review S9 | Inside `@e[…]`, whitespace may follow a comma and nowhere else. | Reads like an argument list; `=` stays tight, like a resource literal. |
| 103 | Syntax review S10 | A handler header is one line: trigger, `for`, `until`, `if` and `{`. | One layout per header. |
| 104 | — | `result` is not a keyword: in `ensures` of a task with a non-Unit return type it denotes the returned value, and that task cannot have a parameter named `result`. | Keeps a common name usable; the recipe types' `result` field now parses. |
| 105 | — | `?.` on a member of type `U?` yields `U?`. | `T??` is not a type (§6.1). |
| 106 | — | "Must not complete" applies to ongoing tasks only; a `when … until` body may complete or `return`, and the run restarts. | A completed run already restarts (§11.4); `escape_lava` (§17.8) relies on it. |
| 107 | Parser check P1 | `timeout` is a contextual keyword. | `wait until c timeout D` uses it, but §3.3 listed it nowhere. |
| 108 | Parser check P2 | A statement that starts with `match` is a `MatchStmt`. | Otherwise every statement-level match is ambiguous; same rule as Rust. |
| 109 | Parser check P3 | A `match` expression's arms are expressions (`ExprArm` in the grammar). | The rule was prose only; the grammar accepted block arms. |
| 110 | Parser check P4 | `File = { Import ";" } { Decl ";" }`: imports precede declarations in the grammar itself. | The rule was a comment only; the grammar accepted late imports. |
| 111 | Std review P5 | A line ending in `>` ends its statement when the next line begins with `}`, an annotation or a declaration keyword (§3.6). | Declarations ending in a generic return type ran into the next one; a comparison never continues with these tokens. |
| 112 | Std review R1 | `NoPath(at: BlockPos)`: the bot's feet when no path was found. | `Goal` is not a wire type. |
| 113 | Std review R2 | `OutOfReach(pos)` also serves entities, carrying the block of the entity's feet. | One failure name keeps catch arms whole. |
| 114 | Std review R3 | Member `ItemType.block: BlockType?`; `place_block` fails `NotABlock(slot)` when the held item places no block. | §17.1 required such an item but gave no way to test it. |
| 115 | Std review R4 | `bot.held` and `bot.offhand` are `ItemStack?`. | Their types were missing. |
| 116 | Std review R5 | `edit_sign` requires `world.block(pos) matches #minecraft:all_signs`. | The tag exists from 1.20. |
| 117 | Std review R6 | `Range` has members `start` and `end: Int`. | Hotbar and grid slot arithmetic. |
| 118 | Std review R7 | Built-in members of `Window` and `Inventory` are listed as `extern fn` in bounded impls in `golem.windows`. | Golem notation for built-ins; coherence otherwise puts impls in the declaring module. |
| 119 | Std review R8 | `AnyKind.menu_types()` is the union of every kind's menu types. | §17.4 said "every menu type". |
| 120 | Std review R9 | `Trade(cost, cost2: ItemStack?, result, uses, max_uses: Int, disabled: Bool)`. | The offer fields a bot can act on. |
| 121 | Std review R10 | `w.player_slots` is a `SlotRange`. | Iterated with `for` by bots. |
| 122 | Std review R11 | Leaves `edible()` and `hostile_type()`; `FOOD` and `HOSTILE` are built on them. | Both lists come from version data. |
| 123 | Std review R12 | `Entity.item: ItemStack?` for item entities, `none` otherwise. | `collect` must match drops against its filter. |
| 124 | Std review R13 | `sleep` fails `CannotSleep(bed)` after a 2s wait. | No failure was named. |
| 125 | Std review R14 | Failures `SmeltIncomplete(crafts)` and `CookIncomplete(items)`. | Running out of fuel or missing a drop is not a contract violation. |
| 126 | Std review R15 | `golem.core` declares `extern fn`s `support_face`, `placement_for`, `supported_state`, `best_tool`, `stonecutter_button` and structs `Support`, `Placement`. | Each needs version data the runtime holds. |
| 127 | Std review R16 | `smelt` takes `fuel: ItemFilter = DEFAULT_FUEL` (coal or charcoal). | `load_smelter` needs fuel. |
| 128 | Std review R17 | `empty_smelter` ensures only `result >= 0`. | The output item is unknown when `old` is evaluated. |
| 129 | Review Q1 | The design log is non-normative. Decisions 1–36 bind as amended in §1 until v0.2 inlines them in an appendix; nothing else in the log binds. Completed by 137. | Implementers cannot consult the log, so the spec must be self-contained (review finding 1). |
| 130 | Review Q12 | Paul owns the spec and answers implementer escalations within one business day; answers that change normative text are versioned patches in an errata log. | Agents will hit ambiguities daily; each needs one owner and a known turnaround. |
| 131 | Review Q2 | The module listings of §17.9 are the normative std surface. The draft files `primitives.mcb`, `filters.mcb`, `windows.mcb` and `core.mcb` are archived and non-normative; any difference is settled in favour of §17.9. | The listings were reviewed line by line (111–128); implementers cannot consult the drafts. |
| 132 | Review Q11 (finding 12) | `Ord` does not imply `Eq`. Set elements and map keys MUST implement both (`T: Eq + Ord`), so `Float`, `Angle`, `Vec3` and types containing them are never keys. Where a type implements both, `a == b` holds exactly when neither `a < b` nor `b < a`. | `Float` and `Angle` keep `<` for checks such as aim error, while set and map equality is always defined. |
| 133 | Review Q11 (finding 12) | `Set(items: List<T> = [])` and `Map(entries: List<Entry<K, V>> = [])` construct collections; `Entry<K, V>(key: K, value: V)` is a prelude struct and `Map` has the property `entries`. Duplicate items in `Set(…)` collapse; duplicate keys in `Map(…)` raise `Defect(InvalidArgument)`. Both are allowed in constant expressions. | The grammar had only list literals. Constructors need no new syntax, and a duplicate key in a constant becomes a compile error (§7.5). |
| 134 | Review finding 12 | `Duration / Int` truncates toward zero, like `Int /`. | One division rule for every integer-valued type; JavaScript's `Math.trunc` implements both. |
| 135 | Review Q9 (finding 7a) | A `when … until` run that completes or returns restarts no earlier than the next tick in which its thread is granted, and `until` is evaluated in between. | A body that returned at once, such as `escape_lava` with no dry spot, could spin without bound inside one tick. |
| 136 | Review Q10 (finding 7b) | `atomic_limit` bounds every pin cause: `atomic`, `confirm async` and cursor items. When a pinned thread's freeze has been pending for more than `atomic_limit` ticks, its innermost frame fails with `Timeout(task)` and its cursor pin lapses, so freezing closes its window with vanilla behavior: the cursor items return to the inventory, or drop when it is full (§15.3). | §15.3 promised the bound but only `atomic` enforced it; a job holding cursor items could block `escape_lava`. |
| 137 | Review Q1 (finding 1) | Decisions 1–36 are restated in Appendix A, which is normative; the design log binds in no part. Prototype references are replaced by inline examples. | Implementers cannot consult the log or the prototypes. |

**Superseded or refined decisions.** Decision 17 is refined by 54, 26 by 58, 28 by 38; 27 is superseded by 96 and 36 by 51, and 51's clause placement by 63; 50's constant activity arguments are refined by 90; 129 is completed by 137. The earlier rule that a resumed task re-checks its `requires` and invariants is replaced by 55. Appendix A states each of decisions 1–36 as amended.

## 2. Program model

A project compiles to one IR file per bot; the runtime executes each bot as a set of threads advanced once per tick, 20 times per second.

A bot runs at most one *job* at a time, plus the handlers of the activities it uses. Each running job or handler run is a *thread*. Threads claim physical resources, and the scheduler grants them by priority. Tasks reach Minecraft only through `extern` tasks, which the backend implements.

| Term | Meaning |
| --- | --- |
| Project | A directory with `golem.toml` and `src/`, targeting exactly one Minecraft version. |
| Module | One `.golem` file; `src/a/b.golem` is module `a.b`. |
| Bot | A `bot` declaration: activities in use, accepted jobs, configuration. One connection. |
| Job | A task run as the root of a thread at the bot's job priority. At most one per bot. |
| Activity | A parameterised set of handlers and `var`s, attached to a bot with `use`. |
| Handler | A trigger, a priority and a body. Each run of the body is a thread. |
| Task | Declared with `task`; may span ticks and act on the world. `extern` tasks are primitives; all others are composites. |
| fn | A pure function evaluated within one tick. It may read the current view but never acts. |
| Thread | One execution of a job or handler body: a tree of frames, possibly with concurrent strands. |
| Strand | One sequential flow inside a thread; `with` starts a second strand. |
| Frame | One running task call. |
| Action | One invocation of an extern task as tracked by the backend. |
| View | The world state an evaluation reads: confirmed, or confirmed plus an async scope's predictions. |
| Resource | `legs`, `head`, `hands`, `stance`, `inventory` or `screen`. |
| Failure | A typed reason a task did not complete. |

A complete example bot is in §19.

## 3. Lexical structure

Source is UTF-8 text split into tokens by maximal munch; newlines matter only through semicolon insertion (§3.6).

### 3.1 Whitespace and comments

Space, tab, CR and LF separate tokens. `//` starts a comment to the end of the line. `/* … */` comments nest. A comment counts as whitespace, and a line comment still ends its line.

### 3.2 Identifiers

| Token | Pattern | Used for |
| --- | --- | --- |
| `IDENT` | `[a-z_][A-Za-z0-9_]*`, but not `_` alone | values, fns, tasks, fields, modules, activities |
| `TYPE_IDENT` | `[A-Z][A-Za-z0-9_]*` | types, traits, enum variants, failures, notices, bots, consts |
| `_` | `_` | wildcard in patterns, bindings and catch arms |

The case rule is lexical and MUST be enforced: a declaration of the wrong kind with the wrong case is a compile error. A const name is a `TYPE_IDENT` in SCREAMING\_SNAKE\_CASE (`[A-Z][A-Z0-9_]*`, as in `FIRE` or `SAFE_FOOD`), and a const and a type MUST NOT share a name in one scope (decision 97).

### 3.3 Keywords

Reserved everywhere: `abort activity as async atomic bot break catch confirm const continue defer else enum every extern fail failure false fn for from heartbeat if impl import in irreversible let loop match matches none notice notify old on ongoing pub repeat retry return self struct sync task then trait true try type unchecked until use var wait when while with world`. `result` is not reserved; it has a meaning only inside `ensures` (§9.4, decision 104).

Contextual (reserved only in the grammar positions that use them, otherwise ordinary `IDENT`s): `timeout tolerate increasing decreasing by within enter exit jobs start config reported legs head hands stance inventory screen`.

### 3.4 Literals

| Token | Form | Notes |
| --- | --- | --- |
| `INT` | `0`, `[1-9][0-9_]*`, `0x[0-9A-Fa-f_]+` | Must satisfy \|n\| ≤ 2^53 − 1 (decision 65). |
| `FLOAT` | digits `.` digits, optional `e[+-]digits` | Digits are required on both sides of the dot, so `1..5` lexes as `1` `..` `5`. |
| `STRING` | `"…"` | Escapes `\" \\ \n \t \{ \} \u{hex}`. An unescaped `{expr}` interpolates any `Show` value. |
| `DURATION` | number + `t`, `s`, `min` or `h`, no space | `t` takes an `INT`. Other units take `INT` or `FLOAT`; the value MUST be a whole number of ticks (`0.05s` is valid, `0.01s` is not). |
| `ANGLE` | number + `deg` or `rad`, no space | Stored as radians. |
| `RESOURCE` | `ns:path`, no whitespace | `ns` matches `[a-z0-9_.-]+`, `path` matches `[a-z0-9_./-]+`. Example: `minecraft:stone`. |
| `TAG` | `#` immediately followed by a `RESOURCE` | `#minecraft:logs` |
| `BLOCKSTATE` | `RESOURCE` immediately followed by `[k=v,…]` | Keys and values match `[a-z0-9_]+`. `minecraft:oak_log[axis=y]` |
| `SELECTOR` | `@e`, optionally followed immediately by `[…]` | Argument syntax in §8.5; whitespace may follow a comma inside the brackets, nowhere else (decision 102). |
| `ANNOT` | `@` immediately followed by an identifier other than `e` | Contract clauses and handler options (§4, §9, §11.5). The identifier MUST be a clause name (`uses`, `requires`, `invariant`, `ensures`, `maintains`, `progress`, `timeout`, `fails`, `stalls_after`, `attaches`) or a handler option (`priority`, `backoff`, `queue`). The lexer reads the whole identifier first, so `@e[…]` is a `SELECTOR` and `@ensures` an `ANNOT`. |

`true`, `false` and `none` are keywords. A number followed by whitespace and then a unit word is an `INT` or `FLOAT` followed by an `IDENT`.

**Why resources lex cleanly.** A colon forms a `RESOURCE` only when lowercase-initial text touches it on both sides, and never when the text after the colon is exactly the keyword `impl`. Type annotations put a `TYPE_IDENT` or `impl` after the colon (`x: Int`, `x:Int`, `w:impl Screen`), and named arguments and struct fields use `=`, never `:`. No other construct places lowercase text on both sides of a colon.

### 3.5 Operators and punctuation

`+ - * / % == != < <= > >= && || ! | & ?? ?. ? .. ..= = += -= *= => -> . , ; : ( ) [ ] { }`

There is no `>>` token, so nested type arguments close cleanly. In a type context the parser splits a `>=` token into `>` and `=` (`let xs: List<Int>= …`).

### 3.6 Semicolon insertion

The lexer turns a newline into `;` when all three hold:

1. The last token on the line is an `IDENT`, `TYPE_IDENT`, any literal, one of `break continue return heartbeat none true false bot self world`, or one of `) ] } ?`.
2. The innermost open bracket is `{`, or no bracket is open. Inside `( )` and `[ ]` newlines are plain whitespace.
3. The first token of the next non-blank, non-comment line is not `else`, `catch`, `.`, `?.`, `&&`, `||` or `??` (decision 74).

A `;` is also inserted at end of file under rule 1. So `}` and `else` may sit on separate lines, a call chain may continue on a line starting with `.`, and a line ending in a binary operator or `,` continues. A line ending in `>` also gets a `;` when the next line begins with `}`, an annotation or a declaration keyword (`pub`, `fn`, `task`, `extern`, `const`, `type`, `struct`, `enum`, `trait`, `impl`, `failure`, `notice`, `activity`, `bot`, `ongoing`, `unchecked`, `irreversible`): a comparison never continues with these, while a type's closing `>` often ends a declaration such as `fn trades(self) -> List<Trade>` (decision 111).

## 4. Grammar

The grammar below is complete for v0.2 and parseable with two tokens of lookahead plus the rules in §4.2; it is unchanged from v0.1, since collections are built with ordinary constructor calls (decision 133).

Notation: `{ x }` repeats zero or more times, `[ x ]` is optional, `( )` groups, `|` separates alternatives. Quoted text is a terminal; capitalised names in `CAPS` are tokens from §3. `";"` matches written and inserted semicolons alike.

### 4.1 EBNF

```ebnf
(* ---------- files and modules ---------- *)
File        = { Import ";" } { Decl ";" } ;          (* imports precede declarations: decision 110 *)
Import      = "from" ModPath "import" ImportItem { "," ImportItem }
            | "import" ModPath [ "as" IDENT ] ;
ModPath     = IDENT { "." IDENT } ;
ImportItem  = Name [ "as" Name ] ;
Name        = IDENT | TYPE_IDENT ;
Sep         = "," | ";" ;

(* ---------- declarations ---------- *)
Decl        = [ "pub" ] ( ConstDecl | TypeAlias | StructDecl | EnumDecl | FailureDecl
                        | NoticeDecl | TraitDecl | ImplDecl | FnDecl | ActivityDecl )
            | TaskDecl | BotDecl ;
ConstDecl   = "const" TYPE_IDENT [ ":" Type ] "=" Expr ;      (* SCREAMING_SNAKE_CASE: decision 97 *)
TypeAlias   = "type" TYPE_IDENT [ GenParams ] "=" Type ;
StructDecl  = "struct" TYPE_IDENT [ GenParams ] "(" [ FieldList ] ")" ;
FieldList   = Field { "," Field } [ "," ] ;
Field       = IDENT ":" Type [ "=" Expr ] ;
EnumDecl    = "enum" TYPE_IDENT [ GenParams ] "{" Variant { Sep Variant } [ Sep ] "}" ;
Variant     = TYPE_IDENT [ "(" FieldList ")" ] ;
FailureDecl = "failure" TYPE_IDENT [ "(" FieldList ")" ] ;
NoticeDecl  = "notice"  TYPE_IDENT [ "(" FieldList ")" ] ;

GenParams   = "<" GenParam { "," GenParam } ">" ;
GenParam    = TYPE_IDENT [ ":" Bounds ] [ "=" Type ] ;
Bounds      = TraitRef { "+" TraitRef } ;
TraitRef    = TYPE_IDENT [ TypeArgs ] ;

TraitDecl   = "trait" TYPE_IDENT [ GenParams ] [ ":" Bounds ]
              "{" [ FnDecl { Sep FnDecl } [ Sep ] ] "}" ;
ImplDecl    = "impl" [ GenParams ] [ TraitRef "for" ] Type
              "{" [ ImplItem { Sep ImplItem } [ Sep ] ] "}" ;
ImplItem    = [ "pub" ] ( FnDecl | ConstDecl ) | TaskDecl ;   (* consts only in inherent impls: decision 99 *)

FnDecl      = [ "extern" ] "fn" IDENT [ GenParams ] "(" [ Params ] ")" [ "->" Type ]
              [ "=" Expr | [ ";" ] Block ] ;
Params      = Param { "," Param } [ "," ] ;
Param       = "self" | IDENT ":" Type [ "=" Expr ] ;          (* receiver: decision 96 *)

(* contract clauses are ANNOT tokens placed before the task: decision 63 *)
TaskDecl    = { Clause ";" } [ "pub" ] { TaskMod } "task" IDENT [ GenParams ]
              "(" [ Params ] ")" [ "->" Type ] [ [ ";" ] Block ] ;
TaskMod     = "extern" | "ongoing" | "unchecked" | "irreversible" ;
Clause      = "@uses"      Resource { "," Resource }
            | "@requires"  Expr [ "else" "fail" FailureCtor ]
            | "@invariant" Expr [ "else" "fail" FailureCtor ]
            | "@ensures"   Expr
            | "@maintains" Expr [ "tolerate" Expr ] [ "else" "fail" FailureCtor ]
            | "@progress"  Expr ( "increasing" | "decreasing" ) [ "by" Expr ] "within" Expr
            | "@timeout"   Expr
            | "@fails"     TYPE_IDENT { "," TYPE_IDENT }
            | "@stalls_after" Expr
            | "@attaches"  QualName "(" [ Args ] ")"        (* jobs only: decision 90 *) ;
Resource    = "legs" | "head" | "hands" | "stance" | "inventory" | "screen" ;

ActivityDecl = "activity" IDENT "(" [ Params ] ")"
               "{" [ ActItem { ";" ActItem } [ ";" ] ] "}" ;
ActItem     = "var" IDENT ":" Type "=" Expr | Handler ;
Handler     = { HandlerOpt ";" } Trigger Block ;              (* header on one line: decision 103 *)
Trigger     = "on" "enter" Expr
            | "on" "exit"  Expr
            | "on" IDENT [ "(" [ Binder { "," Binder } ] ")" ] [ "if" Expr ]
            | "when" Expr [ "for" Expr ] [ "until" Expr ]
            | "every" Expr ;                                (* decision 95 *)
HandlerOpt  = "@priority" Expr | "@backoff" Expr | "@queue" Expr ;
Binder      = IDENT | "_" ;

BotDecl     = "bot" TYPE_IDENT "{" [ BotItem { ";" BotItem } [ ";" ] ] "}" ;
BotItem     = "use" QualName "(" [ Args ] ")" [ "as" IDENT ]
            | "jobs" QualName { "," QualName }
            | "start" QualName "(" [ Args ] ")"
            | "config" IDENT "=" Expr ;
QualName    = IDENT { "." IDENT } ;

(* ---------- statements ---------- *)
Block       = "{" [ Stmt { ";" Stmt } [ ";" ] ] "}" ;
Stmt        = LetStmt | VarStmt | AssignStmt | IfStmt | MatchStmt | ForStmt
            | RepeatStmt | WhileStmt | LoopStmt | WaitStmt | AbortStmt | WithStmt
            | DeferStmt | TryStmt | AtomicStmt | ConfirmStmt | FailStmt | NotifyStmt
            | ReturnStmt | RetryStmt | "heartbeat" | "break" | "continue" | Expr ;
LetStmt     = "let" ( IDENT | "_" ) [ ":" Type ] "=" Expr
              [ "else" ( "fail" FailureCtor | Block ) ] ;
VarStmt     = "var" IDENT [ ":" Type ] "=" Expr ;
AssignStmt  = IDENT ( "=" | "+=" | "-=" | "*=" ) Expr ;
IfStmt      = "if" Cond Block { "else" "if" Cond Block } [ "else" Block ] ;
Cond        = Expr | "let" IDENT "=" Expr ;
MatchStmt   = "match" Expr "{" [ Arm { Sep Arm } [ Sep ] ] "}" ;
Arm         = Pattern [ "if" Expr ] "=>" ( Block | Expr ) ;
ForStmt     = "for" ( IDENT | "_" ) "in" Expr Block ;
RepeatStmt  = "repeat" Expr Block ;
WhileStmt   = "while" Expr "decreasing" Expr [ "by" Expr ] Block ;
LoopStmt    = "loop" "every" Expr Block ;
WaitStmt    = "wait" ( "until" Expr "timeout" Expr [ "else" "fail" FailureCtor ] | Expr ) ;
AbortStmt   = "abort" "when" Expr Block ;
WithStmt    = "with" PostfixExpr Block ;               (* must be a task call: §10 *)
DeferStmt   = "defer" PostfixExpr ;                    (* must be a task call: §10 *)
TryStmt     = "try" Block "catch" CatchArms ;
RetryStmt   = "retry" Expr "on" TYPE_IDENT { "," TYPE_IDENT } Block ;
AtomicStmt  = "atomic" Block ;
ConfirmStmt = "confirm" "async" Block ;
FailStmt    = "fail" FailureCtor ;
NotifyStmt  = "notify" TYPE_IDENT [ "(" [ Args ] ")" ] ;
ReturnStmt  = "return" [ Expr ] ;
FailureCtor = TYPE_IDENT [ "(" [ Args ] ")" ] ;
CatchArms   = "{" [ CatchArm { Sep CatchArm } [ Sep ] ] "}" ;
CatchArm    = FailPat { "|" FailPat } "=>" ( Block | Expr ) ;
FailPat     = "_" | TYPE_IDENT [ "(" [ Binder { "," Binder } ] ")" ] ;   (* bare: any fields; binders: one per field, decision 101 *)

(* ---------- patterns ---------- *)
Pattern     = PatAlt { "|" PatAlt } ;
PatAlt      = "_" | "none" | IDENT | LiteralPat
            | [ TYPE_IDENT "." ] TYPE_IDENT [ "(" [ Pattern { "," Pattern } ] ")" ] ;   (* as FailPat: decision 101 *)
LiteralPat  = [ "-" ] INT | STRING | "true" | "false" | RESOURCE | DURATION ;

(* ---------- expressions, lowest precedence first ---------- *)
Expr        = "if" Expr "then" Expr "else" Expr | OrExpr ;
OrExpr      = AndExpr { "||" AndExpr } ;
AndExpr     = CmpExpr { "&&" CmpExpr } ;
CmpExpr     = CoalExpr [ CmpOp CoalExpr ] ;          (* non-associative *)
CmpOp       = "==" | "!=" | "<" | "<=" | ">" | ">=" | "matches" | "in" ;
CoalExpr    = BitOrExpr [ "??" CoalExpr ] ;           (* right-associative *)
BitOrExpr   = BitAndExpr { "|" BitAndExpr } ;
BitAndExpr  = RangeExpr { "&" RangeExpr } ;
RangeExpr   = AddExpr [ ( ".." | "..=" ) AddExpr ] ;
AddExpr     = MulExpr { ( "+" | "-" ) MulExpr } ;
MulExpr     = UnaryExpr { ( "*" | "/" | "%" ) UnaryExpr } ;
UnaryExpr   = ( "-" | "!" ) UnaryExpr | "sync" PostfixExpr | PostfixExpr ;
PostfixExpr = Primary { Postfix } ;
Postfix     = "." Name [ TypeArgs ] | "?." Name [ TypeArgs ]
            | "(" [ Args ] ")" | "[" Expr "]" | "catch" CatchArms ;
Args        = Arg { "," Arg } [ "," ] ;
Arg         = [ IDENT "=" ] Expr ;
Primary     = Literal | IDENT [ TypeArgs ] | TYPE_IDENT [ TypeArgs ]
            | "bot" | "self" | "world" | "none"           (* result is an IDENT: decision 104 *)
            | "old" "(" Expr ")" | "(" Expr ")" | ListLit | MatchExpr ;
MatchExpr   = "match" Expr "{" [ ExprArm { Sep ExprArm } [ Sep ] ] "}" ;
ExprArm     = Pattern [ "if" Expr ] "=>" Expr ;      (* expression arms only: decision 109 *)
ListLit     = "[" [ Expr { "," Expr } [ "," ] ] "]" ;
Literal     = INT | FLOAT | STRING | DURATION | ANGLE | RESOURCE | TAG
            | BLOCKSTATE | SELECTOR | "true" | "false" ;

(* ---------- types ---------- *)
Type        = BaseType [ "?" ] ;
BaseType    = TYPE_IDENT [ TypeArgs ] | "impl" Bounds ;
TypeArgs    = "<" Type { "," Type } ">" ;
```

### 4.2 Disambiguation rules

1. **Type arguments in expressions.** After an `IDENT`, `TYPE_IDENT` or member name, `<` opens `TypeArgs` exactly when the tokens up to the matching `>` parse as `TypeArgs` and that `>` is immediately followed by `(` or `.`. Otherwise `<` is less-than. This is unambiguous because types are capitalised and comparisons are non-associative, so `a < B > (c)` is never a valid comparison. `Set<Int>()` and `Map<ItemType, Int>()` therefore parse as constructor calls.
2. **Blocks after expressions.** No expression form ends in `{` except `match`, which opens its own braces, so `if c {`, `for x in xs {` and `when c {` need no lookahead tricks.
3. **Statement versus expression forms.** At statement start, `if` and `match` parse as `IfStmt` and `MatchStmt`. In expression position, `if` requires `then` and `match` arms are expressions only.
4. **Optional `;` before bodies.** In `FnDecl` and `TaskDecl`, a `;` followed by `{` continues the declaration, so a body may start on its own line. A handler header is one line: its trigger, `for`, `until`, `if` and `{` never start a new line, and a long condition wraps after an operator instead (decision 103). Any other `;` ends the declaration.
5. **Match statements.** A statement that starts with `match` is a `MatchStmt`, never an expression statement holding a `MatchExpr`; without this rule every statement-level match parses two ways (decision 108).
6. **Match arms in expressions.** A `MatchExpr` arm MUST be an `Expr`, not a `Block`.
7. **Impl headers.** After `impl [GenParams]` the parser reads a `Type`. If the next token is `for`, that type is reinterpreted as the `TraitRef` (it MUST be neither optional nor `impl …`) and the implementing type follows.
8. **Edge triggers.** After `on`, the words `enter` and `exit` always start the edge forms; no event may be named `enter` or `exit`.
9. **Annotations.** A run of `Clause` annotations MUST be followed by a `TaskDecl`; a run of handler-option annotations MUST be followed by a trigger. Any other placement, or mixing the two kinds in one run, is a compile error. Clause expressions are resolved in the scope of the task they precede, so they may name its parameters, `self` and type parameters.

## 5. Modules, imports and the prelude

Every name a module uses is declared in it, imported explicitly, or comes from the small prelude in §5.5.

### 5.1 Project layout

```toml
# golem.toml
[project]
name = "woodcutters"
minecraft = "1.21.4"        # exactly one version per project (decision 46)

[dependencies]
shared = { path = "../shared" }
```

Sources live in `src/`. The file `src/farm/wheat.golem` is module `farm.wheat`. A dependency's modules are prefixed with its name: `shared.inventory`. The prefix `golem` is reserved for the standard library. The compiler emits one IR file per `bot` declaration (§18.2).

### 5.2 Imports

- `from M import a, B as C` binds the public names `a` and `B` (as `C`) of module `M`.
- `import M` binds `M`'s last path segment as a module name; `import M as m` binds `m`. Members are then reached as `m.a`.
- Wildcard imports do not exist.
- Imports MUST precede all declarations in a file.
- Importing a non-`pub` name is an error.

### 5.3 Visibility

A top-level declaration is visible only inside its module unless marked `pub`. Inside an `impl`, each fn or task is private to the module unless marked `pub`. Struct fields and enum variants share their type's visibility. `bot` declarations are never imported; the build finds them.

### 5.4 Name resolution

A simple name resolves, first match wins: local bindings of the enclosing body, then parameters, then activity `var`s and parameters (inside an activity), then the module's own declarations, then explicit imports, then the prelude.

- A module declaration and an import with the same name is an error, as are two imports of the same name.
- A module declaration or import may shadow a prelude name.
- Several fns or tasks with one name in one module form an **overload set** (§6.7). Importing the name imports the whole set. Overload sets from different modules never merge; importing the same name from two modules is an error unless one is aliased.
- Module import cycles are allowed. Cycles among `const` initialisers and among calls are errors (§13).

### 5.5 The prelude

The prelude is imported into every module implicitly.

| Group | Names |
| --- | --- |
| Core types | `Unit Bool Int Float String Duration Angle List Set Map Entry Range BlockPos Vec3 Face Hand Region SlotRange ItemType BlockType BlockState EntityType ItemStack Tag ItemFilter BlockFilter EntityFilter Goal PathOpts BuildOpts Ingredient ProcessingKind CraftingRecipe ProcessingRecipe StonecuttingRecipe Entity Window Inventory Bot World` |
| Traits | `Eq Ord Show Wire Add Sub Mul Div Rem Neg Not BitOr BitAnd` |
| Implicit failures | `Unmet Broken Stalled Timeout Rejected Unconfirmed Interfered WindowClosed` |
| Fns | `min max abs clamp floor ceil round sqrt float ticks approx` |

`Entry<K, V>(key: K, value: V)` is the prelude struct `Map` is built from (decision 133).

No task is in the prelude. Primitives live in `golem.prim`, composites in `golem.core`, filters in `golem.filters`, window kinds in `golem.windows`, reflexes in `golem.survival` (§17).

## 6. Type system

Golem is statically and nominally typed; every value is immutable, and the only implicit coercion is wrapping a `T` into `T?`.

### 6.1 Built-in types

| Type | Values | Eq | Ord | Wire |
| --- | --- | --- | --- | --- |
| `Unit` | the single value returned by tasks without `->` | yes | — | yes |
| `Bool` | `true`, `false` | yes | false < true | yes |
| `Int` | integers with \|n\| ≤ 2^53 − 1 | yes | yes | yes |
| `Float` | finite IEEE 754 binary64 | **no** | yes | yes |
| `String` | Unicode text | yes | by code point | yes |
| `Duration` | whole ticks, may be negative | yes | yes | yes |
| `Angle` | radians as `Float` | **no** | yes | yes |
| `BlockPos` | `Int` x, y, z | yes | lexicographic x, y, z | yes |
| `Vec3` | `Float` x, y, z | **no** | — | yes |
| `Face`, `Hand` | enums `Down Up North South West East`; `Main Off` | yes | declaration order | yes |
| `Region` | inclusive box `min`, `max: BlockPos` | yes | — | yes |
| `Range`, `SlotRange` | half-open `Int` ranges with members `start` and `end: Int` (decision 117) | yes | — | yes |
| `ItemType`, `BlockType`, `EntityType` | registry entries | yes | by id string, by code point | yes |
| `BlockState` | block type plus properties | yes | — | yes |
| `ItemStack` | item, count ≥ 1, components | yes | — | yes |
| `Tag<T>` | tag of `ItemType`, `BlockType` or `EntityType` | yes | — | yes |
| `ItemFilter`, `BlockFilter`, `EntityFilter` | filter trees (§8) | — | — | yes |
| `Goal` | pathfinding goals (§17.3) | — | — | **no** |
| `Ingredient`, `CraftingRecipe`, `ProcessingRecipe`, `StonecuttingRecipe` | recipe data (§17.5) | yes | — | yes |
| `Entity` | live handle to a tracked entity | by entity id | — | **no** |
| `Window<K>` | handle to one window opening (§17.4) | by handle | — | **no** |
| `Inventory` | snapshot of the player inventory | yes | — | **no** |
| `Bot`, `World` | types of `bot` and `world` only | — | — | **no** |
| `List<T>` | ordered sequence | if `T: Eq` | — | if `T: Wire` |
| `Set<T: Eq + Ord>` | distinct elements in ascending order | yes | — | if `T: Wire` |
| `Map<K: Eq + Ord, V>` | distinct keys in ascending order | if `V: Eq` | — | if both `Wire` |
| `Entry<K, V>` | one key and value, fields `key` and `value` | if both `Eq` | — | if both `Wire` |
| `T?` | `none` or a `T` | if `T: Eq` | — | if `T: Wire` and `T` is not `Unit` |

`T??` is not a type. Set elements and map keys MUST implement both `Eq` and `Ord` (decision 132): `Ord` fixes the iteration order, so it is deterministic (decision 3), and `Eq` decides when two elements or keys are the same. `Set<Float>`, `Map<Angle, V>` and sets of structs with a `Float` field are therefore compile errors.

### 6.2 Optionals

`none` has type `T?` for the expected `T`. A `T` is accepted where `T?` is expected. Unwrapping uses `let x = e else …`, `if let x = e { }`, `match`, `??` and `?.` (§7.2). Comparing an optional with `none` needs `T: Eq`.

### 6.3 Structs and enums

Structs and enums are nominal value types. Construction is call-like: `BlockPos(1, 64, -3)`, `Opts(radius = 16)`; omitted fields take their declared default, which MUST be a constant expression. Every struct gets a generated `copy(field = value, …)` method. Enum variants are written `Face.Up`; in patterns the qualifier may be omitted when the scrutinee's type is known.

A struct or enum automatically implements `Eq`, `Ord` and `Wire` when all its fields do; each is derived independently, so a struct with a `Float` field gets `Ord` but not `Eq`. `Ord` compares fields in declaration order and variants in declaration order. `Show` is always implemented.

### 6.4 Generics

Fns, tasks, structs, enums, traits and impls may take type parameters with trait bounds (`<T: Ord + Show>`) and defaults (`<K: WindowKind = Chest>`). A generic body is checked once at its definition: on a value of type `T` it may only use what `T`'s bounds provide (decision 24). The compiler monomorphizes every instantiation, so the runtime sees only concrete code.

`impl Trait` in parameter position is shorthand for a fresh anonymous type parameter with that bound. A fn written `fn f(…) = expr` may omit `-> T`; the type is inferred from `expr`. Every other fn and every task without `->` returns `Unit`.

An `impl Trait` parameter has no name, so static trait fns of its type cannot be called. A signature that needs them, such as one calling `K.grid_width()`, uses a named parameter `<K: CraftingStation>` (decision 73).

### 6.5 Traits and impls

Trait members are fns only (decision 26): methods taking `self`, or static fns called on the type, as in `K.menu_types()`. Members may have default bodies. A trait may require supertraits (`trait Smelter: Screen`).

- **Inherent impls** (`impl Window<K> { … }`, optionally generic with bounds) may contain fns and tasks.
- **Trait impls** (`impl Ord for Item { … }`) contain fns only. An inherent impl (one without `for`) may also declare associated consts, used as `ItemFilter.ANY` (decision 99).
- **Coherence.** A trait impl MUST appear in the module that declares the trait or the type. Two impls of one trait whose types can unify are an error.
- **Method lookup.** Inherent methods first, then methods of traits in scope. Two applicable trait methods are an ambiguity error.

### 6.6 Built-in traits

`Eq` backs `==` and `!=`; `Ord` backs `< <= > >=`; `Show` backs string interpolation; `Wire` marks serialisable types (§6.9). The operator traits `Add Sub Mul Div Rem Neg Not BitOr BitAnd` back `+ - * / % -x !x | &`. A user type gets an operator by implementing its trait. Window capability traits are declared in `golem.windows` (§17.4).

**`Eq` and `Ord`** (decision 132). Neither trait is a supertrait of the other: `Float` and `Angle` are ordered but have no `==` (decision 58), and `Region` has `==` but no order. `Ord` is a total order: for any `a` and `b` exactly one of `a < b`, `b < a` or neither holds, and it is transitive. For a type with both, the two MUST agree: `a == b` exactly when neither `a < b` nor `b < a`. Built-in and derived impls agree; a user impl that does not is a defect the compiler cannot detect, and the order of sets and maps over that type is then unspecified. Where both are needed, a bound says so: `<K: Eq + Ord>`.

### 6.7 Overloads

Fns or tasks sharing a name in one module overload each other when their parameter lists differ. A call is resolved by static types only (decision 22):

1. A candidate is *applicable* if the arguments type-check against its parameters, with literals typed against that candidate's parameter types (§6.8).
2. Candidate A is *more specific* than B if every parameter type of A is accepted by the matching parameter of B but not vice versa. A non-generic candidate is more specific than a generic one with the same shape (decision 25).
3. The unique most specific applicable candidate wins. None, or several, is a compile error.

### 6.8 Typing of literals

Literals are typed bidirectionally: the expected type decides. Numeric literals become `Int` or `Float` from context, default `Int` for integer forms and `Float` for decimal forms. This is literal typing, not a value conversion: `let x: Float = 3` is valid, `let y: Float = n` with `n: Int` is not (use `float(n)`).

| Expected type | Accepted literal forms |
| --- | --- |
| `ItemType` / `BlockType` / `EntityType` | `RESOURCE` present in that registry |
| `BlockState` | `BLOCKSTATE`, or `RESOURCE` meaning the default state; properties are validated |
| `Tag<T>` | `TAG` present in `T`'s tag registry |
| `ItemFilter` | item `RESOURCE` or item `TAG` |
| `BlockFilter` | block `RESOURCE`, `BLOCKSTATE` (matches the listed properties only) or block `TAG` |
| `EntityFilter` | entity-type `RESOURCE`, entity-type `TAG`, or `SELECTOR` |

With no expected type, or a type parameter as expected type, a `RESOURCE` takes whichever of `ItemType`, `BlockType`, `EntityType` has it in its registry. If several do (`minecraft:stone` is an item and a block), the literal is ambiguous and MUST be annotated. A `TAG` follows the same rule; a `BLOCKSTATE` is a `BlockState`; a `SELECTOR` is an `EntityFilter`.

Registry and vanilla tag membership are checked against the project's target version at compile time. Tags in a non-`minecraft` namespace are allowed and verified when the bot connects (§18.4).

### 6.9 Wire types

A wire type can cross the supervisor boundary as JSON. It is required for job parameters and results, failure and notice fields, and activity `var`s (so they can be persisted). Handles (`Entity`, `Window`), views (`Inventory`, `Bot`, `World`) and `Goal` are not wire types.

The JSON form of every wire type is normative (decision 94). A value that does not decode to the expected type is refused with `BadArgs`. Fields are always written by name; there is no positional form.

| Type | JSON form | Example |
| --- | --- | --- |
| `Unit` | `null` | `null` |
| `Bool`, `Int`, `Float`, `String` | boolean, number, string | `64`, `2.5` |
| `Duration` | `Int` in ticks | `600` |
| `Angle` | `Float` in radians | `1.5708` |
| `BlockPos` | `[x, y, z]` of `Int` | `[6, -58, 0]` |
| `Vec3` | `[x, y, z]` of `Float` | `[0.5, 64.0, 2.5]` |
| `Region` | object with `min` and `max` | `{"min": [0, 60, 0], "max": [8, 64, 8]}` |
| `Range`, `SlotRange` | `[start, end]`, half-open | `[0, 9]` |
| `ItemType`, `BlockType`, `EntityType` | full id string | `"minecraft:raw_iron"` |
| `Tag<T>` | id string with `#` | `"#minecraft:logs"` |
| `BlockState` | the `BLOCKSTATE` literal text | `"minecraft:oak_stairs[facing=east,half=bottom]"` |
| `ItemStack` | object with `item`, `count`, `components` | `{"item": "minecraft:coal", "count": 12, "components": {}}` |
| filters | §8.4 | `{"item": "minecraft:raw_iron"}` |
| struct, including `Entry` | object by field name | `{"taken": 3, "starved": false}` |
| enum variant without fields | variant name | `"East"` |
| enum variant with fields | `{"Variant": {fields}}` | `{"Hit": {"amount": 2.0}}` |
| `List<T>`, `Set<T>` | array; sets in ascending order, without duplicates | `[1, 2, 3]` |
| `Map<String, V>` | object | `{"oak": 3}` |
| other `Map<K, V>` | array of `[key, value]` pairs, ascending, without duplicate keys | `[[[0, 64, 0], 3]]` |
| `T?` | `null` for `none`, else the form of `T` | `null` |

`Unit?` is not a wire type: its `none` and its value would both be `null`.

A received set or map whose elements or keys repeat or are out of order is refused with `BadArgs`. Command replies are objects: `{"reply": "accepted", "command": "assign", "job_id": "s-1"}` or `{"reply": "refused", "command": "assign", "job_id": "s-2", "reason": "Busy"}`, plus `id` when the command carried one (§16.3).

## 7. Expressions and fns

Expressions are evaluated left to right within one tick, never act on the world, and either produce a value or raise a `Defect`.

### 7.1 Evaluation order and defects

Operands and arguments are evaluated left to right. `&&`, `||`, `??`, `?.` and `if … then … else` short-circuit. An arithmetic fault is not a failure a program can catch; it raises the uncatchable `Defect(kind, at)` (§16.1):

| Fault | Kind |
| --- | --- |
| `Int` overflow in `+ - * -x` | `Overflow` |
| `/` or `%` by zero (`Int` or `Duration`) | `DivisionByZero` |
| `Float` result that is not finite | `NonFinite` |
| `xs[i]` with `i` outside `0..xs.len` | `IndexOutOfRange` |
| negative `repeat` count, `timeout` ≤ `0t`, `loop every` period < `1t`, `by` ≤ 0, `split` with an empty separator, a duplicate key in `Map(…)` | `InvalidArgument` |
| a `while … decreasing` variant violated inside a fn | `VariantViolated` |
| a world query over its size limit (§17.2) | `QueryTooLarge` |

### 7.2 Operators

| Operator | Operand types | Meaning |
| --- | --- | --- |
| `+ - * /` | `Int`, `Float` (same type both sides) | `Int /` truncates toward zero; `%` takes the dividend's sign |
| `+ -` | `Duration ± Duration`, `Angle ± Angle`, `Vec3 ± Vec3`, `BlockPos ± BlockPos` | componentwise |
| `*` `/` | `Duration * Int`, `Int * Duration`, `Duration / Int` (truncates toward zero, decision 134); `Vec3 * Float`, `Vec3 / Float`, `Angle * Float` | scaling |
| `+` | `String + String`, `List<T> + List<T>` | concatenation |
| `== !=` | `T: Eq` | structural equality |
| `< <= > >=` | `T: Ord` | ordering |
| `matches` | `ItemStack`, `ItemType` vs `ItemFilter`; `BlockState` vs `BlockFilter`; `Entity` vs `EntityFilter`; each also as `T?` | filter test; `none` never matches |
| `in` | `T` in `List<T>` or `Set<T>`; key in `Map`; `BlockPos` in `Region`; `Int` in `Range` | membership |
| `??` | `T? ?? T` gives `T`; `T? ?? T?` gives `T?` | default for `none` |
| `?.` | member access on `T?` | `none` short-circuits the rest of the postfix chain; the chain's type becomes optional; an optional member does not nest, so `?.` on a member of type `U?` yields `U?` (decision 105) |
| `.. ..=` | `Int` | half-open and inclusive `Range` |
| `\| & !` | `ItemFilter`, `BlockFilter`, `EntityFilter`, same kind both sides; `!` also on `Bool` | union, intersection, complement |

There are no mixed `Int`/`Float` operations and no implicit numeric conversions. `float(i)`, `floor(f)`, `ceil(f)` and `round(f)` convert explicitly; `ticks(f: Float) -> Duration` rounds up to whole ticks. `Float`, `Vec3` and `Angle` have no `==`; compare with `approx(a, b, tol)` or a tolerance written out, such as `bot.aim_error(p) <= 1deg` (decision 58). `List<T>` has no `==` unless `T: Eq`, so `in` on a list also needs `T: Eq`.

### 7.3 Strings, lists, sets and maps

`"have {n} logs"` interpolates via `Show`. Lists support `len`, `get(i) -> T?`, `xs[i]`, `first`, `last`, `push(x)`, `contains(x)`, `sorted` (for `T: Ord`) and `+`. Every "mutating" method returns a new value; rebind with `var` (`xs = xs.push(x)`). `Set` and `Map` follow the same style with `len`, `insert`, `remove`, `get`, `contains` and `keys`; on a map, `insert(k, v)` replaces the value of an existing key. No method may be named after a keyword.

**Construction** (decision 133). Lists are written as literals, `[a, b, c]`. Sets and maps are built by two prelude constructors:

- `Set(items: List<T> = [])` with `T: Eq + Ord` holds the distinct items in ascending order; duplicates collapse.
- `Map(entries: List<Entry<K, V>> = [])` with `K: Eq + Ord` holds one value per key; two entries with equal keys raise `Defect(InvalidArgument)`. The property `m.entries` returns `List<Entry<K, V>>` in ascending key order, so `Map(m.entries)` rebuilds `m`.

Type arguments come from the expected type when there is one, else from the arguments, so `Set<Int>()` and `Map<ItemType, Int>()` build empty collections and an annotated `let` or `const` needs none. Both constructors are view-independent and may appear in constant expressions, where a duplicate key is a compile error (§7.5).

```golem
const FUEL_ITEMS: Map<ItemType, Int> = Map([Entry(minecraft:coal, 8), Entry(minecraft:charcoal, 8), Entry(minecraft:oak_planks, 1)])
const DEPOTS: Set<BlockPos> = Set([BlockPos(0, 64, 0), BlockPos(8, 64, 0)])

fn fuel_value(t: ItemType) -> Int = FUEL_ITEMS.get(t) ?? 0
```

Rejected (§6.1, decision 132): `Float` has no `Eq`, so it cannot be a set element.

```golem
const SPEEDS: Set<Float> = Set([1.0, 2.5])
```

`String` supports `len`, `chars: List<String>` (one string per code point) and `split(sep: String) -> List<String>`; all count code points, and `split` with an empty `sep` raises `Defect(InvalidArgument)` (decision 91).

### 7.4 Fns

A `fn` is a function with no effects (decision 26 as refined by 58):

- It MUST NOT call a task, assign anything but its own locals, or use `wait`, `abort`, `with`, `defer`, `try`, `atomic`, `confirm`, `fail`, `notify` or `loop every`.
- It MAY read `bot` and `world`. Such a fn is *view-dependent* and is evaluated against the view of its caller. A fn that reads neither, directly or through callees, is *view-independent*.
- It terminates: loops are `for` over finite iterables, `repeat`, or `while … decreasing`, and the call graph is acyclic (decision 59).
- It cannot fail. Partial results are expressed with `T?`.

`extern fn` declares a fn the runtime implements (world queries, geometry). A method whose only parameter is `self` is a *property*: it is always written without parentheses, as in `bot.food`, `w.open` and `xs.len`, and writing `()` after it is a compile error. Type arguments still need parentheses (`w.cast<K>()`), and static and free fns always take them (decision 99). A field and a zero-argument method with the same name on one type is a compile error.

### 7.5 Constant expressions

Constant expressions may use literals, `const`s, operators, struct and enum construction, list literals, the `Set` and `Map` constructors and the members of §7.3, filter combinators and calls to view-independent non-extern fns. They are evaluated by the compiler; a defect during evaluation is a compile error. Constants are required for `const` initialisers, field and parameter defaults, `use` and `start` arguments, `config` values, activity `var` initialisers, handler options and debounce durations.

### 7.6 The ambient values `bot` and `world`

`bot: Bot` is the bot; `world: World` is its view of the world (decision 49). Both always denote the *current view* of the evaluating strand: confirmed in sync mode, predicted inside `confirm async` (§14). They MAY appear only as the receiver of a member access (`bot.food`, `world.block(p)`); they cannot be bound, passed, returned or stored. They are not constant. Their members are listed in §17.2.

## 8. Filters

Filters are immutable data trees of three concrete types, combined with `|`, `&` and `!`; they serialise to JSON and are never closures (decisions 28, 38).

### 8.1 The three filter types

| Type | Tested against | May depend on | Leaves |
| --- | --- | --- | --- |
| `ItemFilter` | `ItemStack` or `ItemType` | the stack only | item, item tag, `ItemFilter.ANY`, `ItemFilter.NOTHING`, `damaged()`, `durability_at_least(n: Int)`, `ItemFilter.named(s: String)`, `has_component(id: String)`, `edible()`, `ItemFilter.of(t: ItemType)` |
| `BlockFilter` | `BlockState` | the state only, never position or world | block, block state, block tag, `BlockFilter.ANY`, `BlockFilter.NOTHING`, `air()`, `liquid()`, `solid()`, `replaceable()`, `breakable()`, `prop(name: String, value: String)`, `BlockFilter.of(t: BlockType)`, `BlockFilter.of(s: BlockState)`, `BlockFilter.placed(s: BlockState)` |
| `EntityFilter` | `Entity` | the entity and the observing bot | entity type, entity-type tag, selector, `EntityFilter.ANY`, `EntityFilter.NOTHING`, `within(d: Float)`, `EntityFilter.named(s: String)`, `is_player()`, `hostile_type()`, `in_region(r: Region)`, `near(center: Vec3, d: Float)`, and the selector-only leaves `box` and `team` (§8.5) |

Leaf fns live in `golem.filters`; `ItemFilter.named(s)` and `EntityFilter.named(s)` are static fns of their filter types, so no leaf is overloaded by return type (decision 67). When an `ItemFilter` is tested against an `ItemType`, the stack-dependent leaves (`damaged`, `durability_at_least`, `ItemFilter.named`, `has_component`) are false.

`ItemFilter.of`, `BlockFilter.of` and `BlockFilter.placed` turn values into filters, so data naming one block is stored once (decision 86). `BlockFilter.of(s)` matches exactly the state `s`. `BlockFilter.placed(s)` matches its block type and only the properties placement sets (axis, facing, half, slab type; §17.7), so it still holds after neighbours change shape, connections or waterlogging. `near(center, d)` holds for entities whose position is within `d` of `center`; unlike `within`, it does not depend on the observing bot (decision 91).

### 8.2 Combinators

`a | b`, `a & b` and `!a` require operands of the same filter type and return that type. Branches therefore unify: `if hungry then SAFE_FOOD else tools` is an `ItemFilter`. Combining an `ItemFilter` with a `BlockFilter` is a type error reported at the operator (decision 38). A literal operand takes the other operand's filter type: `minecraft:oak_log | #minecraft:planks` with an `ItemFilter` expected is an `ItemFilter`.

### 8.3 Semantics

`x matches f` evaluates the tree recursively: leaves test their predicate, `|` is disjunction, `&` conjunction, `!` negation. Evaluation is total and has no effects.

| Leaf | True when |
| --- | --- |
| item, block or entity type | the tested type equals it |
| tag | the type is in the tag, using the server's tag contents at evaluation time |
| block state literal | the block type equals it and every listed property has the listed value |
| `air()` | the block is `air`, `cave_air` or `void_air` |
| `liquid()` | the block is any water or lava state, flowing or source |
| `solid()` | the block's collision shape is a full cube |
| `replaceable()` | vanilla allows placing a block into it |
| `breakable()` | not `air()`, not `liquid()`, and hardness ≥ 0 |
| `within(d)` | the entity's position is at most `d` blocks from the observer's position |
| `in_region(r)` | the block containing the entity's feet is in `r` |

An `EntityFilter` is evaluated relative to the observing bot at the moment of evaluation. The runtime MUST NOT cache an `EntityFilter` result across ticks (decision 29). Item and block filter results MAY be cached, since they depend only on their argument and the tag contents.

### 8.4 Wire form

A filter serialises as a JSON tree: `{"any":[…]}` for `|`, `{"all":[…]}` for `&`, `{"not":…}`, and one object per leaf, such as `{"item":"minecraft:oak_log"}`, `{"tag":"minecraft:logs"}` or `{"within":16.0}`. A supervisor can therefore send filters as job arguments. The runtime validates registry ids in a received filter and refuses the job with `BadArgs` if one is unknown (§16.3).

The selector box serialises as `{"box": {"x": …, "y": …, "z": …, "dx": …, "dy": …, "dz": …}}` and `team=` as `{"team": "name"}`. A selector serialises as `{"all": […]}` of its argument leaves.

`ItemFilter.of(t)` and `BlockFilter.of(t)` serialise as the literal leaf for `t`, and `BlockFilter.of(s)` as the leaf of its `BLOCKSTATE` literal. The new leaves serialise as `{"placed": "minecraft:oak_stairs[facing=east,half=bottom]"}` and `{"near": {"center": [0.5, 64.0, 0.5], "d": 8.0}}`; all other values use the forms of §6.9.

### 8.5 Selectors

`@e[...]` is the only selector head; it denotes an `EntityFilter` and never selects by itself (decision 61). Whitespace may follow a comma inside the brackets, and nowhere else (decision 102). Arguments are separated by `,` and combine with `&`:

| Argument | Value | Meaning |
| --- | --- | --- |
| `type=` | `[!]RESOURCE` or `[!]TAG` | entity type or tag; `!` negates; may repeat only when negated |
| `distance=` | number, or range `a..b`, `..b`, `a..` of numbers | `within(b)`, combined with `!within(a)` for a lower bound (strict) |
| `name=` | `[!]"string"` | custom name or player name |
| `x= y= z= dx= dy= dz=` | numbers | the leaf `box`, matching vanilla; all six MUST be given together |
| `team=` | `[!]name` | the leaf `team`: scoreboard team as known to the client |

A `distance=` value that is a single number `n` means `within(n)`, not vanilla's exact distance.

Vanilla arguments the client cannot observe (`tag`, `scores`, `nbt`, `advancements`, `level`, `gamemode`) and selection arguments (`limit`, `sort`) are compile errors. Selection is explicit: `world.entities(f)` returns a snapshot list sorted by distance, then entity id, and `world.nearest(f)` returns one live handle or `none` (§17.2).

### 8.6 Standard filters

`golem.filters` exports these constants, built from the target version's registries:

- `FOOD`: `edible()`, every item with a food component (decision 122).
- `SAFE_FOOD`: `FOOD` minus `rotten_flesh`, `spider_eye`, `poisonous_potato`, `pufferfish`, `chicken` (raw), `suspicious_stew`, `chorus_fruit`, `golden_apple` and `enchanted_golden_apple`. Automatic eating never harms the bot or burns valuables.
- `HOSTILE`: `hostile_type()`, the target version's list of hostile mob types; vanilla has no such tag (decision 122).
- `FIGHTABLE`: `HOSTILE` minus `creeper` and `enderman`. Creepers call for fleeing, and endermen must not be provoked.
- `CLEARED`: `air() | liquid()`, what a dug block may leave behind.

## 9. Tasks and contracts

Every task is either `extern` (a backend primitive) or a composite with a body, and every call of it ends in exactly one of: a result, a typed failure, or cancellation.

Contract clauses are written as annotations directly before the declaration they belong to (decision 63), one per line, as in `@requires target > 0`. This section names each clause without its `@`.

### 9.1 Kinds and modifiers

| Modifier | Meaning | Allowed with |
| --- | --- | --- |
| `extern` | Implemented by the backend; has no body. | all others |
| `ongoing` | Never completes; runs until cancelled or failed. No `->` type, no `return`. | `extern` |
| `unchecked` | Has no meaningful postcondition; MUST NOT declare `ensures` (decision 9). | `extern`, `irreversible` |
| `irreversible` | Effects cannot be undone by re-running; a confirmation barrier (§14.4). | `extern` only; may also be `unchecked` |

A composite is `irreversible` if it may call an irreversible extern task; this is inferred and exported, never written (decision 60). A composite's body is required; an extern task's body is forbidden.

### 9.2 Which clauses a task may have

| Clause | Non-ongoing extern | Non-ongoing composite | Ongoing (extern or composite) | Repeatable |
| --- | --- | --- | --- | --- |
| `uses` | optional | forbidden (inferred) | extern only | no |
| `requires` | yes | yes | yes | yes |
| `invariant` | yes | yes | yes | yes |
| `ensures` | required unless `unchecked` | required unless `unchecked` | forbidden | yes |
| `maintains` | forbidden | forbidden | yes | yes |
| `progress` | allowed | allowed | forbidden | no |
| `timeout` | allowed | allowed | forbidden | no |
| `fails` | allowed | allowed | allowed | no |
| `stalls_after` | forbidden | forbidden | composite only | no |
| `attaches` | forbidden | jobs only (§11.7) | composite jobs only (§11.7) | yes |

A non-ongoing extern task MUST declare `timeout` or `progress`. A non-ongoing composite MUST declare one of them or be structurally bounded (§13.4). Repeated clauses are evaluated in source order.

### 9.3 Clause semantics

All clause expressions are pure expressions over the parameters, `self`, `bot`, `world` and, where noted, `old(…)` and `result`. They are evaluated on the view of the strand running the frame (§14.2).

| Clause | Evaluated | On false |
| --- | --- | --- |
| `requires E [else fail F]` | once at frame start, after arguments are bound; again when a durative extern frame restarts (§15.4) | fail with `F`, or `Unmet(task, clause)` |
| `invariant E [else fail F]` | in the check phase of every tick after the start tick while the frame is active; again on resume | fail with `F`, or `Broken(task, clause)` |
| `maintains E [tolerate D] [else fail F]` | same as `invariant` | count consecutive false ticks; fail with `F`, or `Broken(task, clause)`, when the count exceeds `D` (default `0t`) |
| `progress M increasing\|decreasing [by m] within W` | `W` and `m` once at start; `M` in every check phase | fail with `Stalled(task)` when `M` has not improved by at least `m` on its best value for `W` active ticks |
| `timeout D` | `D` once at start; MUST be ≥ `1t` | fail with `Timeout(task)` when the frame's active elapsed ticks reach `D` |
| `ensures E` | once, at completion (§9.6, §9.7) | fail with `Interfered` or `ContractViolation` (§9.8) |

`task` and `clause` in implicit failures are strings: the task's qualified name and the clause's source text. `M` in `progress` MUST be `Int`, `Float` or `Duration`; `by` defaults to `1` and `1t` and is required for `Float`. A frame's *active elapsed ticks* count ticks in which its thread was granted, excluding the start tick, so `timeout 1t` lets a frame complete in the tick after it starts.

**`stalls_after D`** is allowed only on ongoing composites (decision 76). `D` is evaluated once at start and MUST be ≥ `1t`. Each `heartbeat` statement executed in the task's own body resets the count; when `D` active ticks pass without one, the frame fails with `Stalled(task)` in the check phase. `heartbeat` is a compile error anywhere else, including in callees of such a task.

**`attaches a(args)`** is allowed only on tasks that some bot lists in `jobs`; it attaches an activity instance for as long as the task runs as a job (§11.7, decision 90).

### 9.4 `old` and `result`

`old(e)` MAY appear in `ensures`, `invariant` and `maintains`. All `old` expressions of a frame are evaluated once, right after its `requires` pass, in source order, on the same view; a durative extern frame re-snapshots them on restart. `old` does not nest. `result` is not a keyword (decision 104). In an `ensures` clause of a task with a non-Unit return type, the bare name `result` denotes the returned value and has the task's return type; such a task MUST NOT have a parameter named `result`. Everywhere else `result` is an ordinary name.

### 9.5 The `fails` clause

`fails` MUST list exactly the user-declared failure types the task raises directly: through `fail`, `let … else fail` and `wait until … else fail` statements in its body, or, for an extern task, from the backend. Listing a type that is not raised directly, or raising one that is not listed, is a compile error. Failures named in `requires`, `invariant` and `maintains` clauses and failures propagated from callees are not listed; the compiler infers the full set (§13.5). A backend that reports a failure an extern task does not list causes `ContractViolation` (§17.1).

### 9.6 Extern tasks

Every extern task except `respawn` has an implicit first clause `requires !bot.dead`, failing with `Unmet(task, "alive")`. The backend implements each extern task as one of three classes, fixed per primitive in §17.1:

- **Instant**: sends its packets in the tick it starts, then awaits a verdict.
- **Durative**: acts over several ticks (walking, digging, turning), then awaits a verdict.
- **Ongoing**: holds an input (sneak, use key) until cancelled. Never completes.

The backend reports each action as `Running`, `Issued` (all packets sent), `Confirmed`, `Rejected(detail)` or `Failed(f)`. A non-ongoing extern frame resolves in the completion check of the check phase (§15.2):

| Report | Sync mode | Inside `confirm async` |
| --- | --- | --- |
| `Running` | keep waiting | keep waiting |
| `Issued` | keep waiting; fail with `Unconfirmed(task)` once `confirm_timeout` wall ticks pass without a verdict | complete; evaluate `ensures` on the predicted view (§14.3) |
| `Confirmed` | evaluate `ensures` on the confirmed view; complete if true | as `Issued` if not yet completed |
| `Rejected(d)` | fail with `Rejected(task, d)` | rollback (§14.4) |
| `Failed(f)` | fail with `f` | fail with `f` |

The completion check runs before the invariant checks of the same tick. This is what lets `dig` succeed in the tick its "block unchanged" invariant turns false.

### 9.7 Composite tasks

A composite frame completes when its body reaches its end or a `return`. Its `ensures` clauses are then evaluated in order on the strand's current view. Because every `confirm async` block ends with a barrier (§14.3), that view is the confirmed view unless the call itself sits inside an async scope (decision 54). A composite's `requires` is checked only at its start and never again (decision 55): bodies legitimately consume their own preconditions.

### 9.8 Interference versus contract violation

When an `ensures` is false, the runtime re-evaluates it with read tracking, recording every world key it reads (§14.1). If an outside change (§14.5) touched one of those keys at or after the frame's start tick, the frame fails with `Interfered(task, key)`, which callers may catch and retry. Otherwise it fails with `ContractViolation(task, clause)`: a defect in the task or the backend that cannot be caught (decision 41).

### 9.9 Calls

A task call MUST be the whole expression of an expression statement, or the whole right-hand side of `let`, `var`, an assignment or `return`, optionally followed by a `catch` postfix; it may also be the operand of `with` or `defer`. Task calls never appear inside larger expressions or in clauses, so every suspension point is a statement boundary (decision 1).

Arguments are evaluated left to right on the caller's view before the frame starts. Named arguments and parameter defaults work as for fns. A task in an `impl` taking `self` is called as a method: `w.withdraw(f, 3)`. An ongoing task may be called only as the operand of `with`, as the last statement of an ongoing task's body, as the last statement of a `when … until` handler body (§11.4), or as a job (§12).

Tasks MUST be restartable (decision 19): running a task again after it failed or was cancelled must be safe. The compiler cannot check this; std tasks guarantee it.

### 9.10 Examples

```golem
pub failure OutOfReach(pos: BlockPos)
pub failure NotBreakable(pos: BlockPos)
pub failure BlockChanged(pos: BlockPos)

// golem.prim, durative
@uses hands, head
@requires world.block(pos) matches breakable() else fail NotBreakable(pos)
@requires bot.in_reach(pos) else fail OutOfReach(pos)
@invariant world.block(pos) == old(world.block(pos)) else fail BlockChanged(pos)
@ensures world.block(pos) matches CLEARED
@timeout bot.dig_time(pos) + 2s
pub extern task dig(pos: BlockPos)

// golem.core, composite
@requires world.block(pos) matches replaceable() else fail NotReplaceable(pos)
@requires bot.inventory.count(item) > 0 else fail Missing(item, 1)
@requires bot.can_place(item, pos) else fail CannotPlace(pos)
@ensures !(world.block(pos) matches replaceable())
@fails NoSupport, CannotPlace
pub task place(item: ItemFilter, pos: BlockPos) {
    let s = support_face(pos) else fail NoSupport(pos)
    equip(item)
    let spot = Goal.AllOf([Goal.InReach(s.pos), Goal.Clear(pos)])   // decision 92
    if !spot.reached {
        goto(spot)
    }
    if !bot.can_place(item, pos) {       // the world may have changed on the way
        fail CannotPlace(pos)
    }
    place_block(s.pos, s.face)            // a refusal fails Rejected, never ContractViolation
}
```

`place` is structurally bounded because every callee is bounded, and its `uses` set is inferred as `legs, head, hands, inventory, screen` (§13.3). `support_face`, `Missing`, `NoSupport` and `CannotPlace` are declared in `golem.core` (§17.9).

## 10. Statements

A strand executes statements in order within a tick until it reaches a *suspension point*: an extern call awaiting its verdict, `wait`, an unmet `wait until`, the `max_pending` limit, an async barrier (§14.3), or the end of a `when … until` run that is about to restart (§11.4).

### 10.1 Bindings and assignment

- `let x = e` binds immutably; `var x = e` binds a mutable local. `x = e`, `x += e`, `x -= e`, `x *= e` assign to a `var` local or, inside a handler body, an activity `var` (§11.2).
- `let x = e else fail F` and `let x = e else { … }` require `e: T?` and bind `x: T`. The `else` block MUST diverge: end in `fail`, `return`, `break` or `continue`.
- `let _ = e` evaluates and discards. An expression statement whose type is not `Unit` is a compile error unless it is a task call.

### 10.2 Control flow

| Statement | Semantics |
| --- | --- |
| `if c { } else if … else { }` | `c: Bool`, or `let x = e` with `e: T?` binding `x` in the first block. |
| `match e { p => … }` | Arms tried in order; guards with `if`. MUST be exhaustive. |
| `for x in e { }` | `e` is a `List`, `Set`, `Range` or `Map` (yields keys), evaluated once; its length bounds the loop. |
| `repeat n { }` | `n: Int` evaluated once; `n < 0` raises `Defect(InvalidArgument)`. |
| `while c decreasing v [by m] { }` | `v: Int`, `m: Int` (default 1). Before each iteration in which `c` is true, `v` MUST be ≥ 0 and, from the second iteration on, at most the previous `v` minus `m`. Violation fails with `Stalled(task)` in a task, `Defect(VariantViolated)` in a fn. |
| `loop every D { }` | Only in ongoing task bodies and `when … until` handler bodies. Runs the body, then starts the next iteration `D` active ticks after the previous one started, or in the next tick if the body took longer. `D` ≥ `1t`. |
| `break`, `continue` | Innermost `for`, `repeat`, `while` or `loop every` of the same body. |
| `return [e]` | Ends the task, fn or handler run. Forbidden in ongoing tasks. |

### 10.3 Waiting

- `wait D` suspends for `D` active ticks; `D` < `1t` raises `Defect(InvalidArgument)`.
- `wait until c timeout D [else fail F]` evaluates `c` immediately and then in the check phase of every tick. It continues once `c` is true, or fails with `F` (or `Timeout(task)`) after `D` active ticks.

### 10.4 Cancellation scopes

- **`abort when c { B }`** evaluates `c` on entry and in the check phase of every tick while `B` runs. When `c` is true, `B` is cancelled (§10.6) and execution continues after the statement. If `B` completes or fails first, the statement completes or fails with it.
- **`with t(args) { B }`** requires `t` to be ongoing. It starts `t` as a child strand of the same thread, then runs `B`. When `B` ends for any reason, the child strand is cancelled. If the child fails first, `B` is cancelled and the child's failure is raised at the `with` statement. The inferred `uses` of `t` and of `B` MUST be disjoint (§13.3).
- **`defer t(args)`** evaluates the arguments now and registers the call to run when the enclosing block exits for any reason except an infrastructure failure (decision 62). Deferred calls run last-in first-out, in sync mode, and MUST be non-ongoing tasks.

### 10.5 Failures

- `fail F(args)` raises a user-declared failure; `F` must be listed in `fails` (§9.5).
- `try { B } catch { arms }` runs `B`. If a catchable failure unwinds out of `B`, the first arm whose pattern matches runs in place of the rest of `B`. If none matches, the failure keeps unwinding.
- `t(args) catch { arms }` is the expression form for one call. Its value is the call's result, or the arm's value. Each arm is an expression of the call's type or a block that diverges or, for `Unit` calls, any block.
- Arm patterns: `Name` matches by type whatever its fields, and `Name(binders)` also binds them positionally, with exactly one binder per field (decision 101); `A | B` matches either; `_` matches every catchable failure.

`retry n on F1, F2 { B }` runs `B` up to `n` times (decision 69). `n: Int` is evaluated once and MUST be ≥ 1, else `Defect(InvalidArgument)`. When `B` fails with one of the listed failure types and attempts remain, `B` unwinds, running its defers, and starts again from its first statement. Any other failure, or a listed one on the last attempt, keeps unwinding. The list MUST name catchable failure types; `_` is not allowed, so every retried failure is visible in source.

```golem
retry 2 on WindowClosed, Interfered {
    stash(chest, minecraft:wheat)
}
```

**Catchable:** user-declared failures and `Unmet Broken Stalled Timeout Rejected Unconfirmed Interfered WindowClosed`. **Uncatchable:** `ContractViolation` and `Defect` (they unwind the whole thread, running defers) and `Disconnected`, `Kicked`, `Died` (they end every thread without defers).

### 10.6 Unwinding

Failure and cancellation both *unwind* to a target: a `try`, a catch postfix, a retry, an `abort when` or `with` statement, or the thread root. Unwinding is deterministic:

1. Frames and blocks between the current point and the target are exited innermost first. Each exiting block runs its pending deferred calls, last-in first-out; each runs as a normal frame, with contracts, and may take several ticks.
2. Child strands started by `with` statements being exited are unwound first, completely, before their parent continues unwinding.
3. A deferred call that fails while unwinding a failure or cancellation is reported (`defer_failed`, §16.2) and the remaining defers still run. A deferred call that fails during a normal block exit turns that exit into unwinding with its failure.
4. Frames outside the target keep their checks during unwinding. If one of them fails, the target moves outward to that frame and its failure replaces the old one. Defers already run are not run again.

### 10.7 `atomic` blocks

`atomic { B }` pins its thread: the scheduler cannot freeze it while `B` runs (§15.3). `B` MUST be structurally bounded and MUST NOT contain `with`, `loop every` or ongoing calls, directly or in callees. The pin is bounded by `atomic_limit` like every other pin (§15.3, decision 136): when a freeze has been pending for longer, the thread's innermost frame fails with `Timeout(task)`.

### 10.8 Confirmation scopes

`confirm async { B }` runs `B` on predicted state (§14.3). Every statement in `B`, and every task it calls transitively, MUST be *async-safe*:

- Extern calls only to instant primitives (§17.1).
- No `with`, `defer`, `try`, retry, catch postfix, `abort when`, `wait`, `wait until`, `loop every`, `atomic`, nested `confirm async`, `notify`, ongoing calls, or assignment to activity `var`s.

`sync t(args)` is allowed only inside `B`, on a task call: it waits for all pending confirmations of the strand, then runs `t` in sync mode. A call to an irreversible task behaves as if written with `sync`.

### 10.9 Notices

`notify N(args)` sends notice `N`, declared with `notice`, to the supervisor stream immediately (§16.2). Its fields MUST be wire types. It does not suspend.

## 11. Activities and handlers

An activity is a parameterised set of handlers and state attached to a bot at compile time; each handler run is an ordinary thread with a fixed priority (decisions 34, 42, 50).

### 11.1 Declaration

```golem
from golem.core import consume
from golem.filters import SAFE_FOOD

pub activity auto_eat(min_food: Int = 14, full: Int = 18, priority: Int = 50) {
    @priority priority
    when bot.food < min_food for 2s until bot.food >= full {
        consume(SAFE_FOOD)
    }
}
```

Parameters are bound to constant arguments by `use` (§12). They are constants inside the activity and may appear in handler options.

### 11.2 Activity state

`var name: T = e` declares state owned by one activity instance. `T` MUST be a wire type and `e` a constant expression. Handler bodies and trigger expressions of the same activity may read it; only handler bodies may assign it, and never inside `confirm async`. Writes are visible to later reads in the same tick. Values persist across reconnects (§18.5). There is no other shared state: jobs cannot see activity state, and activities cannot see each other's (decision 44).

### 11.3 Triggers

Trigger expressions are view-dependent `Bool` expressions evaluated on the confirmed view in the trigger phase of each tick (§15.2), so predictions never cause handlers to fire (decision 21).

| Trigger | Fires |
| --- | --- |
| `on e(x, _) [if g]` | Once for each occurrence of event `e` from the catalog (§17.6), with fields bound positionally, when `g` holds. |
| `on enter c` | In each tick where `c` is true and was false at the previous evaluation. The previous value starts as `false`, so it fires in the first tick if `c` holds then. |
| `on exit c` | In each tick where `c` is false and was true at the previous evaluation. The previous value starts as `false`, so it never fires in the first tick. |
| `when c [for D] [until u]` | Level trigger with debounce `D` (default `1t`) and hysteresis `u`; see §11.4. `D` is a constant expression that MAY use the activity's parameters and MUST be ≥ `1t`. |
| `every D` | Once per period of `D` wall ticks, starting in the first tick; see §11.4. |

Event names live in their own namespace, so `on chat(…)` does not clash with the `chat` task. The binder count MUST equal the event's field count.

### 11.4 Handler state machine

Each handler is *Idle*, *Active* or *Backoff*.

- **Idle → Active.** For `on` triggers, when the trigger fires. For `when`, when `c` has been true for `D` consecutive wall ticks; the count resets to 0 whenever `c` is false or the handler leaves Idle. Becoming Active starts a new thread running the body.
- **Active, run completes.** Without `until`, the handler returns to Idle and the thread ends. With `until`, the thread stays and its strand suspends at a *restart point*; the next run of the body starts in the step phase of the next tick in which the thread is granted, never in the tick the previous run ended (decision 135). While suspended there, the thread keeps its rank and footprint, and if `u` holds in a trigger phase before the restart, the handler returns to Idle and the thread ends. A `when … until` handler therefore starts at most one run per tick.
- **Active, `until` holds.** In the trigger phase of any tick, `u` true cancels the run (it unwinds, running defers) and the handler returns to Idle when the unwind finishes.
- **Active, run fails.** The failure is reported (`handler_failed`) and never propagates (decision 52). The handler enters Backoff for `b × 2^(k−1)` wall ticks, capped at `32 × b`, where `b` is the `backoff` option (default `5s`) and `k` counts consecutive failed runs; a successful run resets `k` to 0. After Backoff it returns to Idle.
- **Defects.** A run ending in `ContractViolation` or `Defect` disables the handler for the rest of the session; this is reported.

The restart rule is what bounds `escape_lava` (§17.8) when no dry spot exists: its body returns at once, and the next attempt to find one comes a tick later, after the world has been ingested again.

**`every D`** (decision 95). `D` is a constant expression that MAY use the activity's parameters and MUST be ≥ `1t`. The handler goes from Idle to Active in the first tick and then whenever `D` wall ticks have passed since its previous run started. A period that begins while the handler is Active or in Backoff is skipped, never queued, so runs neither overlap nor pile up; `@queue` is a compile error on it. The body MUST be structurally bounded (§13.4), so `loop every` and ongoing calls are compile errors: nothing would end them. A status beacon:

```golem
pub notice Status(feet: BlockPos, health: Float, food: Int)

pub activity beacon(period: Duration = 30s, priority: Int = 0) {
    @priority priority
    every period {
        notify Status(bot.feet, bot.health, bot.food)
    }
}
```

A `when … until` body may be ongoing: it may end in an ongoing call or use `loop every`, because `until` ends it. Every other handler body MUST be structurally bounded (§13.4).

### 11.5 Options

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `@priority P` | `Int` | required | Scheduling priority of the handler's threads. |
| `@backoff B` | `Duration` | `5s` | Base backoff after a failed run. |
| `@queue N` | `Int` ≥ 0 | `0` | For `on` triggers: occurrences kept while the handler is not Idle, oldest first. Occurrences beyond `N`, or arriving during Backoff, are dropped and reported (`event_dropped`). |

Options are constant expressions; they may use the activity's parameters. `queue` is a compile error on `when` handlers.

### 11.6 Ordering

Handlers are evaluated in a fixed order: activities in the order of their `use` lines, then handlers in declaration order. New threads created in one tick receive ascending thread ids in that order, which breaks priority ties deterministically (§15.3). A handler's index in its activity's declaration order is its identity in reports, snapshots and persistence.

### 11.7 Activities attached to jobs

`@attaches a(args)` before a task attaches an instance of activity `a` for as long as that task runs as a job (decision 90). The task MUST appear in the `jobs` of some bot; elsewhere the clause is a compile error. Arguments are constant expressions that MAY also name the task's parameters, so they are fixed when the job is assigned and never change while it runs.

- **Lifetime.** The instance is created in the tick `job_started` is emitted and destroyed when the job's thread ends, after its unwind. Destroying it cancels its running handler threads, which unwind and run their defers. `pause` does not affect it: a paused patrol job still guards its ward.
- **State.** Its `var`s start from their initialisers for every job and are not persisted (§18.5).
- **Static parts.** Priorities, footprints and handlers come from the activity's declaration, so arbitration (§15) stays checkable at compile time. The instance is named `job.activity`, for example `patrol.guard`, and appears in `hello` and in reports like any other instance.
- **One at a time.** Instances attached to different jobs never coexist, because a bot runs at most one job.

A bodyguard that patrols and protects a named player; a reassigned `patrol` guards the new ward without any change to the bot:

```golem
from golem.core import goto, fight
from golem.filters import FIGHTABLE, is_player, near
from golem.survival import auto_eat

fn ward_threat(ward: String, r: Float) -> Entity? {
    let w = world.nearest(EntityFilter.named(ward) & is_player()) else { return none }
    return world.nearest(FIGHTABLE & near(w.pos, r))
}

pub activity guard(ward: String, radius: Float = 8.0, priority: Int = 60) {
    @priority priority
    when ward_threat(ward, radius) != none for 5t until ward_threat(ward, radius + 4.0) == none {
        let t = ward_threat(ward, radius + 4.0) else { return }
        fight(t)
    }
}

@attaches guard(ward = ward)
pub ongoing task patrol(ward: String, points: List<BlockPos>) {
    loop every 1s {
        for p in points {
            goto(p) catch { _ => {} }
        }
    }
}

bot Bodyguard {
    use auto_eat()
    jobs patrol
    config job_priority = 10
}
```

## 12. Bots and configuration

A `bot` declaration fixes, at compile time, the activities a bot uses, the jobs a supervisor may assign it, an optional start job and its runtime settings; there is no blackboard (decision 44).

```golem
from golem.survival import auto_eat, defend, stay_afloat, auto_respawn
from woodcutting import chop_trees, stash_logs

bot Lumberjack {
    use auto_eat(min_food = 14)
    use defend(radius = 6.0)
    use stay_afloat()
    use auto_respawn()
    jobs chop_trees, stash_logs
    start chop_trees(area = Region(BlockPos(0, 60, 0), BlockPos(47, 79, 47)), target = 64)
    config job_priority = 10
    config confirm_timeout = 5s
}
```

### 12.1 Items

- **`use a(args) [as name]`** attaches an instance of activity `a`. Arguments are constant expressions; an activity whose arguments come from a job is attached with `@attaches` instead (§11.7). The instance name defaults to the activity's name and MUST be unique within the bot; it keys persistence and reports.
- **`jobs t1, t2, …`** lists tasks the supervisor may assign. Each MUST be non-generic, not overloaded, with wire-typed parameters and result. Jobs may be ongoing.
- **`start t(args)`** names a job, which MUST appear in `jobs`, that the runtime assigns itself after the first spawn of every connection if no job is running. Arguments are constant expressions.
- **`config key = value`** sets a runtime setting from the table below. Values are constant expressions; each key at most once.

### 12.2 Settings

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `job_priority` | `Int` | `0` | Priority of the job thread. |
| `confirm_timeout` | `Duration` | `5s` | Wall ticks after `Issued` before `Unconfirmed` (decision 39). |
| `max_pending` | `Int` ≥ 1 | `8` | Unconfirmed actions one strand may have in async mode. |
| `atomic_limit` | `Duration` ≥ `1t` | `5s` | How long a pinned thread may delay a pending freeze, whatever pins it (§15.3, decision 136). |
| `reconnect_delay` | `Duration` | `10s` | Wait before reconnecting after `Disconnected` or `Kicked`. |
| `max_reconnects` | `Int` ≥ 0 | `5` | Consecutive failed reconnects before the session ends. |

Connection details (server address, account, authentication) are never in source. They are supplied when the runtime launches a bot, so one IR file can drive many accounts.

### 12.3 Infrastructure failures

`Disconnected`, `Kicked` and `Died` are handled by the runtime, not by tasks (decision 12). Each one cancels every thread at once, without running defers (decision 62), and reports the job as failed with that reason.

- After `Disconnected` or `Kicked`, the runtime waits `reconnect_delay` and reconnects, up to `max_reconnects` consecutive failures. Activity state and handler backoff survive; the job does not, and is reassigned only by the supervisor or the `start` item. When the limit is reached, the last `disconnected` report has `final` true and the session ends.
- After `Died`, the bot stays connected and dead. The `died` event fires (§17.6). Leaving the death screen is policy: `golem.survival.auto_respawn` calls `respawn`. Without it, the bot stays dead and every job assignment is refused with `NotReady` (§16.3).

## 13. Static analysis

The compiler rejects any program that fails a check below; all of them run after monomorphization unless stated, so each instantiation is checked concretely while generic definitions are type-checked once (decision 24).

### 13.1 Checks at a glance

| # | Check | Section |
| --- | --- | --- |
| 1 | Names resolve; imports are explicit; case rules hold. | §3.2, §5 |
| 2 | Types check; overloads resolve uniquely; literals exist in the target registries; set elements and map keys are `Eq + Ord`. | §6 |
| 3 | `fn`s are effect-free; tasks are called only in statement positions. | §7.4, §9.9 |
| 4 | The call graph is acyclic; `const` initialisers are acyclic and evaluate without a defect. | §13.2, §7.5 |
| 5 | Resource sets are inferred; `with` strands are disjoint. | §13.3 |
| 6 | Non-ongoing tasks and bounded handler bodies terminate. | §13.4 |
| 7 | Clauses are allowed for the task kind; `old` and `result` are placed correctly. | §9.2, §9.4 |
| 8 | `fails` is exact; failure sets are inferred. | §9.5, §13.5 |
| 9 | `confirm async` bodies are async-safe; `atomic` bodies are bounded and non-ongoing. | §10.7, §10.8 |
| 10 | Ongoing tasks never reach their end; ongoing calls appear only where allowed. | §13.6 |
| 11 | `match` is exhaustive; `let … else` blocks diverge. | §10.1, §10.2 |
| 12 | Wire types are used where required. | §6.9 |
| 13 | Handlers: events exist, binder counts match, options and debounce durations are constant, `queue` only on `on`. | §11 |
| 14 | Bots: instance names unique, jobs valid, `start` in `jobs`, config keys known; the user-declared failures, and the notices, that a bot reaches have distinct simple names, none equal to a built-in failure's name. | §12 |

Warnings, not errors: catch arms for failures that cannot occur, unused imports, and `requires` clauses implied by a callee's own `requires`.

### 13.2 Acyclicity

The graph whose nodes are fns and tasks, with an edge for every call (including calls in clauses, defaults, `with`, `defer` and handler bodies), MUST be acyclic (decision 59). The check runs on generic definitions, before monomorphization, so a generic task cannot reach itself through any instantiation. As a result every task expands to a finite statechart (§18.3).

### 13.3 Resource inference

The inferred resource set `U(x)` is defined by:

- `U(t)` for an extern task is its `uses` clause (empty if absent).
- `U(B)` for a block is the union of `U` over every task called in it, including `with` operands and `defer` calls.
- `U(t)` for a composite is `U` of its body. A handler's footprint is `U` of its body; a job's footprint is `U` of its task.

For every `with t(args) { B }`, `U(t) ∩ U(B)` MUST be empty. The scheduler uses footprints, not momentary holds (§15.3), so these sets fully determine which threads can run together.

### 13.4 Boundedness

A block is *structurally bounded* if every statement in it is: a binding, assignment, `heartbeat`, `if`, `match`, `fail`, `notify`, `return`, `break`, `continue`, `wait`, `wait until` (it has a timeout), `for`, `repeat`, `while … decreasing`, `atomic`, `confirm async`, `try`, `retry` or `abort when` over bounded blocks, a `with` whose body is bounded, a `defer`, or a call to a bounded task. A task is *bounded* if it is non-ongoing and declares `timeout` or `progress` or has a structurally bounded body. `loop every` and direct ongoing calls are never structurally bounded.

`progress` is a liveness bound, not a hard bound: a metric can keep improving forever. Authors who need a hard ceiling add `timeout` too.

### 13.5 Failure inference

The compiler computes, for every task, the set of failures a call may raise, and exports it in the IR (decision 10). It is the union of: the task's `fails` list; `else` failures of its clauses; implicit failures by condition (`Unmet` if some `requires` lacks `else`, `Broken` likewise for `invariant` and `maintains`, `Timeout` for `timeout`, `wait until` without `else`, and any body that may pin its thread (§15.3), `Stalled` for `progress`, `stalls_after` and `while … decreasing`, `Rejected` and `Unconfirmed` if it is or directly calls an extern task, `Interfered` if it has `ensures`, `WindowClosed` if it may use `screen`); and the inferred sets of its callees minus failures caught around each call. Failures of callees reach the caller only through the callees' inferred sets minus the failures caught around each call.

### 13.6 Ongoing rules

An ongoing composite body MUST NOT complete: every control path ends in `loop every`, in a call to an ongoing task, or in `fail`. `return` is forbidden in it, and `break` may not leave its outermost `loop every`. A `when … until` handler body may end in an ongoing call, but it may also complete or `return`: the run ends and restarts while the trigger holds, no earlier than the next tick (decisions 106, 135).

## 14. World model, confirmation and rollback

The runtime keeps one confirmed world state per bot, updated once per tick from the server, plus per-strand predictions while a strand runs inside `confirm async`.

### 14.1 World keys

The world model is a map from keys to values. Keys are the unit of change tracking (§14.5) and of read tracking (§9.8).

| Family | Keys |
| --- | --- |
| Blocks | `block(pos)`, `block_light(pos)`, `sky_light(pos)` and the sign text at pos, for every loaded position |
| Player | position, rotation, health, food, saturation, oxygen, effects, on-ground, in-water, in-lava, sneaking, sprinting, using-item, sleeping, dead, dimension, held slot, on-fire, vehicle, attributes (block\_interaction\_range, entity\_interaction\_range) |
| Inventory | each player inventory slot 0–45 (vanilla numbering, §17.4), the cursor |
| Window | the open window's id and kind, each of its slots, each of its properties |
| Entities | per entity id: type, position, name, health if sent, equipment, passengers, alive, the stack of an item entity, the owner of a projectile or fishing hook, the bite flag of a fishing hook |
| World | time of day, weather, tag contents, known recipes |

`bot.path_progress` is not world state: the backend reports it with each tick's input (§18.4) and it is never attributed or read-tracked. The canonical string form of every key, as carried by `Interfered.key`, is fixed by the interface contracts.

The bot's own position follows vanilla: the client is authoritative for movement and the server only corrects it. The confirmed position is therefore the backend's simulated position, replaced whenever a correction arrives.

### 14.2 Views

The *confirmed view* of tick `n` is the state after all server data received before tick `n` has been ingested (§15.2). It does not change during the tick, so every evaluation in a tick sees the same world. A strand in sync mode, every trigger, and every other thread read the confirmed view. A strand inside `confirm async` reads its *predicted view*: the confirmed view with the deltas of its own unconfirmed actions applied in issue order (decisions 21, 40).

### 14.3 Async mode

Inside `confirm async`, an extern frame completes as soon as the backend reports `Issued`, and the backend supplies the action's predicted delta: the values it expects for the keys it affects. Later statements run on the predicted view.

- **Pending limit.** A strand may have at most `max_pending` actions without a verdict. A further extern call suspends until one resolves.
- **Barrier.** When control leaves the `confirm async` block, by completing, `return`, `break`, `continue` or a failure, the strand suspends until every action it issued inside the block has a verdict. If all are `Confirmed`, it continues on the confirmed view. If any is not, rollback (§14.4) replaces whatever was leaving the block.
- **Folding.** When an action is confirmed its delta is dropped; the confirmed view already holds the server's values. A backend MUST report `Rejected`, not `Confirmed`, when the server's values for an action's predicted keys contradict the prediction.

### 14.4 Rollback

Verdicts of one strand are processed in issue order: an action's verdict takes effect only after every earlier action of the strand has a verdict. When action `j` is `Rejected` or `Unconfirmed`:

1. The backend cancels every later action of the strand. Packets already sent cannot be unsent (decision 19); their verdicts are ignored.
2. The deltas of `j` and all later actions are discarded.
3. The strand's control state, frames, locals and `old` snapshots are restored to the checkpoint taken when `j`'s frame started. Timers and progress trackers of frames that existed at the checkpoint keep their current values.
4. `Rejected(task, detail)` or `Unconfirmed(task)` is raised at `j`'s call site and unwinds normally (§10.6).

Because async bodies contain no `defer`, `try` or catch postfix (§10.8), no cleanup is lost by the rewind, and the failure always leaves the async block before it can be caught. Rollback never affects another strand.

**Irreversible barrier.** Before an irreversible extern call, and before every `sync` call, the strand waits until all of its own pending actions have verdicts, rolling back if one fails. This refines decision 20: other strands' predictions are invisible to the caller, so their confirmations are not waited for.

### 14.5 Attribution

During ingest the backend tags every change to a world key as `Own(action)`, when the change is an expected effect of a live action of this bot, or `Outside` otherwise. Changes caused by cancelled or rolled-back actions count as `Outside`. The runtime records, per key, the last tick an `Outside` change touched it; §9.8 uses this to tell `Interfered` from `ContractViolation` (decision 41).

**Pitfalls this settles.** Ghost blocks after a rejected dig are an `Outside` change back to the old state, so a caller's later `ensures` reports `Interfered`, not a defect. An `ensures` holds at completion only; the IR marks every `ensures` as a point-in-time fact, so an orchestrator must re-check before relying on it.

## 15. Ticks and scheduling

Each tick runs seven phases in a fixed order, and the scheduler grants threads by footprint and rank, so identical inputs always produce identical behavior (decision 3).

### 15.1 Threads

A thread is a job run or a handler run. It has a footprint (§13.3), a priority (`job_priority` or the handler's `priority`) and an id, increasing in creation order. Its *rank* orders threads by priority, highest first, then by id, lowest first.

| Thread state | Meaning |
| --- | --- |
| Waiting | Created, not yet granted. |
| Running | Granted this tick. |
| Frozen | Granted before, not granted now (§15.4). |
| Paused | Frozen by the supervisor; not a candidate until resumed. |
| Ended | Completed, failed or cancelled; removed after reporting. |

A thread is *pinned* while one of its strands is inside `atomic` or `confirm async`, or while the cursor holds items, the last action that changed the cursor was one of its own, and its cursor pin has not lapsed (§15.3). These are the three *pin causes* (decision 56). A body *may pin* its thread when it contains `atomic` or `confirm async`, or calls `pick_up` or `put`, directly or in callees.

### 15.2 Tick phases

1. **Ingest.** The backend hands over all server data received since the last tick. The runtime applies it to the confirmed view with attribution (§14.5), queues discrete events and records action reports. `Disconnected`, `Kicked` and `Died` are acted on here (§12.3).
2. **Verdicts.** For strands with async actions, verdicts are applied in issue order and rollbacks performed (§14.4). An action without a verdict `confirm_timeout` wall ticks after `Issued` receives verdict `Unconfirmed`.
3. **Supervisor.** Commands received since the last tick are applied in arrival order (§16.3).
4. **Triggers.** In the fixed handler order (§11.6): `until` cancellations first, including handlers waiting at a restart point (§11.4), then `when` counters and edge triggers, then event occurrences in arrival order, then queued occurrences. New threads are created.
5. **Scheduling.** The grant set is computed and pin limits are counted (§15.3); threads change between Running, Frozen and Waiting.
6. **Step.** Each granted thread in rank order, each of its strands in creation order (a parent before its children):
   1. Check phase: (a) the pin limit, when the thread's count exceeds `atomic_limit` (§15.3); (b) completion checks of extern frames (§9.6); (c) `abort when` conditions, outermost first; (d) for each frame outermost first, its `invariant`, `maintains`, `progress`, `timeout` and `stalls_after` clauses, in that order; (e) pending `wait until` conditions. The first violation unwinds (§10.6).
   2. Execute: a strand at a restart point starts its next run (§11.4); then statements run until the strand suspends, completes or fails.
7. **Flush.** The backend sends this tick's packets; report events are emitted (§16.2).

A frame started during execution gets its first check phase in the next tick. That is why invariants are "checked every tick after the start tick" (§9.3).

### 15.3 Scheduler

The grant set is computed from scratch each tick:

1. Every pinned thread is granted, and its footprint is marked taken. Pinned threads were all granted in the previous tick, so their footprints are pairwise disjoint.
2. Every other thread that is Waiting, Running or Frozen is visited in rank order. It is granted if its footprint does not intersect the taken set, and its footprint is then added to the taken set. A thread with an empty footprint is always granted.

Granted footprints are therefore pairwise disjoint: no two running threads ever share a resource. A supervisor pause takes effect at the first scheduling phase in which the job is not pinned.

**Pin limit** (decision 136). A pinned thread *blocks* in a tick when, in that tick's scheduling phase, a higher-ranked candidate thread whose footprint intersects its own would have been granted had the pinned thread not been pinned. The runtime counts, per thread, the consecutive ticks in which it blocks; a tick in which it does not block resets the count to 0. In each tick in which the count exceeds `atomic_limit`, measured in ticks, the thread's innermost frame fails with `Timeout(task)` in the first step of its check phase, whatever the pin cause, and its cursor pin lapses until the cursor is next empty. The failure unwinds normally (§10.6), and the pin ends as follows:

- **`atomic`** ends when the unwind leaves the block.
- **`confirm async`** ends at the block's barrier, which waits for verdicts of actions already issued; every one arrives within `confirm_timeout` (§15.2 phase 2).
- **Cursor items** stop pinning at once, so the thread can be frozen in the next scheduling phase. Freezing closes its window, and vanilla moves the cursor items into the inventory, or drops them when it is full (§15.4).

Because the rule fires again in every tick the count stays above the limit, a `catch` around the pinned code cannot keep the pin. A pinned thread therefore delays a conflicting higher-ranked thread by at most `atomic_limit` + 1 ticks, plus up to `confirm_timeout` while a `confirm async` barrier waits. Bots whose reflexes must not wait that long, such as `escape_lava`, lower `atomic_limit` in their `config`.

### 15.4 Freeze and resume

**Freezing** a thread (decision 56):

1. Every durative and ongoing extern action of the thread is cancelled at the backend, releasing keys, sneaking and the pathfinder.
2. If the thread owns the open window, the runtime closes it. Every handle to that opening becomes stale for good (decision 32). The cursor is empty, because a thread holding cursor items is pinned, unless its cursor pin has lapsed (§15.3): then the close returns the cursor items to the inventory, or the server drops them.
3. Its frames stop counting active ticks. Verdicts for its instant actions keep arriving and are processed when it resumes.

**Resuming**, at the start of the thread's first granted step phase (decisions 47, 55):

1. The invariants of every frame are re-checked, outermost first. A violation unwinds from that frame.
2. The innermost frame with a stale `Window` handle among its parameters or locals fails with `WindowClosed`. `Window<PlayerInventory>` handles never go stale.
3. Durative and ongoing extern frames restart: their `requires` are re-checked, their `old` snapshots retaken, and their own timers reset. Composite `requires` are not re-checked.

### 15.5 Determinism

Given the same IR, the same per-tick backend input (server data, action reports, attribution) and the same supervisor commands, the runtime MUST make the same decisions in the same ticks. The language has no randomness and no wall clock; `world.tick` counts ticks since connect. Recording the backend input is enough to replay a session exactly in the simulator (§18.4).

## 16. Failures, reports and the supervisor

Every outcome leaves the bot as a typed JSON message, so a supervisor can retry, reassign or alert without parsing logs (no silent failure).

### 16.1 Built-in failures

| Failure | Fields | Catchable | Raised when |
| --- | --- | --- | --- |
| `Unmet` | `task, clause: String` | yes | a `requires` without `else` is false |
| `Broken` | `task, clause: String` | yes | an `invariant` or `maintains` without `else` is violated |
| `Stalled` | `task: String` | yes | a `progress` metric or `while` variant stops improving, or no `heartbeat` arrives within `stalls_after` |
| `Timeout` | `task: String` | yes | a `timeout` or `wait until` bound is exceeded, or a pinned thread passes `atomic_limit` (§15.3) |
| `Rejected` | `task, detail: String` | yes | the server reverted an action |
| `Unconfirmed` | `task: String` | yes | no verdict within `confirm_timeout` |
| `Interfered` | `task, key: String` | yes | an `ensures` is false because of an outside change |
| `WindowClosed` | `task: String` | yes | a frame resumes holding a stale window handle, or a primitive gets one |
| `ContractViolation` | `task, clause: String` | no | an `ensures` is false with no outside change, or a backend raises an undeclared failure |
| `Defect` | `kind, at: String` | no | an arithmetic or argument fault (§7.1) |
| `Disconnected`, `Kicked`, `Died` | `reason: String` | no | the connection or the bot's life is lost (§12.3) |

User failures are declared with `failure Name(fields)`; fields MUST be wire types. In reports every failure also carries a *trace*: the frames it unwound, each with task name and source position. The trace is not visible to Golem code.

### 16.2 Report stream

The runtime emits one JSON object per line. Every message has `seq` (per-bot counter), `tick`, `bot` and `type`; failures appear as `{"type": "NoPath", "fields": {…}, "trace": […]}`.

Failure `type` and notice `name` are the declared simple names; §13.1 check 14 makes them unique per bot.

| Type | Emitted when | Extra fields |
| --- | --- | --- |
| `hello` | after each connect | IR hash, Minecraft version, job signatures, activity instances |
| `job_started` / `job_completed` / `job_failed` / `job_cancelled` | job lifecycle | `job_id`, `result` or `failure` |
| `thread_started` / `thread_ended` | any thread | `thread`, `kind`, `priority`, outcome |
| `frozen` / `resumed` | scheduling changes | `thread`, `by` (the thread that took the resources, or `pause`) |
| `task_started` / `task_completed` / `task_failed` / `task_cancelled` | every frame of a task marked `pub`; `task_cancelled` when a cancelled frame finishes unwinding | `thread`, `frame`, `task`, `failure` |
| `progress` | a `progress` metric improves, at most once per second per frame | `frame`, `value` |
| `rollback` | §14.4 | `thread`, `action`, `failure` |
| `notice` | `notify` | `name`, `fields`, `thread`, and `job_id` from a job thread or `instance` and `handler` from a handler thread (decision 94) |
| `handler_failed` / `handler_backoff` / `handler_disabled` / `event_dropped` | §11.4, §11.5 | `instance`, `handler` |
| `defer_failed` | §10.6 | `frame`, `failure` |
| `disconnected` / `reconnected` / `died` / `respawned` | infrastructure | `reason`; `disconnected` also `kind` (`Disconnected` or `Kicked`) and `final`, true when no reconnect will follow |
| `state_not_restored` | §18.5, once per item, after the session's first `hello` | `instance`, `name` (a var name, or `handler:<index>`), `reason` (`missing`, `type_changed` or `instance_gone`) |

The `handler` field is the handler's index (§11.6).

The field types of these messages are fixed by the report schema of the interface contracts, `@golem/contracts` 0.1.0 (`contracts/`).

### 16.3 Supervisor commands

The supervisor sends JSON commands; each gets `accepted` or `refused` with a reason. Commands are applied in tick phase 3 (decision 37).

| Command | Effect | Refusals |
| --- | --- | --- |
| `assign {job, args, job_id}` | Starts the job as a new thread. | `Busy` (a job is running), `UnknownJob`, `BadArgs` (arguments do not decode to the parameter types), `NotReady` (not connected or dead) |
| `cancel {job_id}` | Unwinds the job, running defers; `job_cancelled` follows. | `NoJob` |
| `pause {job_id}` | Freezes the job until `resume` (§15.3). | `NoJob` |
| `resume {job_id}` | Makes the job a candidate again. | `NoJob`, `NotPaused` |
| `snapshot {}` | Returns the read-only machine state: threads, strands, frames with task, statechart state id (§18.3), elapsed ticks and wire-typed arguments. | none |

Any command MAY carry `id`, a string of 1–128 characters chosen by the supervisor; its reply carries the same `id`. Without `id`, replies correlate with commands by order, since commands are applied and answered in arrival order. Every reply also carries `command`, the name of the command it answers.

A line that is not a valid command (not JSON, an unknown `command`, a missing or mistyped field) is refused with `BadCommand`, carrying the readable `command` name or `""`. The runtime never closes the command stream because of one.

There is no command that changes a running job's arguments or writes machine state. A supervisor changes parameters by cancelling and assigning again, which is safe because tasks are restartable (decision 19). The transport (WebSocket, stdio) is implementation-defined; the message formats are normative.

## 17. Standard library

The standard library is 34 primitives in `golem.prim` and everything else written in Golem; `extern` declarations are allowed only in `golem.*` modules, so the compiler knows every primitive's class. The tables below summarise; the listings of §17.9 are normative (decision 131).

### 17.1 Primitives (`golem.prim`)

Confirmation methods: **ack** = the server's Acknowledge Block Change carrying the action's sequence number (protocol 1.19+); **settle** = no server correction for the affected keys during the settle window, `max(4t, 2 × round-trip time)`; **state** = the affected keys reach the predicted values on the confirmed view; **sent** = confirmed when sent (unchecked, nothing to observe).

Implicit clauses: every primitive except `respawn` requires `!bot.dead` (§9.6), and every `Window` parameter `w` adds `requires w.open`, failing with `WindowClosed(task)`. Instant primitives declare `timeout 1min` as a backstop; `Unconfirmed` arrives first under any `confirm_timeout` below that.

`close` is the one exception: it has no implicit `requires w.open`, so `defer close(w)` never fails after a freeze or a server-side close (decision 84).

| Primitive | Class | `uses` | Contract (beyond the implicit clauses) | Confirmed by |
| --- | --- | --- | --- | --- |
| `pathfind(goal: Goal, limit: Duration = 2min, opts: PathOpts = PathOpts())` | durative | legs, head | ensures `goal.reached`; progress `bot.path_progress` increasing within `5s`; timeout `limit`; fails `NoPath`; never breaks or places blocks and never enters `opts.avoid` (decision 93) | state + settle |
| `pathfind_build(goal: Goal, limit: Duration = 2min, opts: BuildOpts = BuildOpts())` | durative | legs, head, hands, inventory | as `pathfind`, but may dig blocks when `opts.dig` and place items matching `opts.scaffold` (decision 93) | state + settle |
| `sneak()` | ongoing | stance | maintains `bot.sneaking` tolerate `10t` | settle |
| `sprint()` | ongoing | stance | requires `bot.food > 6` else `TooHungry`; maintains `bot.sprinting` tolerate `10t` | settle |
| `hold_jump()` | ongoing | legs | none | sent |
| `steer(forward: Float, sideways: Float)` | ongoing | legs | requires `bot.riding` else `NotRiding` | sent |
| `dismount()` | instant | legs | requires `bot.riding` else `NotRiding`; ensures `!bot.riding` | state |
| `look_at(target: Vec3)` | durative | head | ensures `bot.aim_error(target) <= 1deg`; timeout `2s` | settle |
| `dig(pos: BlockPos)` | durative | hands, head | §9.10 | ack + state |
| `interact(pos: BlockPos, face: Face)` | instant | hands, head | `unchecked`; requires `bot.in_reach(pos)` else `OutOfReach` | ack |
| `place_block(support: BlockPos, face: Face)` | instant | hands, head | requires `bot.in_reach(support)` else `OutOfReach` and a held item that places a block (`bot.held?.item.block != none`) else `NotABlock(slot)` (decisions 114, 115); clicks `face` of `support` and predicts the item's default placement state at `support.offset(face)`; a refusal fails `Rejected` (decision 92) | ack + state (block type at the target cell) |
| `interact(target: Entity)` | instant | hands, head | `unchecked`; requires `target.alive` else `EntityGone`, `bot.in_reach(target)` else `OutOfReach` | sent |
| `attack(target: Entity)` | instant | hands, head | `unchecked`; same requires as `interact(Entity)` | sent |
| `use_item(hand: Hand = Hand.Main)` | instant | hands | `unchecked` | ack |
| `hold_use(hand: Hand = Hand.Main)` | ongoing | hands | maintains `bot.using_item` tolerate `10t` | settle |
| `swap_hands()` | instant | hands | ensures main and off hand exchanged | settle |
| `select_hotbar(slot: Int)` | instant | hands | requires `slot in 0..9`; ensures `bot.held_slot == slot` | settle |
| `pick_up(w, slot: Int, half: Bool = false)` | instant | inventory, screen | requires cursor empty, slot non-empty; ensures cursor holds the stack (or the larger half) taken from the slot | settle |
| `put(w, slot: Int, one: Bool = false)` | instant | inventory, screen | requires cursor non-empty and `w.accepts(slot, cursor)` else `CannotPut`; never swaps (decision 15); ensures the moved count left the cursor and arrived in the slot | settle |
| `quick_move(w, slot: Int)` | instant | inventory, screen | requires slot non-empty, `w.can_quick_move(slot)` else `NoRoom`; ensures slot count decreased, total count in `w` unchanged | settle |
| `swap_hotbar(w, slot: Int, hotbar: Int)` | instant | inventory, screen | requires `hotbar in 0..9`; ensures the two stacks exchanged | settle |
| `throw(w, slot: Int, all: Bool = false)` | instant, `irreversible` | inventory, screen | requires slot non-empty; ensures slot count reduced by 1, or emptied | settle |
| `throw_cursor(w)` | instant, `irreversible` | inventory, screen | requires cursor non-empty; ensures cursor empty | settle |
| `click_button(w: Window<impl HasButtons>, id: Int)` | instant | inventory, screen | `unchecked` | settle |
| `select_trade(w: Window<Merchant>, index: Int)` | instant | inventory, screen | requires `index in 0..w.trades.len`; ensures `w.selected_trade == index` | settle |
| `rename(w: Window<Anvil>, name: String)` | instant | inventory, screen | ensures `w.rename_text == name` | settle |
| `close(w: Window<impl Screen>)` | instant | inventory, screen | no implicit `requires w.open`: on a closed handle it completes without acting (decision 84); otherwise requires cursor empty else `CursorNotEmpty`; ensures `!w.open` | sent |
| `edit_sign(pos: BlockPos, front: Bool, lines: List<String>)` | instant | hands, head | requires `world.block(pos) matches #minecraft:all_signs` (a 1.20+ tag, decision 116), `lines.len == 4`; ensures `world.sign_text(pos, front) == lines` | state |
| `write_book(slot: Int, pages: List<String>)` | instant | inventory | `unchecked`; requires a writable book at `slot` | sent |
| `sign_book(slot: Int, title: String, pages: List<String>)` | instant, `irreversible` | inventory | `unchecked`; requires a writable book at `slot` | sent |
| `respawn()` | instant | none | requires `bot.dead`; ensures `!bot.dead` | state |
| `leave_bed()` | instant | legs | requires `bot.sleeping`; ensures `!bot.sleeping` | state |
| `chat(text: String)` | instant, `irreversible` | none | `unchecked`; requires 1–256 characters, not starting with `/`, else `BadMessage` | sent |
| `command(text: String)` | instant, `irreversible` | none | `unchecked`; requires 1–256 characters, without the leading `/`, else `BadMessage` | sent |

Window primitives are generic over `K: WindowKind` unless a narrower bound is shown. `golem.prim` declares the failures named above; §17.9 lists each with its fields. `NoPath(at)` carries the bot's feet when no path was found (decision 112), and `OutOfReach(pos)` also serves entities, carrying the block of the entity's feet (decision 113).

### 17.2 `bot`, `world` and entities

All members are view-dependent `extern fn`s. Positions are block coordinates; distances are Euclidean in blocks. Where several members share a type it is written once after the last of them.

| Receiver | Members |
| --- | --- |
| `bot` | `pos: Vec3`, `feet: BlockPos`, `eye: Vec3`, `yaw`, `pitch: Angle`, `health: Float`, `food: Int`, `saturation: Float`, `oxygen: Int` (0–300), `on_ground`, `in_water`, `in_lava`, `on_fire`, `sneaking`, `sprinting`, `using_item`, `sleeping`, `dead`, `riding: Bool`, `dimension: String`, `held_slot: Int`, `held`, `offhand: ItemStack?` (decision 115), `cursor: ItemStack?`, `inventory: Inventory`, `window: Window<AnyKind>?`, `inventory_window: Window<PlayerInventory>`, `block_reach`, `entity_reach: Float`, `in_reach(pos: BlockPos) -> Bool`, `in_reach(e: Entity) -> Bool`, `aim_point(pos: BlockPos) -> Vec3?`, `aim_face(pos: BlockPos) -> Face?`, `aim_error(target: Vec3) -> Angle`, `dig_time(pos: BlockPos) -> Duration`, `path_progress: Int`, `distance_to(p: Vec3) -> Float`, `bobber: Entity?`, `can_place(item: ItemFilter, pos: BlockPos) -> Bool`, `can_harvest(pos: BlockPos) -> Bool` |
| `world` | `block(p: BlockPos) -> BlockState?` (`none` if unloaded), `loaded(p: BlockPos) -> Bool`, `blocks(f: BlockFilter, area: Region) -> List<BlockPos>`, `nearest_block(f: BlockFilter, radius: Int) -> BlockPos?`, `entities(f: EntityFilter) -> List<Entity>`, `nearest(f: EntityFilter) -> Entity?`, `sign_text(p: BlockPos, front: Bool) -> List<String>?`, `block_light(p: BlockPos) -> Int?`, `sky_light(p: BlockPos) -> Int?`, `time_of_day: Int`, `raining: Bool`, `tick: Int`, `crafting_recipes_for(result: ItemFilter) -> List<CraftingRecipe>`, `crafting_recipes_from(input: ItemType) -> List<CraftingRecipe>`, `processing_recipes_for(result: ItemFilter) -> List<ProcessingRecipe>`, `processing_recipes_from(input: ItemType) -> List<ProcessingRecipe>`, `stonecutting_recipes_for(result: ItemFilter) -> List<StonecuttingRecipe>`, `stonecutting_recipes_from(input: ItemType) -> List<StonecuttingRecipe>`, `burn_time(i: ItemType) -> Duration?` |
| `Entity` | `id: Int`, `entity_type: EntityType`, `pos`, `eye: Vec3`, `alive: Bool`, `name: String?`, `health: Float?`, `is_player: Bool`, `biting: Bool?` (fishing hooks only), `item: ItemStack?` (item entities only, decision 123) |
| `BlockPos` | `x`, `y`, `z: Int`, `center: Vec3`, `above`, `below: BlockPos`, `offset(f: Face) -> BlockPos` |
| `Vec3` | `x`, `y`, `z: Float`, `distance(o: Vec3) -> Float` |
| `BlockState`, `BlockType`, `ItemType` | `BlockState.block: BlockType`, `BlockType.item: ItemType?` (`none` for blocks no item places, such as fire), `ItemType.block: BlockType?` (`none` for items that place no block, decision 114) |

`blocks` and `entities` return lists sorted by distance from `bot.pos`, ties broken by `BlockPos` order or entity id. `blocks` over a region of more than 65,536 positions, and `nearest_block` with `radius` over 16, raise `Defect(QueryTooLarge)`. A non-alive entity's members return their last known values. `path_progress` counts path nodes reached by the current `pathfind`.

`BlockPos` members are pure and view-independent. `bot.can_place(item, pos)` holds when `pos` is replaceable, the inventory holds an item matching `item`, and vanilla rules allow placing that item there against some adjacent face: seeds need farmland, torches a sturdy face, and so on. It is computed from version data (decision 68). `bot.bobber` is the fishing hook whose owner id is the bot's. Entity-type members such as `biting` return `none` for entities of other types (decision 75).

`bot.can_harvest(pos)` holds when some inventory item, or the empty hand, meets the correct-tool and tier rule of the block at `pos`, from version data (decision 80). `can_place` also requires that no entity other than the bot intersects `pos`; `place` moves the bot itself out of the cell (decision 92). `bot.on_fire` is the burning flag of the bot's entity metadata. `world.block_light` and `world.sky_light` come from chunk and light-update data; since 1.18 hostile mobs spawn only at block light 0, so a spawn-proofing check reads `block_light` (decision 81). `world.burn_time(i)` is the furnace burn time of one fuel item; blast furnaces and smokers burn it twice as fast and cook twice as fast, so the items smelted per fuel item are the same. Recipe lookups name their direction: `*_for(result)` finds recipes whose result matches, `*_from(input)` recipes that consume the item (decision 85).

### 17.3 Goals and reach

```golem
pub enum Goal {
    At(pos: BlockPos)                          // bot.feet == pos
    Near(pos: BlockPos, radius: Float)         // distance from bot.pos to the centre of pos <= radius
    XZ(x: Int, z: Int)                         // bot.feet.x == x && bot.feet.z == z
    Y(y: Int)                                  // bot.feet.y == y
    InReach(pos: BlockPos)                     // bot.in_reach(pos)
    NearEntity(target: Entity, radius: Float)  // target.alive && distance <= radius
    Away(center: Vec3, radius: Float)          // distance from bot.pos to center >= radius
    AnyOf(goals: List<Goal>)                   // some goal is reached
    AllOf(goals: List<Goal>)                   // every goal is reached at once
    Clear(pos: BlockPos)                       // the bot's bounding box does not intersect the cell pos
}
```

```golem
pub struct PathOpts(avoid: Region? = none)
pub struct BuildOpts(dig: Bool = false, scaffold: ItemFilter = ItemFilter.NOTHING, avoid: Region? = none)
```

`pathfind` and `goto` never break or place blocks, and their routes never enter `opts.avoid`, so a builder cannot tunnel through its own walls (decision 93). Routes that must dig or bridge use `pathfind_build`, which may dig breakable blocks when `dig` is true and place items matching `scaffold`. It is a separate primitive because its footprint includes `hands` and `inventory`, and `uses` is static (decision 60): a flag on `pathfind` would block eating on every walk.

`goal.reached` is a view-dependent fn implementing the comments above.

**Block reach.** Let `E = bot.eye` and `R = bot.block_reach`, the server's `block_interaction_range` attribute (default 4.5). For each box of the block's outline shape, take each face whose outward normal points toward `E`, and on it five sample points: the centre, then the four points inset by 10% of the face's extent from its corners in a fixed order. Faces are visited nearest centre first. A point qualifies when it is within `R` of `E` and a ray from `E` to it first hits the block at `pos`. `bot.aim_point(pos)` is the first qualifying point, `bot.aim_face(pos)` its face, and `bot.in_reach(pos)` is `aim_point(pos) != none`. Aiming at a hidden centre therefore never blocks a reachable block.

**Entity reach.** `bot.in_reach(e)` holds when the distance from `E` to `e`'s bounding box is at most `bot.entity_reach` (attribute `entity_interaction_range`, default 3.0) and the segment from `E` to the box's closest point crosses no block with a full collision shape.

### 17.4 Windows (`golem.windows`)

A window's kind is a type parameter, so using a furnace slot on a chest is a compile error (decision 30).

```golem
pub trait WindowKind { fn menu_types() -> List<String> }
pub trait Screen: WindowKind {}
pub trait HasContainer: Screen {}
pub trait Smelter: Screen {}
pub trait HasButtons: Screen {}
pub trait CraftingStation: WindowKind {
    fn grid_width() -> Int
    fn grid_height() -> Int
}
```

| Kind | Menu types | Traits |
| --- | --- | --- |
| `PlayerInventory` | none (window 0) | `CraftingStation` (2×2) |
| `Container` | `generic_9x1` … `generic_9x6`, `generic_3x3`, `shulker_box`, `hopper` | `Screen`, `HasContainer` |
| `Crafting` | `crafting` | `Screen`, `CraftingStation` (3×3) |
| `Furnace`, `BlastFurnace`, `Smoker` | `furnace`, `blast_furnace`, `smoker` | `Screen`, `Smelter` |
| `Stonecutter`, `Loom`, `Enchanting` | `stonecutter`, `loom`, `enchantment` | `Screen`, `HasButtons` |
| `Anvil`, `Grindstone`, `CartographyTable`, `Brewing`, `Beacon`, `Merchant`, `Smithing` | `anvil`, `grindstone`, `cartography_table`, `brewing_stand`, `beacon`, `merchant`, `smithing` | `Screen` |
| `MountInventory` | opened by the horse-screen packet | `Screen`, `HasContainer` |
| `AnyKind` | every menu type | `Screen`; used only by `bot.window` |

Menu type ids carry the `minecraft:` namespace. Kinds are empty structs. `SlotRange` is `type SlotRange = Range`; slots use vanilla window numbering, and the player inventory window numbers 0 result, 1–4 grid, 5–8 armour, 9–35 main, 36–44 hotbar, 45 off hand.

| Bound | Members on `w: Window<K>` |
| --- | --- |
| any `WindowKind` | `open: Bool`, `size: Int`, `slot(i: Int) -> ItemStack?`, `player_slots`, `hotbar: SlotRange` (both `SlotRange`, decision 121), `property(i: Int) -> Int?`, `accepts(slot: Int, s: ItemStack) -> Bool`, `can_quick_move(slot: Int) -> Bool`, `cast<J: WindowKind>() -> Window<J>?`, `find(f: ItemFilter) -> Int?` (first matching slot of `player_slots`, numbered in this window; decision 85) |
| `HasContainer` | `container: SlotRange` |
| `CraftingStation` | `grid: SlotRange`, `result_slot: Int` |
| `Smelter` | `input_slot`, `fuel_slot`, `output_slot: Int`, `cook_progress`, `fuel_left: Float` (0–1) |
| `Merchant` (concrete) | `trades: List<Trade>`, `selected_trade: Int?` |
| `Anvil` (concrete) | `rename_text: String?`, `repair_cost: Int?` |

`cast` is not named `as` because `as` is a keyword. `cast` returns `none` unless the opening's menu type is in `J.menu_types()`. A handle is stale once its opening closes; `Window<PlayerInventory>` is never stale, and its `open` is true while no other window is open. `Trade` is declared in `golem.windows` (§17.9, decision 120).

```golem
@requires bot.window == none else fail ScreenBusy
@ensures result.open
@fails OutOfReach, NotOpened, WrongKind
pub task open<K: Screen>(pos: BlockPos) -> Window<K> {
    let face = bot.aim_face(pos) else fail OutOfReach(pos)
    interact(pos, face)
    wait until bot.window != none timeout 2s else fail NotOpened(pos)
    let any = bot.window else fail NotOpened(pos)
    let w = any.cast<K>() else {
        close(any)
        fail WrongKind(pos)
    }
    return w
}
```

### 17.5 Inventory and recipes

`Inventory` is a snapshot of player slots 0–45 and offers `count(f: ItemFilter) -> Int`, `slots(f: ItemFilter) -> List<Int>` (ascending), `free_slots: Int`, `room_for(i: ItemType) -> Int`, `satisfies(r: CraftingRecipe, times: Int) -> Bool` and `plan(r: CraftingRecipe, times: Int) -> List<ItemType?>?`. Counting functions cover slots 9–45.

```golem
pub struct Ingredient(items: Set<ItemType>)
pub enum ProcessingKind { Smelting, Blasting, Smoking, Campfire }
pub struct CraftingRecipe(result: ItemStack, shapeless: Bool, width: Int, height: Int, cells: List<Ingredient?>)
pub struct ProcessingRecipe(kind: ProcessingKind, input: Ingredient, result: ItemStack, time: Duration)
pub struct StonecuttingRecipe(input: Ingredient, result: ItemStack)
```

A shaped recipe lists `width × height` cells row-major; a shapeless one has `width = height = 0` and lists only its ingredients. A recipe *fits* a station when, shaped, `width ≤ grid_width` and `height ≤ grid_height`, or, shapeless, `cells.len ≤ grid_width × grid_height`. A crafting table therefore also crafts 2×2 recipes, and the fn `r.fits_grid(w, h)` implements this test (decision 72).

**`satisfies(r, n)`** decides whether `n` crafts are possible at once, where each grid cell holds `n` units of one item type (one slot cannot mix types):

1. Let `C` be the non-`none` cells, in index order. Require `1 ≤ n ≤ 64`.
2. Build a flow network: source → each cell `c` with capacity 1; cell `c` → item type `t` with capacity 1 when `t ∈ c.items` and `t`'s maximum stack size is at least `n`; type `t` → sink with capacity `floor(count(t) / n)`.
3. `satisfies` is true exactly when the maximum flow equals `|C|`.

`plan(r, n)` returns the type assigned to each cell, or `none`. It runs augmenting paths by breadth-first search, visiting cells in index order and types in ascending id (§6.1), so the plan is deterministic. A greedy match would fail on overlapping tags such as `#minecraft:planks`.

**Recipe source.** `world.*_recipes_*` return the target version's vanilla recipes, supplied by the backend from its version data. A backend MAY add recipes the server announces. Datapack recipes the backend does not know are invisible, and crafting a recipe the server lacks fails with `Rejected`.

### 17.6 Events

| Event | Fields | Occurs when |
| --- | --- | --- |
| `spawned` | none | the bot joins or respawns |
| `died` | `cause: String` | the bot dies |
| `hurt` | `amount: Float, attacker: Entity?` | the bot takes damage |
| `entity_hurt` | `e: Entity, attacker: Entity?` | a tracked entity other than the bot takes damage; from the damage-event packet, so a compile error below Minecraft 1.19.4 (decision 88) |
| `chat` | `sender, text: String` | a player chat message arrives, including the bot's own |
| `whisper` | `sender, text: String` | a private message reaches the bot |
| `system` | `text: String` | a system message arrives |
| `entity_appeared` | `e: Entity` | an entity starts being tracked |
| `entity_gone` | `id: Int, kind: EntityType` | an entity stops being tracked |
| `item_collected` | `stack: ItemStack` | the bot picks up an item |
| `window_opened` | `menu_type: String` | a window opens |
| `window_closed` | none | the server closes the bot's window |

### 17.7 Composites (`golem.core`)

| Task | Contract summary |
| --- | --- |
| `goto(goal: Goal, attempts: Int = 3, opts: PathOpts = PathOpts())` | ensures `goal.reached`; retries `pathfind` after `Stalled`, `Rejected` or `NoPath`, up to `attempts` |
| `goto(pos: BlockPos)`, `goto(target: Entity, radius: Float = 2.0)` | wrappers over `Goal.At` and `Goal.NearEntity` (decision 14) |
| `follow(target: Entity, radius: Float = 3.0)` | ongoing; maintains `target.alive` else `EntityGone`; re-paths every `10t` |
| `look_at_block(pos: BlockPos)` | requires `bot.in_reach(pos)`; ensures aim within `1deg` of `bot.aim_point(pos)` |
| `equip(item: ItemFilter, hand: Hand = Hand.Main)` | ensures the hand's stack matches `item` |
| `place(item: ItemFilter, pos: BlockPos)` | §9.10; moves to `Goal.AllOf([InReach(support), Clear(pos)])` and clicks with `place_block`, so a refused placement fails `Rejected`; fails with `CannotPlace` when vanilla rules or another entity in the cell forbid the placement (decisions 68, 92) |
| `place_state(s: BlockState, pos: BlockPos)` | requires `s.block.item != none` else `NotPlaceable(s)`, and placement properties limited to axis, horizontal or full facing, slab type and stair or trapdoor half, else `UnsupportedState(s)`; chooses support face, aim point and a standing spot whose yaw gives the wanted facing, else `CannotPlace(pos)`; ensures `world.block(pos) matches BlockFilter.placed(s)` (decision 87) |
| `mine(pos: BlockPos, harvest: Bool = true)` | requires `!harvest \|\| bot.can_harvest(pos)` else `WrongTool(pos)`; moves into reach, equips the fastest tool among those that harvest (any tool when `harvest` is false), digs; ensures `world.block(pos) matches CLEARED` (decision 80) |
| `collect(f: ItemFilter, radius: Float) -> Int` | walks over matching dropped items within `radius`; returns how many it picked up, `0` if none; ensures the count of `f` rose by `result` (decision 70) |
| `consume(food: ItemFilter)` | below |
| `sleep(bed: BlockPos)` | ensures `bot.sleeping`; fails with `CannotSleep(bed)` when the bot is not asleep 2s after using the bed (decision 124) |
| `fight(target: Entity)` | `unchecked`; approaches and attacks on cooldown; timeout `30s` |
| `open<K: Screen>(pos: BlockPos) -> Window<K>` | §17.4 (decision 33) |
| `withdraw(w: Window<impl HasContainer>, item: ItemFilter, n: Int, exact: Bool = false) -> Int` | without `exact`, moves whole stacks until at least `n` items moved or none remain; with `exact`, moves exactly `min(n, available)`, splitting the last stack inside `atomic`; ensures the inventory count rose by `result` (decision 71) |
| `deposit(w: Window<impl HasContainer>, item: ItemFilter, n: Int, exact: Bool = false) -> Int` | the reverse of `withdraw` |
| `stash(chest: BlockPos, f: ItemFilter) -> Int` | walks to the chest, deposits every matching item, closes it; ensures no item matching `f` remains; fails with `ChestFull(chest)` (decision 78) |
| `craft<K: CraftingStation>(station: Window<K>, r: CraftingRecipe, times: Int)` | requires `r.fits_grid(K.grid_width(), K.grid_height())` else `NoRecipe`, and `bot.inventory.satisfies(r, times)` else `MissingIngredients`; ensures the result count rose by `r.result.count × times`; every cursor sequence runs in `atomic` |
| `craft_item<K: CraftingStation>(station: Window<K>, item: ItemFilter, n: Int)` | crafts one batch at a time with any usable recipe from `world.crafting_recipes_for(item)` until the inventory holds `n`; fails with `NoRecipe` if no recipe fits the grid, `MissingIngredients` if none is satisfiable (decision 73) |
| `craft(w: Window<Stonecutter>, r: StonecuttingRecipe, times: Int)` | concrete overload: the stonecutter has no grid (decision 33) |
| `load_smelter<K: Smelter>(pos: BlockPos, input: ItemFilter, n: Int, fuel: ItemFilter) -> Int` | opens a `K`, moves up to `n` matching items into the input slot and enough `fuel` for them by `world.burn_time`, closes it; requires the input slot empty or matching, else `SmelterBusy(pos)`; returns the count loaded (decision 83) |
| `empty_smelter<K: Smelter>(pos: BlockPos) -> Int` | opens a `K`, quick-moves the output, closes it; returns the count taken and the inventory count of that item rises by it; the item is unknown when `old` is evaluated, so the contract ensures only `result >= 0` (decision 128) |
| `smelt<K: Smelter>(pos: BlockPos, r: ProcessingRecipe, n: Int, fuel: ItemFilter = DEFAULT_FUEL)` | loads with `load_smelter`, waits with the window shut until `r.time × n` plus `10s` have passed or the block's `lit` state is false, then empties with `empty_smelter`; repeats while input remains and fewer than `n` crafts' results were taken; holds no resource while waiting, so reflexes run freely (decision 83); fails with `SmeltIncomplete(crafts)` when it stops before `n` crafts; `fuel` defaults to `DEFAULT_FUEL`, coal or charcoal (decisions 125, 127) |
| `cook_campfire(pos: BlockPos, r: ProcessingRecipe, n: Int)` | requires `r.kind == ProcessingKind.Campfire` and `n ≤ 4`; places items with `interact`, waits `r.time`, collects the dropped results, failing with `CookIncomplete(items)` when it collects fewer than it cooked (decision 125) |

```golem
@requires bot.food < 20 else fail NotHungry
@requires bot.inventory.count(food) > 0 else fail Missing(food, 1)
@ensures bot.inventory.count(food) < old(bot.inventory.count(food))
@timeout 10s
pub task consume(food: ItemFilter) {
    equip(food)
    let before = bot.inventory.count(food)
    with hold_use() {
        wait until bot.inventory.count(food) < before timeout 5s
    }
}
```

`hold_use` tolerates `10t` of not-using, which covers the tick between the item being eaten and the `with` body ending.

### 17.8 Reflexes (`golem.survival`)

```golem
from golem.prim import hold_jump, respawn, pathfind
from golem.core import consume, fight
from golem.filters import SAFE_FOOD, HOSTILE, FIGHTABLE, within, solid, air

const FIRE: BlockFilter = minecraft:fire | minecraft:soul_fire

fn threat(f: EntityFilter, d: Float) -> Entity? = world.nearest(f & within(d))

fn standable(p: BlockPos) -> Bool =
    world.block(p.below) matches solid() && world.block(p) matches air() && world.block(p.above) matches air()

fn dry_spot(r: Int) -> BlockPos? {
    let f = bot.feet
    for p in world.blocks(air(), Region(f - BlockPos(r, 2, r), f + BlockPos(r, 2, r))) {   // nearest first
        if standable(p) {
            return p
        }
    }
    return none
}

pub activity auto_eat(min_food: Int = 14, full: Int = 18, priority: Int = 50) {
    @priority priority
    when bot.food < min_food for 2s until bot.food >= full {
        consume(SAFE_FOOD)
    }
}

pub activity escape_lava(radius: Int = 8, priority: Int = 95) {
    @priority priority
    when bot.in_lava || world.block(bot.feet) matches FIRE until !bot.in_lava && !(world.block(bot.feet) matches FIRE) {
        let spot = dry_spot(radius) else { return }
        pathfind(Goal.At(spot), limit = 10s)
    }
}

pub activity flee_when_hurt(below: Float = 8.0, radius: Float = 12.0, priority: Int = 90) {
    @priority priority
    when (bot.health < below && threat(HOSTILE, radius) != none) || threat(minecraft:creeper, 5.0) != none until threat(HOSTILE, radius + 8.0) == none {
        let t = threat(HOSTILE, radius + 8.0) else { return }
        pathfind(Goal.Away(t.pos, radius + 8.0), limit = 15s)
    }
}

pub activity defend(radius: Float = 6.0, priority: Int = 80) {
    @priority priority
    when threat(FIGHTABLE, radius) != none for 5t until threat(FIGHTABLE, radius + 4.0) == none {
        let t = threat(FIGHTABLE, radius + 4.0) else { return }
        fight(t)
    }
}

pub activity stay_afloat(priority: Int = 70) {
    @priority priority
    when bot.in_water && bot.oxygen < 100 until !bot.in_water || bot.oxygen >= 300 {
        hold_jump()
    }
}

pub activity auto_respawn(delay: Duration = 1s, priority: Int = 1000) {
    @priority priority
    on died(_) {
        wait delay
        respawn()
    }
}
```

With the default `job_priority` of 0, every reflex preempts a job whose footprint it overlaps. A failed `consume`, such as eating with no food, puts `auto_eat` into backoff instead of refiring every tick.

Every reflex takes `priority` with the default shown, so a bot can reorder them without copying a number from this module: a braver guard writes `use flee_when_hurt(priority = 84)` below its own `@priority 85` (decision 89). `escape_lava` reacts to lava or a fire block at the feet, not to burning as such, because a burning bot on dry ground gains nothing by moving (decision 82). When no dry spot exists, its run returns at once and restarts in the next tick (§11.4, decision 135); it waits behind a pinned job for at most `atomic_limit` + 1 ticks (§15.3).

### 17.9 Module listings

The four std modules below give every declaration with its failure fields and full clauses (decisions 111–128), and they are the normative std surface (decision 131); `golem.survival` is listed in §17.8. Composite bodies are written out because Golem requires them and a composite's `uses` is inferred from its body. `Window` and `Inventory` members are built in and appear in Golem notation (decision 118).

```golem
// golem.prim: the 34 primitives of spec §17.1, listing (decisions 111–128).
//
// Runtime rules not visible in the declarations (§9.6, §17.1):
// - every primitive except `respawn` has an implicit first clause `@requires !bot.dead`;
// - every `Window` parameter `w` adds `@requires w.open else fail WindowClosed(task)`, except in `close`;
// - the class (instant, durative, ongoing) and the confirmation method are fixed per primitive and
//   noted in the comment above each declaration.

from golem.filters import breakable, CLEARED
from golem.windows import WindowKind, HasButtons, Screen, Merchant, Anvil

// ---------- failures ----------

pub failure NoPath(at: BlockPos)                 // decision 112: the bot's feet when no path was found
pub failure TooHungry(food: Int)
pub failure NotRiding
pub failure OutOfReach(pos: BlockPos)            // decision 113: for entities, the block holding the entity's feet
pub failure EntityGone(id: Int)
pub failure NotBreakable(pos: BlockPos)
pub failure BlockChanged(pos: BlockPos)
pub failure NotABlock(slot: Int)                 // decision 114: place_block with a held item that places no block
pub failure CannotPut(slot: Int)
pub failure NoRoom(slot: Int)
pub failure CursorNotEmpty
pub failure BadMessage(text: String)

// ---------- helpers for clauses ----------

fn count_in(s: ItemStack?) -> Int = s?.count ?? 0

fn window_total<K: WindowKind>(w: Window<K>) -> Int {
    var n = 0
    for i in 0..w.size {
        n += count_in(w.slot(i))
    }
    return n
}

fn sendable(text: String) -> Bool = text.len >= 1 && text.len <= 256

fn feet_of(e: Entity) -> BlockPos = BlockPos(floor(e.pos.x), floor(e.pos.y), floor(e.pos.z))

// ---------- movement ----------

// durative; confirmed by state + settle (decision 93)
@uses legs, head
@ensures goal.reached
@progress bot.path_progress increasing within 5s
@timeout limit
@fails NoPath
pub extern task pathfind(goal: Goal, limit: Duration = 2min, opts: PathOpts = PathOpts())

// durative; confirmed by state + settle; may dig when opts.dig and place items matching opts.scaffold (decision 93)
@uses legs, head, hands, inventory
@ensures goal.reached
@progress bot.path_progress increasing within 5s
@timeout limit
@fails NoPath
pub extern task pathfind_build(goal: Goal, limit: Duration = 2min, opts: BuildOpts = BuildOpts())

// ongoing; confirmed by settle
@uses stance
@maintains bot.sneaking tolerate 10t
pub ongoing extern task sneak()

// ongoing; confirmed by settle
@uses stance
@requires bot.food > 6 else fail TooHungry(bot.food)
@maintains bot.sprinting tolerate 10t
pub ongoing extern task sprint()

// ongoing; confirmed when sent
@uses legs
pub ongoing extern task hold_jump()

// ongoing; confirmed when sent
@uses legs
@requires bot.riding else fail NotRiding
pub ongoing extern task steer(forward: Float, sideways: Float)

// instant; confirmed by state
@uses legs
@requires bot.riding else fail NotRiding
@ensures !bot.riding
@timeout 1min
pub extern task dismount()

// durative; confirmed by settle
@uses head
@ensures bot.aim_error(target) <= 1deg
@timeout 2s
pub extern task look_at(target: Vec3)

// ---------- blocks ----------

// durative; confirmed by ack + state (§9.10)
@uses hands, head
@requires world.block(pos) matches breakable() else fail NotBreakable(pos)
@requires bot.in_reach(pos) else fail OutOfReach(pos)
@invariant world.block(pos) == old(world.block(pos)) else fail BlockChanged(pos)
@ensures world.block(pos) matches CLEARED
@timeout bot.dig_time(pos) + 2s
pub extern task dig(pos: BlockPos)

// instant; confirmed by ack
@uses hands, head
@requires bot.in_reach(pos) else fail OutOfReach(pos)
@timeout 1min
pub unchecked extern task interact(pos: BlockPos, face: Face)

// instant; confirmed by ack + state (block type at the target cell); a refusal fails Rejected (decision 92)
@uses hands, head
@requires bot.in_reach(support) else fail OutOfReach(support)
@requires bot.held?.item.block != none else fail NotABlock(bot.held_slot)    // decisions 114, 115
@ensures world.block(support.offset(face))?.block == old(bot.held?.item.block)
@timeout 1min
pub extern task place_block(support: BlockPos, face: Face)

// instant; confirmed by state
@uses hands, head
@requires world.block(pos) matches #minecraft:all_signs              // decision 116: needs 1.20+ for the tag
@requires lines.len == 4
@ensures world.sign_text(pos, front) == lines
@timeout 1min
pub extern task edit_sign(pos: BlockPos, front: Bool, lines: List<String>)

// ---------- entities ----------

// instant; confirmed when sent
@uses hands, head
@requires target.alive else fail EntityGone(target.id)
@requires bot.in_reach(target) else fail OutOfReach(feet_of(target))
@timeout 1min
pub unchecked extern task interact(target: Entity)

// instant; confirmed when sent
@uses hands, head
@requires target.alive else fail EntityGone(target.id)
@requires bot.in_reach(target) else fail OutOfReach(feet_of(target))
@timeout 1min
pub unchecked extern task attack(target: Entity)

// ---------- hands ----------

// instant; confirmed by ack
@uses hands
@timeout 1min
pub unchecked extern task use_item(hand: Hand = Hand.Main)

// ongoing; confirmed by settle
@uses hands
@maintains bot.using_item tolerate 10t
pub ongoing extern task hold_use(hand: Hand = Hand.Main)

// instant; confirmed by settle
@uses hands
@ensures bot.held == old(bot.offhand) && bot.offhand == old(bot.held)
@timeout 1min
pub extern task swap_hands()

// instant; confirmed by settle
@uses hands
@requires slot in 0..9
@ensures bot.held_slot == slot
@timeout 1min
pub extern task select_hotbar(slot: Int)

// ---------- windows (implicit: requires w.open else WindowClosed) ----------

// instant; confirmed by settle
@uses inventory, screen
@requires bot.cursor == none
@requires w.slot(slot) != none
@ensures bot.cursor?.item == old(w.slot(slot)?.item)
@ensures count_in(bot.cursor) == (if half then (old(count_in(w.slot(slot))) + 1) / 2 else old(count_in(w.slot(slot))))
@timeout 1min
pub extern task pick_up<K: WindowKind>(w: Window<K>, slot: Int, half: Bool = false)

// instant; confirmed by settle; never swaps (decision 15)
@uses inventory, screen
@requires bot.cursor != none
@requires match bot.cursor { none => false, c => w.accepts(slot, c) } else fail CannotPut(slot)
@ensures count_in(w.slot(slot)) - old(count_in(w.slot(slot))) == old(count_in(bot.cursor)) - count_in(bot.cursor)
@ensures !one || old(count_in(bot.cursor)) - count_in(bot.cursor) == 1
@timeout 1min
pub extern task put<K: WindowKind>(w: Window<K>, slot: Int, one: Bool = false)

// instant; confirmed by settle
@uses inventory, screen
@requires w.slot(slot) != none
@requires w.can_quick_move(slot) else fail NoRoom(slot)
@ensures count_in(w.slot(slot)) < old(count_in(w.slot(slot)))
@ensures window_total(w) == old(window_total(w))
@timeout 1min
pub extern task quick_move<K: WindowKind>(w: Window<K>, slot: Int)

// instant; confirmed by settle
@uses inventory, screen
@requires hotbar in 0..9
@ensures w.slot(slot) == old(w.slot(w.hotbar.start + hotbar)) && w.slot(w.hotbar.start + hotbar) == old(w.slot(slot))   // decision 117
@timeout 1min
pub extern task swap_hotbar<K: WindowKind>(w: Window<K>, slot: Int, hotbar: Int)

// instant; confirmed by settle
@uses inventory, screen
@requires w.slot(slot) != none
@ensures if all then w.slot(slot) == none else count_in(w.slot(slot)) == old(count_in(w.slot(slot))) - 1
@timeout 1min
pub irreversible extern task throw<K: WindowKind>(w: Window<K>, slot: Int, all: Bool = false)

// instant; confirmed by settle
@uses inventory, screen
@requires bot.cursor != none
@ensures bot.cursor == none
@timeout 1min
pub irreversible extern task throw_cursor<K: WindowKind>(w: Window<K>)

// instant; confirmed by settle
@uses inventory, screen
@timeout 1min
pub unchecked extern task click_button(w: Window<impl HasButtons>, id: Int)

// instant; confirmed by settle
@uses inventory, screen
@requires index in 0..w.trades.len
@ensures w.selected_trade == index
@timeout 1min
pub extern task select_trade(w: Window<Merchant>, index: Int)

// instant; confirmed by settle
@uses inventory, screen
@ensures w.rename_text == name
@timeout 1min
pub extern task rename(w: Window<Anvil>, name: String)

// instant; confirmed when sent; no implicit `requires w.open`: on a closed handle it completes without acting (decision 84)
@uses inventory, screen
@requires !w.open || bot.cursor == none else fail CursorNotEmpty
@ensures !w.open
@timeout 1min
pub extern task close(w: Window<impl Screen>)

// ---------- books ----------

// instant; confirmed when sent
@uses inventory
@requires bot.inventory_window.slot(slot) matches minecraft:writable_book
@timeout 1min
pub unchecked extern task write_book(slot: Int, pages: List<String>)

// instant; confirmed when sent
@uses inventory
@requires bot.inventory_window.slot(slot) matches minecraft:writable_book
@timeout 1min
pub unchecked irreversible extern task sign_book(slot: Int, title: String, pages: List<String>)

// ---------- life and chat ----------

// instant; confirmed by state; the only primitive without the implicit `requires !bot.dead`
@requires bot.dead
@ensures !bot.dead
@timeout 1min
pub extern task respawn()

// instant; confirmed by state
@uses legs
@requires bot.sleeping
@ensures !bot.sleeping
@timeout 1min
pub extern task leave_bed()

// instant; confirmed when sent
@requires sendable(text) && text.chars.first != "/" else fail BadMessage(text)
@timeout 1min
pub unchecked irreversible extern task chat(text: String)

// instant; confirmed when sent; text without the leading slash
@requires sendable(text) && text.chars.first != "/" else fail BadMessage(text)
@timeout 1min
pub unchecked irreversible extern task command(text: String)
```

```golem
// golem.windows: window kinds and capabilities of spec §17.4, listing (decisions 111–128).
// Window<K> and Inventory are prelude types; their members are built in. They are listed here as
// `extern fn` in impls bounded the way §17.4 bounds them (decision 118).

// ---------- capability traits ----------

pub trait WindowKind { fn menu_types() -> List<String> }
pub trait Screen: WindowKind {}
pub trait HasContainer: Screen {}
pub trait Smelter: Screen {}
pub trait HasButtons: Screen {}
pub trait CraftingStation: WindowKind {
    fn grid_width() -> Int
    fn grid_height() -> Int
}

// ---------- kinds: empty structs ----------

pub struct PlayerInventory()
pub struct Container()
pub struct Crafting()
pub struct Furnace()
pub struct BlastFurnace()
pub struct Smoker()
pub struct Stonecutter()
pub struct Loom()
pub struct Enchanting()
pub struct Anvil()
pub struct Grindstone()
pub struct CartographyTable()
pub struct Brewing()
pub struct Beacon()
pub struct Merchant()
pub struct Smithing()
pub struct MountInventory()
pub struct AnyKind()

impl WindowKind for PlayerInventory { fn menu_types() -> List<String> = [] }     // window 0
impl CraftingStation for PlayerInventory {
    fn grid_width() -> Int = 2
    fn grid_height() -> Int = 2
}

impl WindowKind for Container {
    fn menu_types() -> List<String> = ["minecraft:generic_9x1", "minecraft:generic_9x2", "minecraft:generic_9x3",
        "minecraft:generic_9x4", "minecraft:generic_9x5", "minecraft:generic_9x6", "minecraft:generic_3x3",
        "minecraft:shulker_box", "minecraft:hopper"]
}
impl Screen for Container {}
impl HasContainer for Container {}

impl WindowKind for Crafting { fn menu_types() -> List<String> = ["minecraft:crafting"] }
impl Screen for Crafting {}
impl CraftingStation for Crafting {
    fn grid_width() -> Int = 3
    fn grid_height() -> Int = 3
}

impl WindowKind for Furnace { fn menu_types() -> List<String> = ["minecraft:furnace"] }
impl Screen for Furnace {}
impl Smelter for Furnace {}
impl WindowKind for BlastFurnace { fn menu_types() -> List<String> = ["minecraft:blast_furnace"] }
impl Screen for BlastFurnace {}
impl Smelter for BlastFurnace {}
impl WindowKind for Smoker { fn menu_types() -> List<String> = ["minecraft:smoker"] }
impl Screen for Smoker {}
impl Smelter for Smoker {}

impl WindowKind for Stonecutter { fn menu_types() -> List<String> = ["minecraft:stonecutter"] }
impl Screen for Stonecutter {}
impl HasButtons for Stonecutter {}
impl WindowKind for Loom { fn menu_types() -> List<String> = ["minecraft:loom"] }
impl Screen for Loom {}
impl HasButtons for Loom {}
impl WindowKind for Enchanting { fn menu_types() -> List<String> = ["minecraft:enchantment"] }
impl Screen for Enchanting {}
impl HasButtons for Enchanting {}

impl WindowKind for Anvil { fn menu_types() -> List<String> = ["minecraft:anvil"] }
impl Screen for Anvil {}
impl WindowKind for Grindstone { fn menu_types() -> List<String> = ["minecraft:grindstone"] }
impl Screen for Grindstone {}
impl WindowKind for CartographyTable { fn menu_types() -> List<String> = ["minecraft:cartography_table"] }
impl Screen for CartographyTable {}
impl WindowKind for Brewing { fn menu_types() -> List<String> = ["minecraft:brewing_stand"] }
impl Screen for Brewing {}
impl WindowKind for Beacon { fn menu_types() -> List<String> = ["minecraft:beacon"] }
impl Screen for Beacon {}
impl WindowKind for Merchant { fn menu_types() -> List<String> = ["minecraft:merchant"] }
impl Screen for Merchant {}
impl WindowKind for Smithing { fn menu_types() -> List<String> = ["minecraft:smithing"] }
impl Screen for Smithing {}

// opened by the horse-screen packet, which has no menu type
impl WindowKind for MountInventory { fn menu_types() -> List<String> = [] }
impl Screen for MountInventory {}
impl HasContainer for MountInventory {}

// every menu type; used only by bot.window (decision 119: the list is the union of the kinds above)
impl WindowKind for AnyKind {
    fn menu_types() -> List<String> = ["minecraft:generic_9x1", "minecraft:generic_9x2", "minecraft:generic_9x3",
        "minecraft:generic_9x4", "minecraft:generic_9x5", "minecraft:generic_9x6", "minecraft:generic_3x3",
        "minecraft:shulker_box", "minecraft:hopper", "minecraft:crafting", "minecraft:furnace",
        "minecraft:blast_furnace", "minecraft:smoker", "minecraft:stonecutter", "minecraft:loom",
        "minecraft:enchantment", "minecraft:anvil", "minecraft:grindstone", "minecraft:cartography_table",
        "minecraft:brewing_stand", "minecraft:beacon", "minecraft:merchant", "minecraft:smithing"]
}
impl Screen for AnyKind {}

// ---------- merchant trades ----------

// decision 120: one villager offer as the merchant-offers packet sends it, without price internals
pub struct Trade(cost: ItemStack, cost2: ItemStack?, result: ItemStack, uses: Int, max_uses: Int, disabled: Bool)

// ---------- Window<K> members (built in) ----------

pub type SlotRange = Range

impl<K: WindowKind> Window<K> {
    pub extern fn open(self) -> Bool
    pub extern fn size(self) -> Int
    pub extern fn slot(self, i: Int) -> ItemStack?
    pub extern fn player_slots(self) -> SlotRange                 // decision 121
    pub extern fn hotbar(self) -> SlotRange
    pub extern fn property(self, i: Int) -> Int?
    pub extern fn accepts(self, slot: Int, s: ItemStack) -> Bool
    pub extern fn can_quick_move(self, slot: Int) -> Bool
    pub extern fn cast<J: WindowKind>(self) -> Window<J>?
    pub extern fn find(self, f: ItemFilter) -> Int?             // first matching slot of player_slots (decision 85)
}

impl<K: HasContainer> Window<K> {
    pub extern fn container(self) -> SlotRange
}

impl<K: CraftingStation> Window<K> {
    pub extern fn grid(self) -> SlotRange
    pub extern fn result_slot(self) -> Int
}

impl<K: Smelter> Window<K> {
    pub extern fn input_slot(self) -> Int
    pub extern fn fuel_slot(self) -> Int
    pub extern fn output_slot(self) -> Int
    pub extern fn cook_progress(self) -> Float                  // 0–1
    pub extern fn fuel_left(self) -> Float                      // 0–1
}

impl Window<Merchant> {
    pub extern fn trades(self) -> List<Trade>
    pub extern fn selected_trade(self) -> Int?
}

impl Window<Anvil> {
    pub extern fn rename_text(self) -> String?
    pub extern fn repair_cost(self) -> Int?
}

// ---------- Inventory members (built in, §17.5) ----------

impl Inventory {
    pub extern fn count(self, f: ItemFilter) -> Int              // slots 9–45
    pub extern fn slots(self, f: ItemFilter) -> List<Int>        // ascending
    pub extern fn free_slots(self) -> Int
    pub extern fn room_for(self, i: ItemType) -> Int
    pub extern fn satisfies(self, r: CraftingRecipe, times: Int) -> Bool
    pub extern fn plan(self, r: CraftingRecipe, times: Int) -> List<ItemType?>?
}
```

```golem
// golem.filters: filter leaves of spec §8.1 and standard filters of §8.6, listing (decisions 111–128).
// Leaves are data: a call builds a filter node, so leaf calls are constant expressions.
// The static members ItemFilter.of/named/ANY/NOTHING, BlockFilter.of/placed/ANY/NOTHING and
// EntityFilter.named/ANY/NOTHING belong to the prelude filter types and are built in.

// ---------- ItemFilter leaves ----------

pub extern fn damaged() -> ItemFilter
pub extern fn durability_at_least(n: Int) -> ItemFilter
pub extern fn has_component(id: String) -> ItemFilter
pub extern fn edible() -> ItemFilter                  // decision 122: new leaf, items with a food component

// ---------- BlockFilter leaves ----------

pub extern fn air() -> BlockFilter
pub extern fn liquid() -> BlockFilter
pub extern fn solid() -> BlockFilter
pub extern fn replaceable() -> BlockFilter
pub extern fn breakable() -> BlockFilter
pub extern fn prop(name: String, value: String) -> BlockFilter

// ---------- EntityFilter leaves ----------

pub extern fn within(d: Float) -> EntityFilter
pub extern fn is_player() -> EntityFilter
pub extern fn in_region(r: Region) -> EntityFilter
pub extern fn near(center: Vec3, d: Float) -> EntityFilter
pub extern fn hostile_type() -> EntityFilter          // decision 122: new leaf, the version's hostile mob list

// ---------- standard filters (§8.6, decision 97) ----------

pub const FOOD: ItemFilter = edible()
pub const SAFE_FOOD: ItemFilter = FOOD & !(minecraft:rotten_flesh | minecraft:spider_eye | minecraft:poisonous_potato |
    minecraft:pufferfish | minecraft:chicken | minecraft:suspicious_stew | minecraft:chorus_fruit |
    minecraft:golden_apple | minecraft:enchanted_golden_apple)
pub const HOSTILE: EntityFilter = hostile_type()
pub const FIGHTABLE: EntityFilter = HOSTILE & !minecraft:creeper & !minecraft:enderman
pub const CLEARED: BlockFilter = air() | liquid()
```

```golem
// golem.core: the composites of spec §17.7, listing (decisions 111–128).
// Bodies are a reference implementation: Golem requires one for every non-extern task, and the
// inferred `uses` of a composite comes from its body.

from golem.prim import pathfind, look_at, dig, interact, place_block, attack, hold_use, select_hotbar, swap_hands
from golem.prim import pick_up, put, quick_move, swap_hotbar, click_button, close
from golem.prim import NoPath, OutOfReach, EntityGone
from golem.windows import WindowKind, Screen, HasContainer, Smelter, CraftingStation, Container, Stonecutter
from golem.filters import replaceable, prop, within, CLEARED

// ---------- failures ----------

pub failure Missing(item: ItemFilter, n: Int)
pub failure NotReplaceable(pos: BlockPos)
pub failure NoSupport(pos: BlockPos)
pub failure CannotPlace(pos: BlockPos)
pub failure NotPlaceable(state: BlockState)
pub failure UnsupportedState(state: BlockState)
pub failure WrongTool(pos: BlockPos)
pub failure NotHungry
pub failure CannotSleep(bed: BlockPos)              // decision 124: §17.7 names no failure for sleep
pub failure ScreenBusy
pub failure NotOpened(pos: BlockPos)
pub failure WrongKind(pos: BlockPos)
pub failure ChestFull(chest: BlockPos)
pub failure NoRecipe(item: ItemFilter)
pub failure MissingIngredients(item: ItemFilter)
pub failure SmelterBusy(pos: BlockPos)
pub failure SmeltIncomplete(crafts: Int)            // decision 125: smelt stopped before n crafts
pub failure CookIncomplete(items: Int)              // decision 125: fewer campfire results collected than cooked

// ---------- placement and tool data from the backend (decision 126) ----------

pub struct Support(pos: BlockPos, face: Face)
pub struct Placement(support: BlockPos, face: Face, stand: BlockPos, look: Vec3)

// a solid neighbour of pos and the face of it to click, from version placement rules
pub extern fn support_face(pos: BlockPos) -> Support?
// support, face, standing cell and look point that place s at pos with its properties (decision 87)
pub extern fn placement_for(s: BlockState, pos: BlockPos) -> Placement?
// true when s sets only axis, horizontal or full facing, slab type and stair or trapdoor half
pub extern fn supported_state(s: BlockState) -> Bool
// the fastest inventory tool for pos, among those that harvest it when harvest is true; none for the bare hand
pub extern fn best_tool(pos: BlockPos, harvest: Bool) -> ItemType?
// the stonecutter button that selects r for the input currently in w
pub extern fn stonecutter_button(w: Window<Stonecutter>, r: StonecuttingRecipe) -> Int?

pub const DEFAULT_FUEL: ItemFilter = minecraft:coal | minecraft:charcoal     // decision 127

// ---------- helpers ----------

fn count_of(s: ItemStack?) -> Int = s?.count ?? 0

fn feet_of(e: Entity) -> BlockPos = BlockPos(floor(e.pos.x), floor(e.pos.y), floor(e.pos.z))

fn lit(pos: BlockPos) -> Bool = world.block(pos) matches prop("lit", "true")

fn ingredient_filter(i: Ingredient) -> ItemFilter {
    var f = ItemFilter.NOTHING
    for t in i.items {
        f = f | ItemFilter.of(t)
    }
    return f
}

fn free_slot<K: WindowKind>(w: Window<K>, r: SlotRange) -> Int? {
    for i in r {
        if w.slot(i) == none {
            return i
        }
    }
    return none
}

// the grid slot that receives cell c of r: shaped recipes sit in the top-left corner (decision 117)
fn grid_slot<K: CraftingStation>(w: Window<K>, r: CraftingRecipe, c: Int) -> Int =
    if r.shapeless then w.grid.start + c else w.grid.start + (c / r.width) * K.grid_width() + c % r.width

fn fitting(rs: List<CraftingRecipe>, w: Int, h: Int) -> List<CraftingRecipe> {
    var out: List<CraftingRecipe> = []
    for r in rs {
        if r.fits_grid(w, h) {
            out = out.push(r)
        }
    }
    return out
}

fn first_satisfiable(rs: List<CraftingRecipe>) -> CraftingRecipe? {
    for r in rs {
        if bot.inventory.satisfies(r, 1) {
            return r
        }
    }
    return none
}

// dropped item entities matching f within radius, nearest first (Entity.item: decision 123)
fn next_drop(f: ItemFilter, radius: Float) -> Entity? {
    for e in world.entities(minecraft:item & within(radius)) {
        if e.item matches f {
            return e
        }
    }
    return none
}

// items one fuel item smelts: furnaces cook one item per 10s of burn time (§17.2)
fn items_per_fuel(t: ItemType) -> Int {
    let burn = world.burn_time(t) else { return 0 }
    var n = 0
    repeat 128 {
        if 10s * (n + 1) <= burn {
            n += 1
        }
    }
    return n
}

// ---------- movement ----------

@ensures goal.reached
pub task goto(goal: Goal, attempts: Int = 3, opts: PathOpts = PathOpts()) {
    retry attempts on Stalled, Rejected, NoPath {
        pathfind(goal, opts = opts)
    }
}

@ensures bot.feet == pos
pub task goto(pos: BlockPos) {
    goto(Goal.At(pos))
}

@ensures Goal.NearEntity(target, radius).reached
pub task goto(target: Entity, radius: Float = 2.0) {
    goto(Goal.NearEntity(target, radius))
}

@maintains target.alive else fail EntityGone(target.id)
pub ongoing task follow(target: Entity, radius: Float = 3.0) {
    loop every 10t {
        let goal = Goal.NearEntity(target, radius)
        if !goal.reached {
            pathfind(goal, limit = 10t) catch {
                Timeout | Stalled | NoPath | Rejected => {}
            }
        }
    }
}

@requires bot.in_reach(pos) else fail OutOfReach(pos)
@ensures match bot.aim_point(pos) { none => false, p => bot.aim_error(p) <= 1deg }
@fails OutOfReach
pub task look_at_block(pos: BlockPos) {
    let p = bot.aim_point(pos) else fail OutOfReach(pos)
    look_at(p)
}

// ---------- inventory and hands ----------

@requires bot.inventory.count(item) > 0 else fail Missing(item, 1)
@ensures (if hand == Hand.Main then bot.held else bot.offhand) matches item
@fails Missing
pub task equip(item: ItemFilter, hand: Hand = Hand.Main) {
    if (if hand == Hand.Main then bot.held else bot.offhand) matches item {
        return
    }
    let inv = bot.inventory_window
    let s = inv.find(item) else fail Missing(item, 1)
    if s in inv.hotbar {
        select_hotbar(s - inv.hotbar.start)
    } else {
        swap_hotbar(inv, s, bot.held_slot)
    }
    if hand == Hand.Off {
        swap_hands()
    }
}

// ---------- blocks ----------

@requires world.block(pos) matches replaceable() else fail NotReplaceable(pos)
@requires bot.inventory.count(item) > 0 else fail Missing(item, 1)
@requires bot.can_place(item, pos) else fail CannotPlace(pos)
@ensures !(world.block(pos) matches replaceable())
@fails NoSupport, CannotPlace
pub task place(item: ItemFilter, pos: BlockPos) {
    let s = support_face(pos) else fail NoSupport(pos)
    equip(item)
    let spot = Goal.AllOf([Goal.InReach(s.pos), Goal.Clear(pos)])   // decision 92
    if !spot.reached {
        goto(spot)
    }
    if !bot.can_place(item, pos) {
        fail CannotPlace(pos)
    }
    place_block(s.pos, s.face)
}

@requires s.block.item != none else fail NotPlaceable(s)
@requires supported_state(s) else fail UnsupportedState(s)
@ensures world.block(pos) matches BlockFilter.placed(s)
@fails CannotPlace
pub task place_state(s: BlockState, pos: BlockPos) {
    let item = s.block.item else fail CannotPlace(pos)
    let p = placement_for(s, pos) else fail CannotPlace(pos)
    equip(ItemFilter.of(item))
    goto(Goal.At(p.stand))
    look_at(p.look)
    place_block(p.support, p.face)
}

@requires !harvest || bot.can_harvest(pos) else fail WrongTool(pos)
@ensures world.block(pos) matches CLEARED
pub task mine(pos: BlockPos, harvest: Bool = true) {
    if !bot.in_reach(pos) {
        goto(Goal.InReach(pos))
    }
    if let t = best_tool(pos, harvest) {
        equip(ItemFilter.of(t))
    }
    dig(pos)
}

@ensures bot.inventory.count(f) == old(bot.inventory.count(f)) + result
pub task collect(f: ItemFilter, radius: Float) -> Int {
    let before = bot.inventory.count(f)
    repeat 16 {
        let drop = next_drop(f, radius) else { break }
        goto(Goal.Near(feet_of(drop), 1.0)) catch {
            NoPath | Stalled | Timeout | Rejected => { break }
        }
        abort when !drop.alive {
            wait 1s
        }
    }
    return bot.inventory.count(f) - before
}

// ---------- survival ----------

@requires bot.food < 20 else fail NotHungry
@requires bot.inventory.count(food) > 0 else fail Missing(food, 1)
@ensures bot.inventory.count(food) < old(bot.inventory.count(food))
@timeout 10s
pub task consume(food: ItemFilter) {
    equip(food)
    let before = bot.inventory.count(food)
    with hold_use() {
        wait until bot.inventory.count(food) < before timeout 5s
    }
}

@ensures bot.sleeping
@fails OutOfReach, CannotSleep
pub task sleep(bed: BlockPos) {
    goto(Goal.InReach(bed))
    let face = bot.aim_face(bed) else fail OutOfReach(bed)
    interact(bed, face)
    wait until bot.sleeping timeout 2s else fail CannotSleep(bed)
}

// approaches and attacks on cooldown; 12t covers every vanilla weapon's attack cooldown
@timeout 30s
pub unchecked task fight(target: Entity) {
    repeat 60 {
        if !target.alive {
            return
        }
        if !bot.in_reach(target) {
            goto(target, radius = 2.0) catch {
                NoPath | Stalled | Rejected | Timeout => { return }
            }
        }
        attack(target) catch {
            EntityGone | OutOfReach => {}
        }
        wait 12t
    }
}

// ---------- windows ----------

@requires bot.window == none else fail ScreenBusy
@ensures result.open
@fails OutOfReach, NotOpened, WrongKind
pub task open<K: Screen>(pos: BlockPos) -> Window<K> {
    let face = bot.aim_face(pos) else fail OutOfReach(pos)
    interact(pos, face)
    wait until bot.window != none timeout 2s else fail NotOpened(pos)
    let any = bot.window else fail NotOpened(pos)
    let w = any.cast<K>() else {
        close(any)
        fail WrongKind(pos)
    }
    return w
}

// whole stacks until at least n moved or none remain; with exact, exactly min(n, available) (decision 71)
@requires n > 0
@ensures bot.inventory.count(item) == old(bot.inventory.count(item)) + result
pub task withdraw(w: Window<impl HasContainer>, item: ItemFilter, n: Int, exact: Bool = false) -> Int {
    let before = bot.inventory.count(item)
    for s in w.container {
        let moved = bot.inventory.count(item) - before
        if moved >= n {
            break
        }
        let st = w.slot(s) else { continue }
        if !(st matches item) {
            continue
        }
        if exact && moved + st.count > n {
            let free = free_slot(w, w.player_slots) else { break }
            atomic {
                pick_up(w, s)
                repeat st.count - (n - moved) {
                    put(w, s, one = true)
                }
                put(w, free)
            }
        } else {
            quick_move(w, s)
        }
    }
    return bot.inventory.count(item) - before
}

// the reverse of withdraw
@requires n > 0
@ensures bot.inventory.count(item) == old(bot.inventory.count(item)) - result
pub task deposit(w: Window<impl HasContainer>, item: ItemFilter, n: Int, exact: Bool = false) -> Int {
    let before = bot.inventory.count(item)
    for s in w.player_slots {
        let moved = before - bot.inventory.count(item)
        if moved >= n {
            break
        }
        let st = w.slot(s) else { continue }
        if !(st matches item) {
            continue
        }
        if exact && moved + st.count > n {
            let free = free_slot(w, w.container) else { break }
            atomic {
                pick_up(w, s)
                repeat st.count - (n - moved) {
                    put(w, s, one = true)
                }
                put(w, free)
            }
        } else {
            quick_move(w, s)
        }
    }
    return before - bot.inventory.count(item)
}

@ensures bot.inventory.count(f) == 0
@fails ChestFull
pub task stash(chest: BlockPos, f: ItemFilter) -> Int {
    let have = bot.inventory.count(f)
    if have == 0 {
        return 0
    }
    goto(Goal.InReach(chest))
    let w = open<Container>(chest)
    defer close(w)
    let n = deposit(w, f, have)
    if bot.inventory.count(f) > 0 {
        fail ChestFull(chest)
    }
    return n
}

// ---------- crafting ----------

// moves exactly n items matching f from the player slots into slot, one stack at a time
@requires n >= 0
@ensures count_of(w.slot(slot)) == old(count_of(w.slot(slot))) + n
@fails MissingIngredients
task fill_slot<K: WindowKind>(w: Window<K>, slot: Int, f: ItemFilter, n: Int) {
    var left = n
    while left > 0 decreasing left {
        let src = w.find(f) else fail MissingIngredients(f)
        let take = min(left, count_of(w.slot(src)))
        atomic {
            pick_up(w, src)
            repeat take {
                put(w, slot, one = true)
            }
            if bot.cursor != none {
                put(w, src)
            }
        }
        left -= take
    }
}

@requires times >= 1 && times <= 64
@requires r.fits_grid(K.grid_width(), K.grid_height()) else fail NoRecipe(ItemFilter.of(r.result.item))
@requires bot.inventory.satisfies(r, times) else fail MissingIngredients(ItemFilter.of(r.result.item))
@ensures bot.inventory.count(ItemFilter.of(r.result.item)) == old(bot.inventory.count(ItemFilter.of(r.result.item))) + r.result.count * times
@fails MissingIngredients
pub task craft<K: CraftingStation>(station: Window<K>, r: CraftingRecipe, times: Int) {
    let cells = bot.inventory.plan(r, times) else fail MissingIngredients(ItemFilter.of(r.result.item))
    var c = 0
    for cell in cells {
        if let t = cell {
            fill_slot(station, grid_slot(station, r, c), ItemFilter.of(t), times)
        }
        c += 1
    }
    quick_move(station, station.result_slot)    // every cell holds exactly `times`, so shift-click crafts `times`
}

@requires n > 0
@ensures bot.inventory.count(item) >= n
@fails NoRecipe, MissingIngredients
pub task craft_item<K: CraftingStation>(station: Window<K>, item: ItemFilter, n: Int) {
    while bot.inventory.count(item) < n decreasing n - bot.inventory.count(item) {
        let rs = fitting(world.crafting_recipes_for(item), K.grid_width(), K.grid_height())
        if rs.len == 0 {
            fail NoRecipe(item)
        }
        let r = first_satisfiable(rs) else fail MissingIngredients(item)
        craft(station, r, 1)
    }
}

// concrete overload: the stonecutter has no grid (decision 33); slot 0 is input, slot 1 output
@requires times >= 1 && times <= 64
@ensures bot.inventory.count(ItemFilter.of(r.result.item)) == old(bot.inventory.count(ItemFilter.of(r.result.item))) + r.result.count * times
@fails NoRecipe
pub task craft(w: Window<Stonecutter>, r: StonecuttingRecipe, times: Int) {
    fill_slot(w, 0, ingredient_filter(r.input), times)
    let b = stonecutter_button(w, r) else fail NoRecipe(ItemFilter.of(r.result.item))
    click_button(w, b)
    quick_move(w, 1)
}

// ---------- smelting ----------

@requires n > 0
@ensures result <= n
@fails SmelterBusy
pub task load_smelter<K: Smelter>(pos: BlockPos, input: ItemFilter, n: Int, fuel: ItemFilter) -> Int {
    goto(Goal.InReach(pos))
    let w = open<K>(pos)
    defer close(w)
    if !(w.slot(w.input_slot) == none || w.slot(w.input_slot) matches input) {
        fail SmelterBusy(pos)
    }
    let k = min(min(n, 64 - count_of(w.slot(w.input_slot))), bot.inventory.count(input))
    if k == 0 {
        return 0
    }
    fill_slot(w, w.input_slot, input, k)
    if let s = w.find(fuel) {
        let per = items_per_fuel(w.slot(s)?.item ?? minecraft:coal)
        let needed = if per == 0 then 0 else (k + per - 1) / per - count_of(w.slot(w.fuel_slot))
        if needed > 0 {
            fill_slot(w, w.fuel_slot, fuel, min(needed, bot.inventory.count(fuel)))
        }
    }
    return k
}

@ensures result >= 0                                  // decision 128: the output item is unknown when old() is evaluated
pub task empty_smelter<K: Smelter>(pos: BlockPos) -> Int {
    goto(Goal.InReach(pos))
    let w = open<K>(pos)
    defer close(w)
    let out = w.slot(w.output_slot) else { return 0 }
    let f = ItemFilter.of(out.item)
    let before = bot.inventory.count(f)
    quick_move(w, w.output_slot)
    return bot.inventory.count(f) - before
}

// holds no resource while waiting, so reflexes run freely (decision 83)
@requires n > 0
@ensures bot.inventory.count(ItemFilter.of(r.result.item)) >= old(bot.inventory.count(ItemFilter.of(r.result.item))) + r.result.count * n
@fails SmeltIncomplete
pub task smelt<K: Smelter>(pos: BlockPos, r: ProcessingRecipe, n: Int, fuel: ItemFilter = DEFAULT_FUEL) {
    let input = ingredient_filter(r.input)
    var done = 0
    repeat n {
        if done >= n {
            break
        }
        let k = load_smelter<K>(pos, input, n - done, fuel)
        if k == 0 {
            break
        }
        wait 1s                                       // the lit state follows loading by a tick or more
        abort when !lit(pos) {
            wait r.time * k + 10s
        }
        done += empty_smelter<K>(pos) / r.result.count
    }
    if done < n {
        fail SmeltIncomplete(done)
    }
}

@requires r.kind == ProcessingKind.Campfire && n >= 1 && n <= 4
@ensures bot.inventory.count(ItemFilter.of(r.result.item)) >= old(bot.inventory.count(ItemFilter.of(r.result.item))) + r.result.count * n
@fails OutOfReach, CookIncomplete
pub task cook_campfire(pos: BlockPos, r: ProcessingRecipe, n: Int) {
    let input = ingredient_filter(r.input)
    goto(Goal.InReach(pos))
    let face = bot.aim_face(pos) else fail OutOfReach(pos)
    repeat n {
        equip(input)
        interact(pos, face)
    }
    wait r.time + 1s
    let got = collect(ItemFilter.of(r.result.item), 4.0)
    if got < r.result.count * n {
        fail CookIncomplete(got)
    }
}
```

## 18. Compilation, IR and backends

The compiler turns a project into one self-contained IR file per bot; a runtime loads it and drives a backend through a small interface, so Mineflayer can later be swapped for azalea without touching programs. The IR schema and the typed backend interface are defined by the interface contracts, `@golem/contracts` 0.1.0 (`contracts/`).

### 18.1 Compiler pipeline

1. **Registry import.** The compiler loads registry, block-state and tag data for the project's version, produced once by the vanilla data generator (`java -DbundlerMainClass=net.minecraft.data.Main -jar server.jar --all`) and cached per version.
2. **Parse** with semicolon insertion (§3.6) into a syntax tree with source positions.
3. **Resolve** names and imports (§5).
4. **Type-check** every definition once, including generic ones; resolve overloads; type literals against registries (§6).
5. **Monomorphize** every generic fn, task and type that a bot reaches.
6. **Analyse**: the checks of §13, in table order.
7. **Lower** each task, handler and job root to a statechart (§18.3).
8. **Emit** one IR file per `bot`, containing only what that bot reaches.

### 18.2 IR

The IR is a JSON document, `<Bot>.golem-ir.json`, with no generics and no unresolved names.

| Section | Contents |
| --- | --- |
| `header` | IR format version, Golem version, Minecraft version, bot name, source hash |
| `types` | structs, enums, kinds, with field types |
| `failures`, `notices` | names and wire field types |
| `consts` | evaluated constant values |
| `fns` | typed expression trees; extern fns by name |
| `tasks` | parameters, result type, modifiers, clauses as expression trees, inferred `uses`, failure set, irreversibility, boundedness, and the statechart |
| `activities` | instances with bound parameters, `var` declarations, handlers (trigger, options, statechart) |
| `bot` | job signatures, start job, settings |
| `contracts` | every task's `requires` and `ensures`, as data, for external planners (decision 45) |

### 18.3 Statecharts

Each body becomes a hierarchical state machine (decision 1). Straight-line code between suspension points becomes transition actions. Each suspension point becomes a state: an extern call waiting for its verdict, a `wait`, a `wait until`, the pending limit, an async barrier, a `when … until` restart point, or a call into a composite, which nests the callee's machine. `abort when`, `try`, `retry`, `atomic`, `confirm async` and `defer` scopes become compound states. A `with` becomes a compound state with two parallel regions: the child strand and the body.

State ids are paths: `module.task#i.j.k`, where each number indexes a statement within its block, plus a region name inside compound statements (`#3.with.body.0`). An id stays stable as long as the statements before it on its path are unchanged. Snapshots, visualisation and persistence use these ids. Because calls are acyclic (§13.2), every bot's machine is finite.

### 18.4 Backend interface

The runtime owns the world model, the scheduler, contract checking and the extern fns (reach, ray casts, dig times, filters), computed from version data and the confirmed view. A backend only talks to the server:

| Operation | Called | Purpose |
| --- | --- | --- |
| `connect(launch)`, `disconnect()` | session | open and close the connection |
| `ingest() -> TickInput` | phase 1 | server changes with attribution, discrete events, action reports, infrastructure events |
| `start(action, primitive, args, mode) -> Delta?` | phase 6 | begin a primitive; in async mode return the predicted delta |
| `cancel(action)` | phases 2, 5, 6 | stop an action and release its inputs |
| `flush()` | phase 7 | send this tick's packets |

The tick clock is the backend's physics tick at 20 Hz. **Mineflayer mapping (first backend):** `pathfind` maps to mineflayer-pathfinder (`GoalBlock`, `GoalNear`, `GoalXZ`, `GoalY`, `GoalLookAtBlock`, `GoalFollow`, `GoalInvert`, `GoalCompositeAny`); `dig`, `look_at`, `attack`, `chat` and `respawn` to `bot.dig`, `bot.lookAt`, `bot.attack`, `bot.chat` and `bot.respawn`; `interact` to `bot.activateBlock` and `bot.activateEntity`; `sneak`, `sprint` and `hold_jump` to `bot.setControlState`; `hold_use` to `bot.activateItem` and `bot.deactivateItem`; `select_hotbar` to `bot.setQuickBarSlot`; `close` to `bot.closeWindow`. Window primitives map to `bot.clickWindow` with vanilla click modes: `pick_up` and `put` mode 0 (button 0 whole, button 1 half or one), `quick_move` mode 1, `swap_hotbar` mode 2, `throw` mode 4, and `throw_cursor` mode 0 on slot −999. The remaining primitives send their protocol packets directly. Each mapping is verified by the conformance suite rather than trusted.

`pathfind` gives mineflayer-pathfinder a `Movements` with digging off, an empty scaffolding list and `opts.avoid` as an exclusion area; `pathfind_build` sets digging from `opts.dig` and the scaffolding list from the items matching `opts.scaffold` (decision 93). `place_block` sends one use-item-on-block packet for the clicked face, without `bot.placeBlock`'s own wait, and reports the verdict from the ack and the block update (decision 92). `Goal.AllOf` maps to `GoalCompositeAll`; `Goal.Clear` has no pathfinder counterpart and is a custom goal that tests the bot's bounding box against the cell.

**Conformance suite.** For each primitive, against a version-pinned vanilla server: one success case, one case per `requires` failure, an injected rejection through a proxy that reverts the action, a delayed confirmation past `confirm_timeout`, and attribution checks with a second player changing the same keys. **Simulator.** A backend that replays recorded `TickInput` (§15.5) or generates it from a scripted world, with fault injection that drives every failure transition in a bot's IR at least once.

### 18.5 Persistence and reload

After every tick in which they changed, the runtime stores each activity instance's `var` values and each handler's backoff state, keyed by instance and var name or handler index (§11.6). On restart, a value is restored when the new IR has the same instance, name and type; otherwise the declared initial value is used and the mismatch is reported (`state_not_restored`, §16.2). Jobs are never persisted: tasks are restartable and the supervisor reassigns them.

A new IR may be loaded only while no job and no handler thread is running; state carries over by the same rule. Reloading a bot in the middle of a job is out of scope.

## 19. Worked example and deferred choices

The `woodcutting` module below, with the `Lumberjack` bot of §12, is a complete program that exercises jobs, contracts, catching, notices, windows and reflex preemption.

### 19.1 `src/woodcutting.golem`

```golem
from golem.core import goto, mine, collect, open, deposit
from golem.prim import close
from golem.windows import Container

pub failure NoTrees(area: Region)
pub failure NotEnoughLogs(have: Int)
pub notice LogMined(pos: BlockPos)

fn next_log(area: Region) -> BlockPos? = world.blocks(#minecraft:logs, area).first

@requires target > 0
@ensures result >= target
@fails NoTrees, NotEnoughLogs
pub task chop_trees(area: Region, target: Int) -> Int {
    repeat 4 * target {
        let have = bot.inventory.count(#minecraft:logs)
        if have >= target {
            return have
        }
        let log = next_log(area) else fail NoTrees(area)
        mine(log) catch {
            Interfered(_, _) | Rejected(_, _) => { continue }
        }
        collect(#minecraft:logs, 6.0) catch { _ => 0 }
        notify LogMined(log)
    }
    fail NotEnoughLogs(bot.inventory.count(#minecraft:logs))
}

@ensures bot.inventory.count(#minecraft:logs) == old(bot.inventory.count(#minecraft:logs)) - result
pub task stash_logs(chest: BlockPos) -> Int {
    goto(Goal.InReach(chest))
    let w = open<Container>(chest)
    defer close(w)
    return deposit(w, #minecraft:logs, 2304)
}
```

The area in §12 spans 48 × 20 × 48 = 46,080 positions, under the 65,536 limit of `world.blocks`. `chop_trees` is structurally bounded: `repeat` has a fixed count and every callee is bounded.

### 19.2 What happens at run time

1. The bot spawns; no supervisor has assigned anything, so the runtime starts `chop_trees` as the job at priority 10 (§12.1).
2. While `mine` digs, food drops below 14 and stays there for 2 s. `auto_eat` (priority 50) starts a thread whose footprint `hands, inventory, screen` overlaps the job's. The job is not pinned, so it freezes: the dig action is cancelled at the backend (§15.4).
3. `consume` eats. Each completed run restarts in the next tick while food is below 18 (§11.4); when food reaches 18, `until` holds and the thread ends. The job resumes: frame invariants are re-checked, and `dig` restarts with its `requires` re-checked and its timer reset.
4. Another player breaks the targeted log before the server confirms the bot's dig. `dig`'s invariant fails with `BlockChanged`, which unwinds out of `mine`. `chop_trees` does not catch `BlockChanged`, so the job fails and the supervisor sees `job_failed` with the trace, and can reassign. Adding `BlockChanged(_)` to the catch arm would make the job skip to the next log instead; that is the author's choice, and the failure is never silent either way.

### 19.3 Deferred choices

The syntax is frozen as written (decisions 96–128); renaming `task` to `action`, and whether the names Golem and `.golem` stay, are deferred past v0.2 and change nothing here.

- **Toolchain: decided.** TypeScript for compiler, runtime and backend, with Mineflayer as the first backend in the same Node.js process (decision 64). The JSON IR (§18.2) still allows a separate compiler or an azalea backend later.
- **Build order.** Lexer and parser with the golden corpus; type checker; IR and an interpreter running against the simulator (§18.4); then the Mineflayer backend and conformance suite.
- **Expression evaluation.** Tree-walking over IR expression trees is enough at 20 ticks per second; compiling to closures is an optimisation, not a requirement.
- **Click batching.** A click-merging optimiser fits as a backend concern inside `confirm async` blocks, behind the same verdict rules.

## Appendix A. Decisions 1–36

This appendix is normative and replaces the design log (decision 137). Each row restates a decision of the log at revision 16 as it binds in v0.2, with the later decisions that amend it, and names where the body of the spec applies it. Where a row and the body differ, the body wins (§0).

| # | Decision as it binds in v0.2 | Applied in |
| --- | --- | --- |
| 1 | Programs compile to hierarchical state machines (statecharts); sequential syntax is split into states at suspension points. This enables visualisation, static analysis and persistence without writing states by hand. | §9.9, §18.3 |
| 2 | Reliability over complexity: each bot does one task, and complexity scales through the number of bots and an external orchestrator. | §2, decision 45 |
| 3 | Time is measured in ticks, 20 per second, and guards are evaluated once per tick in a defined order, so semantics are deterministic and sessions can be replayed. | §15, §15.5 |
| 4 | Every task has a contract. The clauses are `requires`, `invariant`, `ensures`, `maintains`, `progress`, `timeout` and `fails`; 76 and 90 add `stalls_after` and `attaches`, and 63 writes them as annotations before the task. Every task has an `ensures` unless it is `unchecked` or ongoing (60). | §9.2, §9.3 |
| 5 | `requires` holds what is checkable before start, with its own failure (written `else fail F`, 100); `fails` lists only what is discovered while running. Each failure has exactly one typed origin. | §9.3, §9.5 |
| 6 | Every task is bounded: it declares `progress` or `timeout`, or is ongoing, and timeouts may be expressions. As amended by 11, a composite may instead be structurally bounded. | §9.2, §13.4 |
| 7 | `old(expr)` snapshots a value at frame start, after `requires` pass; a durative extern frame re-snapshots on restart. | §9.4 |
| 8 | `ensures` holds in the completion tick only; ongoing tasks use `maintains` with a `tolerate` window. | §9.3, §14.5 |
| 9 | A task without a meaningful postcondition is `unchecked` and declares no `ensures`; its callers establish their own. | §9.1 |
| 10 | A task's `fails` lists only the failures it raises directly; failures propagated from callees are inferred. | §9.5, §13.5 |
| 11 | Composites infer `uses`, irreversibility and boundedness from their bodies; 60 forbids writing them. | §9.1, §13.3, §13.4 |
| 12 | Infrastructure failures (`Disconnected`, `Kicked`, `Died`) are implicit and handled by the runtime; 62 makes them end every thread without running defers. | §12.3 |
| 13 | A task is a primitive only if it needs protocol access or computation the language cannot express; everything else lives in the std library. | §17, §17.9 |
| 14 | Pathfinding is a primitive taking a `Goal`, and every `goto` overload is a composite. 93 adds `pathfind_build` as the one primitive for routes that dig or scaffold. | §17.1, §17.3, §17.7 |
| 15 | Slot primitives expose a deterministic subset of click modes, so each has a precise `ensures`; `put` never swaps. | §17.1, §18.4 |
| 16 | Physical resources are claimed with `uses`, so the scheduler runs non-conflicting threads together and preempts only on conflict. 56 adds `screen` to `legs`, `head`, `hands`, `stance` and `inventory`. | §13.3, §15.3 |
| 17 | Confirmation is sync or async, chosen per scope (`confirm async`) or per call (`sync`). As refined by 54 and 39, sync is the default, confirmation is per primitive action, and `ensures` is evaluated on the view the body ran in. | §9.6, §10.8, §14.3 |
| 18 | On `Rejected` or `Unconfirmed`, later actions are cancelled, the machine returns to the state before the action, and it fails with that reason; nothing is re-run automatically, so the caller decides. 40 makes this per strand. | §14.4 |
| 19 | Rollback undoes the machine, not the world, because sent packets cannot be unsent; tasks must therefore be restartable. | §9.9, §14.4 |
| 20 | Irreversible tasks (`chat`, `command`, `throw` and others) wait for pending confirmations first; §14.4 limits this to the caller's own strand. | §14.4 |
| 21 | Events and triggers fire only on confirmed state, so predictions never cause preemption and rollback never undoes a handler. | §11.3, §14.2 |
| 22 | Overloads resolve by static types only, with no implicit conversions between `BlockPos`, `Vec3` and `Entity`, so each call maps to exactly one contract. | §6.7 |
| 23 | Recipes are data types, `CraftingRecipe` and `ProcessingRecipe` (85 adds `StonecuttingRecipe`), looked up at run time. Their source is the backend's version data, to which it MAY add recipes the server announces. | §17.5 |
| 24 | Constraints are traits; generic code is checked once at its definition and monomorphized, so instantiations never fail to compile. | §6.4 |
| 25 | Overload when contracts differ, go generic when they share a shape; a concrete overload beats a generic one, so generic contracts never get weaker. | §6.7 |
| 26 | A `fn` is pure, total and finishes within a tick; a `task` has effects. Trait members are fns only, so behaviour is never dispatched dynamically. Refined by 58: a fn may read the current view. | §6.5, §7.4 |
| 27 | Superseded by 96: the ambient bot is `bot` and a method's receiver is `self`; `this` is not a keyword. | §3.3, §7.6 |
| 28 | Filters are data, not closures, combined with operators for or, and and not, so they are serialisable and an orchestrator can send them. Refined by 38. | §8 |
| 29 | An `ItemFilter` depends only on the stack; an `EntityFilter` may depend on the observer and is never cached across ticks. | §8.1, §8.3 |
| 30 | Windows are typed `Window<K>`, and kind-specific regions require capability traits (`HasContainer`, `CraftingStation`, `Smelter`, `HasButtons`). | §17.4 |
| 31 | `impl Trait` in parameter position, default type parameters, return-type inference and static trait fns. Return types are inferred only for `fn f(…) = expr`, and a signature that calls static trait fns uses a named type parameter (73). | §6.4, §6.5 |
| 32 | A `Window` value is a handle to one opening; closing makes it stale for good. | §15.4, §17.4 |
| 33 | `open<K>` takes its kind explicitly, because the kind cannot be inferred from a `BlockPos`; it checks the opened window's kind and closes it with `WrongKind` otherwise. `smelt<K: Smelter>` needs an explicit kind, and the stonecutter, which has no grid, gets a concrete `craft` overload. | §17.4, §17.7 |
| 34 | Reflexes are activities: persistent sets of handlers that start ordinary threads, and `golem.survival` ships the common ones (eating, fleeing, fighting, staying afloat, respawning). Resolves Q3. Refined by 50 and 90. | §11, §17.8 |
| 35 | Modules are imported Python-style, `from module import name, name`, so every name has a visible source. | §5.2 |
| 36 | Superseded by 51: activities and every other declaration share one shape, `keyword name(params)`, with no arrow syntax. | §4.1 |
