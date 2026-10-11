# Coverage inventory

This file lists every construct of spec v0.2 that the interface contracts must encode, each with its § reference. It was written before any schema (working order, step 1). The **Covered by** column names the definition that encodes each row. `scripts/check-docs.mjs` fails `npm test` if a row is blank, still says `TODO`, or names a definition that does not exist.

Reference forms used in **Covered by**:

- `wire#/$defs/BlockPos`: a `$defs` entry of `schemas/wire.schema.json`. `ir/expr#/$defs/Call` is `schemas/ir/expr.schema.json`.
- `backend.d.ts#Backend`: an exported declaration of the hand-written `types/backend.d.ts`.
- `CONTRACTS.md#cli`: a heading anchor in `CONTRACTS.md`.

## 1. Expression forms (§4.1, §7, §8)

| Construct | § | Covered by |
| --- | --- | --- |
| `INT` literal | §3.4, §6.8 | `ir/expr#/$defs/ExprLit` |
| `FLOAT` literal | §3.4, §6.8 | `ir/expr#/$defs/ExprLit` |
| `STRING` literal | §3.4 | `ir/expr#/$defs/ExprLit` |
| String interpolation `"{e}"` via `Show` | §3.4, §7.3 | `ir/expr#/$defs/ExprInterp` |
| `DURATION` literal (`t s min h`) | §3.4 | `ir/expr#/$defs/ExprLit`, `wire#/$defs/Duration` |
| `ANGLE` literal (`deg rad`) | §3.4 | `ir/expr#/$defs/ExprLit`, `wire#/$defs/Angle` |
| `RESOURCE` literal as `ItemType`/`BlockType`/`EntityType` | §3.4, §6.8 | `ir/expr#/$defs/ExprLit`, `wire#/$defs/ResourceId` |
| `RESOURCE`/`TAG` literal as a filter | §6.8, §8.2 | `ir/expr#/$defs/ExprLit`, `wire#/$defs/ItemFilter`, `wire#/$defs/BlockFilter`, `wire#/$defs/EntityFilter` |
| `TAG` literal as `Tag<T>` | §3.4, §6.8 | `ir/expr#/$defs/ExprLit`, `wire#/$defs/Tag` |
| `BLOCKSTATE` literal | §3.4, §6.8 | `ir/expr#/$defs/ExprLit`, `wire#/$defs/BlockState` |
| `SELECTOR` literal `@e[…]` | §3.4, §8.5 | `ir/expr#/$defs/ExprLit`, `wire#/$defs/EntityFilter`, `wire#/$defs/SelectorBox` |
| `true`, `false` | §3.3 | `ir/expr#/$defs/ExprLit` |
| `none` | §6.2 | `ir/expr#/$defs/ExprLit` |
| Local binding reference (`let`, `var`, pattern binder) | §5.4, §10.1 | `ir/expr#/$defs/ExprLocal`, `ir/types#/$defs/LocalName` |
| Parameter reference | §5.4 | `ir/expr#/$defs/ExprParam` |
| Activity parameter reference | §5.4, §11.1 | `ir/expr#/$defs/ExprActivityParam` |
| Activity `var` reference | §11.2 | `ir/expr#/$defs/ExprActivityVar` |
| Const reference | §5.4, §7.5 | `ir/expr#/$defs/ExprConst`, `ir#/$defs/ConstDecl` |
| `self` | §4.1, §6.5 | `ir/expr#/$defs/ExprSelf` |
| `bot` ambient | §7.6 | `ir/expr#/$defs/ExprAmbient` |
| `world` ambient | §7.6 | `ir/expr#/$defs/ExprAmbient` |
| `old(e)` | §9.4 | `ir/expr#/$defs/ExprOld`, `ir#/$defs/Task` |
| `result` in `ensures` | §9.4 | `ir/expr#/$defs/ExprResult` |
| Struct field access `.f` | §6.3 | `ir/expr#/$defs/ExprField` |
| Property access (zero-argument member, no `()`) | §7.4 | `ir/expr#/$defs/ExprCall` |
| Method call `x.m(args)` | §6.5, §7.4 | `ir/expr#/$defs/ExprCall` |
| Free fn call, named arguments, defaults | §7.4, §9.9 | `ir/expr#/$defs/ExprCall`, `ir/types#/$defs/Param` |
| Static fn call `ItemFilter.of(t)` | §6.5, §8.1 | `ir/expr#/$defs/ExprCall` |
| Static trait fn call `K.grid_width()` (after monomorphization) | §6.4, §6.5 | `ir/expr#/$defs/ExprCall`, `CONTRACTS.md#names` |
| Associated const `ItemFilter.ANY` | §5.5, §6.5 | `ir/expr#/$defs/ExprConst`, `wire#/$defs/ItemFilter` |
| Type arguments in expressions `cast<K>()`, `Set<Int>()` | §4.2 | `ir/expr#/$defs/ExprCall`, `ir/types#/$defs/QualifiedName` |
| Extern fn call by name | §7.4, §18.2 | `ir/expr#/$defs/ExprCall`, `ir#/$defs/Fn` |
| Optional chaining `?.` | §7.2, decision 105 | `ir/expr#/$defs/ExprOpt` |
| `??` | §7.2 | `ir/expr#/$defs/ExprCoalesce` |
| Index `xs[i]` | §7.1, §7.3 | `ir/expr#/$defs/ExprIndex` |
| Unary `-`, `!` | §7.2 | `ir/expr#/$defs/ExprUnary` |
| Arithmetic `+ - * / %` (incl. `Duration`, `Vec3`, `Angle`, `BlockPos`, `String`, `List`) | §7.2 | `ir/expr#/$defs/ExprBinary`, `ir/expr#/$defs/OpTarget` |
| Comparison `== != < <= > >=` | §7.2 | `ir/expr#/$defs/ExprBinary` |
| `matches` | §7.2, §8.3 | `ir/expr#/$defs/ExprBinary` |
| `in` | §7.2 | `ir/expr#/$defs/ExprBinary` |
| `&&`, `\|\|` (short-circuit) | §7.1 | `ir/expr#/$defs/ExprLogic` |
| Filter combinators `\|`, `&`, `!` | §8.2 | `ir/expr#/$defs/ExprBinary`, `ir/expr#/$defs/ExprUnary`, `wire#/$defs/ItemFilter` |
| Range `..`, `..=` | §7.2 | `ir/expr#/$defs/ExprBinary` |
| `if … then … else` | §4.1 | `ir/expr#/$defs/ExprIf` |
| `match` expression with guards | §4.1, decision 109 | `ir/expr#/$defs/ExprMatch`, `ir/expr#/$defs/MatchArm` |
| List literal `[a, b]` | §7.3 | `ir/expr#/$defs/ExprList` |
| `Set(items)` constructor | §7.3, decision 133 | `ir/expr#/$defs/ExprSetNew` |
| `Map(entries)` constructor | §7.3, decision 133 | `ir/expr#/$defs/ExprMapNew` |
| Struct construction (defaults filled) | §6.3 | `ir/expr#/$defs/ExprStruct` |
| Enum variant construction `Goal.At(p)`, `Face.Up` | §6.3 | `ir/expr#/$defs/ExprVariant` |
| Built-in value construction `BlockPos(…)`, `Vec3(…)`, `Region(…)` | §6.1 | `ir/expr#/$defs/ExprStruct` |
| Generated `copy(field = …)` | §6.3 | `ir/expr#/$defs/ExprCopy` |
| Resolved overload target on calls and operators | §6.7 | `ir/expr#/$defs/ExprCall`, `ir/expr#/$defs/OpTarget` |
| Resolved type on every node | §18.2 | `ir/expr#/$defs/Expr`, `ir/types#/$defs/TypeRef` |
| Source span on every node | §18.2 | `ir/types#/$defs/Span` |
| Pattern `_` | §4.1 | `ir/expr#/$defs/PWild` |
| Pattern `none` | §4.1 | `ir/expr#/$defs/PNone` |
| Pattern binder `IDENT` | §4.1 | `ir/expr#/$defs/PBind` |
| Literal pattern | §4.1 | `ir/expr#/$defs/PLit` |
| Variant pattern, qualified or not, bare or with fields | §4.1, decision 101 | `ir/expr#/$defs/PVariant` |
| Pattern alternatives `A \| B` | §4.1 | `ir/expr#/$defs/PAlt` |

## 2. Statement forms (§4.1, §10)

| Construct | § | Covered by |
| --- | --- | --- |
| `let x = e` / `var x = e` | §10.1 | `ir/stmt-actions#/$defs/ABind`, `ir/stmt-actions#/$defs/SBind` |
| `let _ = e` | §10.1 | `ir/stmt-actions#/$defs/AEval`, `ir/stmt-actions#/$defs/SEval` |
| `let x = e else fail F` | §10.1 | `ir/statechart#/$defs/StateChoice`, `ir/stmt-actions#/$defs/AFail`, `ir/expr#/$defs/ExprIsNone`, `ir/expr#/$defs/ExprUnwrap` |
| `let x = e else { diverging block }` | §10.1 | `ir/statechart#/$defs/StateChoice`, `ir/stmt-actions#/$defs/SLetElse` |
| Assignment `= += -= *=` to a local | §10.1 | `ir/stmt-actions#/$defs/AAssign`, `ir/stmt-actions#/$defs/SAssign` |
| Assignment to an activity `var` | §10.1, §11.2 | `ir/stmt-actions#/$defs/AAssign` |
| `if` / `else if` / `else` | §10.2 | `ir/statechart#/$defs/StateChoice`, `ir/stmt-actions#/$defs/SIf` |
| `if let x = e` | §10.2 | `ir/statechart#/$defs/StateChoice`, `ir/stmt-actions#/$defs/Branch` |
| `match` statement | §10.2, decision 108 | `ir/statechart#/$defs/StateChoice`, `ir/stmt-actions#/$defs/SMatch` |
| `for x in e` (List, Set, Range, Map keys) | §10.2 | `ir/stmt-actions#/$defs/AIterInit`, `ir/stmt-actions#/$defs/AIterNext`, `ir/stmt-actions#/$defs/SFor`, `ir/expr#/$defs/ExprIterMore` |
| `repeat n` | §10.2 | `ir/stmt-actions#/$defs/ACounterInit`, `ir/stmt-actions#/$defs/ACounterStep`, `ir/stmt-actions#/$defs/SRepeat` |
| `while c decreasing v [by m]` | §10.2 | `ir/stmt-actions#/$defs/AVariant`, `ir/stmt-actions#/$defs/SWhile` |
| `loop every D` | §10.2 | `ir/statechart#/$defs/StateLoopEvery` |
| `break`, `continue` | §10.2 | `ir/statechart#/$defs/Transition`, `ir/stmt-actions#/$defs/SBreak`, `ir/stmt-actions#/$defs/SContinue` |
| `return [e]` | §10.2 | `ir/stmt-actions#/$defs/AReturn`, `ir/stmt-actions#/$defs/SReturn`, `ir/statechart#/$defs/StateFinal` |
| `wait D` | §10.3 | `ir/statechart#/$defs/StateWait` |
| `wait until c timeout D [else fail F]` | §10.3 | `ir/statechart#/$defs/StateWaitUntil` |
| `abort when c { B }` | §10.4 | `ir/statechart#/$defs/StateAbort` |
| `with t(args) { B }` | §10.4 | `ir/statechart#/$defs/StateWith` |
| `defer t(args)` | §10.4 | `ir/stmt-actions#/$defs/ADefer`, `ir/statechart#/$defs/StateScope` |
| `fail F(args)` | §10.5 | `ir/stmt-actions#/$defs/AFail`, `ir/stmt-actions#/$defs/FailureCtor` |
| `try { B } catch { arms }` | §10.5 | `ir/statechart#/$defs/StateTry`, `ir/statechart#/$defs/FailureTransition` |
| `t(args) catch { arms }` (postfix) | §10.5 | `ir/statechart#/$defs/StateTry` |
| Catch-arm patterns (`Name`, `Name(binders)`, `A \| B`, `_`) | §10.5, decision 101 | `ir/statechart#/$defs/FailPattern` |
| `retry n on F1, F2 { B }` | §10.5, decision 69 | `ir/statechart#/$defs/StateRetry`, `ir/stmt-actions#/$defs/ACounterInit` |
| `atomic { B }` | §10.7 | `ir/statechart#/$defs/StateAtomic` |
| `confirm async { B }` | §10.8 | `ir/statechart#/$defs/StateAsync`, `ir/statechart#/$defs/StateBarrier`, `ir/statechart#/$defs/StatePending` |
| `sync t(args)` inside `confirm async` | §10.8 | `ir/statechart#/$defs/StateExternCall` |
| `notify N(args)` | §10.9 | `ir/stmt-actions#/$defs/ANotify`, `ir/types#/$defs/NoticeDecl` |
| `heartbeat` | §9.3, decision 76 | `ir/stmt-actions#/$defs/AHeartbeat` |
| Task-call expression statement | §9.9 | `ir/statechart#/$defs/StateExternCall`, `ir/statechart#/$defs/StateCompositeCall` |
| fn bodies (statements without suspension) | §7.4 | `ir/stmt-actions#/$defs/FnStmt`, `ir#/$defs/FnBody` |

## 3. Statechart constructs (§18.3, §10.6, §11.4)

| Construct | § | Covered by |
| --- | --- | --- |
| Statechart per task, handler and job root | §18.1 step 7 | `ir/statechart#/$defs/Statechart`, `ir#/$defs/Task`, `ir#/$defs/Job`, `ir/handlers#/$defs/Handler` |
| Atomic state: extern call awaiting its verdict | §18.3 | `ir/statechart#/$defs/StateExternCall` |
| Atomic state: `wait` | §18.3 | `ir/statechart#/$defs/StateWait` |
| Atomic state: `wait until` | §18.3 | `ir/statechart#/$defs/StateWaitUntil` |
| Atomic state: pending limit (`max_pending`) | §14.3, §18.3 | `ir/statechart#/$defs/StatePending` |
| Atomic state: async barrier | §14.3, §18.3 | `ir/statechart#/$defs/StateBarrier` |
| Atomic state: `when … until` restart point | §11.4, §18.3, decision 135 | `ir/statechart#/$defs/StateRestart` |
| Composite call, callee nested by reference | §18.3 | `ir/statechart#/$defs/StateCompositeCall` |
| Compound state: `abort when` | §18.3 | `ir/statechart#/$defs/StateAbort` |
| Compound state: `try` and catch postfix | §18.3 | `ir/statechart#/$defs/StateTry` |
| Compound state: `retry` | §18.3 | `ir/statechart#/$defs/StateRetry` |
| Compound state: `atomic` | §18.3 | `ir/statechart#/$defs/StateAtomic` |
| Compound state: `confirm async` | §18.3 | `ir/statechart#/$defs/StateAsync` |
| Compound state: `defer` scope and deferred-call states | §18.3, §10.4 | `ir/statechart#/$defs/StateScope`, `ir/statechart#/$defs/StateExternCall`, `ir/stmt-actions#/$defs/ADefer` |
| Parallel state: `with` (child strand and body regions) | §18.3, §10.4 | `ir/statechart#/$defs/StateWith` |
| Choice pseudo-state (branching and loop heads) | §18.3 | `ir/statechart#/$defs/StateChoice` |
| Final state (completion and `return`) | §9.7 | `ir/statechart#/$defs/StateFinal` |
| Transition with guard | §18.3 | `ir/statechart#/$defs/Transition` |
| Transition actions for straight-line code | §18.3 | `ir/stmt-actions#/$defs/Action` |
| Failure-pattern transitions (catch arms) | §10.5 | `ir/statechart#/$defs/FailureTransition`, `ir/statechart#/$defs/FailPattern` |
| Unwinding order (defers, child strands, outer checks) | §10.6 | `CONTRACTS.md#unwinding` |
| Frame locals and `old` snapshot slots | §9.4, §14.4 | `ir/statechart#/$defs/Statechart`, `ir#/$defs/Task`, `ir/expr#/$defs/ExprOld` |
| Handler states Idle, Active, Backoff, disabled | §11.4 | `ir/handlers#/$defs/HandlerState`, `reply#/$defs/InstanceSnapshot` |
| State-id grammar `module.task#i.j.k` with region segments | §18.3 | `ir/statechart#/$defs/StateId`, `CONTRACTS.md#state-ids` |
| State-id stability rule | §18.3 | `CONTRACTS.md#state-ids` |

## 4. Tasks, clauses and modifiers (§9)

| Construct | § | Covered by |
| --- | --- | --- |
| Modifier `extern` and primitive class (instant, durative, ongoing) | §9.1, §9.6 | `ir#/$defs/Task` |
| Modifier `ongoing` | §9.1 | `ir#/$defs/Task` |
| Modifier `unchecked` | §9.1 | `ir#/$defs/Task` |
| Modifier `irreversible`, declared or inferred | §9.1 | `ir#/$defs/Task` |
| Clause `@uses` (declared) and inferred `uses` | §9.2, §13.3 | `ir#/$defs/Task`, `ir/types#/$defs/ResourceSet` |
| Clause `@requires E [else fail F]` | §9.3 | `ir#/$defs/RequiresClause` |
| Clause `@invariant E [else fail F]` | §9.3 | `ir#/$defs/InvariantClause` |
| Clause `@ensures E` (point-in-time) | §9.3, §14.5 | `ir#/$defs/EnsuresClause`, `ir#/$defs/ContractFact` |
| Clause `@maintains E [tolerate D] [else fail F]` | §9.3 | `ir#/$defs/MaintainsClause` |
| Clause `@progress M increasing\|decreasing [by m] within W` | §9.3 | `ir#/$defs/ProgressClause` |
| Clause `@timeout D` | §9.3 | `ir#/$defs/TimeoutClause` |
| Clause `@fails F, …` | §9.5 | `ir#/$defs/Clauses` |
| Clause `@stalls_after D` | §9.3, decision 76 | `ir#/$defs/StallsAfterClause` |
| Clause `@attaches a(args)` | §11.7, decision 90 | `ir#/$defs/AttachesClause`, `ir/handlers#/$defs/ActivityInstance` |
| Implicit clause `requires !bot.dead` | §9.6 | `ir#/$defs/RequiresClause` |
| Implicit clause `requires w.open else fail WindowClosed` | §17.1 | `ir#/$defs/RequiresClause` |
| Clause source text (for `Unmet`/`Broken` fields) | §9.3 | `ir#/$defs/RequiresClause` |
| Inferred failure set | §13.5 | `ir#/$defs/Task` |
| Boundedness and may-pin flags | §13.4, §15.1 | `ir#/$defs/Task` |
| `contracts` section for planners | §18.2, decision 45 | `ir#/$defs/Contract`, `ir#/$defs/ContractFact` |

## 5. Activities, handlers and bots (§11, §12)

| Construct | § | Covered by |
| --- | --- | --- |
| Trigger `on Event(binders) [if g]` | §11.3 | `ir/handlers#/$defs/OnEvent` |
| Trigger `on enter c` | §11.3 | `ir/handlers#/$defs/OnEnter` |
| Trigger `on exit c` | §11.3 | `ir/handlers#/$defs/OnExit` |
| Trigger `when c [for D] [until u]` | §11.3, §11.4 | `ir/handlers#/$defs/When` |
| Trigger `every D` | §11.4, decision 95 | `ir/handlers#/$defs/Every` |
| Option `@priority` | §11.5 | `ir/handlers#/$defs/HandlerOptions` |
| Option `@backoff` | §11.5 | `ir/handlers#/$defs/HandlerOptions` |
| Option `@queue` | §11.5 | `ir/handlers#/$defs/HandlerOptions` |
| Activity `var` declarations | §11.2 | `ir/handlers#/$defs/VarDecl` |
| Activity instance with bound parameters (`use … as name`) | §12.1 | `ir/handlers#/$defs/ActivityInstance` |
| `@attaches` instance (job-scoped) | §11.7 | `ir/handlers#/$defs/ActivityInstance`, `ir#/$defs/Job` |
| Handler order | §11.6 | `ir/handlers#/$defs/Handler`, `ir#/$defs/Bot` |
| `jobs` and job signatures | §12.1 | `ir#/$defs/Job`, `report#/$defs/JobSignature` |
| `start` job with wire-encoded args | §12.1 | `ir#/$defs/StartJob` |
| Setting `job_priority` | §12.2 | `ir#/$defs/Settings` |
| Setting `confirm_timeout` | §12.2 | `ir#/$defs/Settings` |
| Setting `max_pending` | §12.2 | `ir#/$defs/Settings` |
| Setting `atomic_limit` | §12.2 | `ir#/$defs/Settings` |
| Setting `reconnect_delay` | §12.2 | `ir#/$defs/Settings` |
| Setting `max_reconnects` | §12.2 | `ir#/$defs/Settings` |
| IR `header` | §18.2 | `ir#/$defs/Header`, `ir/types#/$defs/SourceFile` |
| IR `types` (structs, enums, kinds) | §18.2 | `ir/types#/$defs/TypeDecl`, `ir/types#/$defs/StructDecl`, `ir/types#/$defs/EnumDecl`, `ir/types#/$defs/WindowKindInfo` |
| IR `failures`, `notices` | §18.2 | `ir/types#/$defs/FailureDecl`, `ir/types#/$defs/NoticeDecl` |
| IR `consts` (evaluated) | §18.2 | `ir#/$defs/ConstDecl` |
| IR `fns` (bodies and extern fns by name) | §18.2 | `ir#/$defs/Fn`, `ir#/$defs/FnBody` |
| Fully qualified names, monomorphized instances | §6.4, §18.2 | `ir/types#/$defs/QualifiedName`, `CONTRACTS.md#names` |
| Type-reference encoding | §18.2 | `ir/types#/$defs/TypeRef`, `CONTRACTS.md#type-references` |
| No embedded registries or version data | §18.1 | `ir#/$defs/Ir`, `CONTRACTS.md#ir` |

## 6. Wire values (§6.9, §8.4)

| Construct | § | Covered by |
| --- | --- | --- |
| `Unit` | §6.9 | `wire#/$defs/Unit` |
| `Bool` | §6.9 | `wire#/$defs/Bool` |
| `Int` bounded to \|n\| ≤ 2^53 − 1 | §6.9, decision 65 | `wire#/$defs/Int` |
| `Float` | §6.9 | `wire#/$defs/Float` |
| `String` | §6.9 | `wire#/$defs/WireString` |
| `Duration` | §6.9 | `wire#/$defs/Duration` |
| `Angle` | §6.9 | `wire#/$defs/Angle` |
| `BlockPos` | §6.9 | `wire#/$defs/BlockPos` |
| `Vec3` | §6.9 | `wire#/$defs/Vec3` |
| `Region` | §6.9 | `wire#/$defs/Region` |
| `Range`, `SlotRange` | §6.9 | `wire#/$defs/Range`, `wire#/$defs/SlotRange` |
| `ItemType`, `BlockType`, `EntityType` | §6.9 | `wire#/$defs/ItemType`, `wire#/$defs/BlockType`, `wire#/$defs/EntityType` |
| `Tag<T>` | §6.9 | `wire#/$defs/Tag` |
| `BlockState` | §6.9 | `wire#/$defs/BlockState` |
| `ItemStack` | §6.9 | `wire#/$defs/ItemStack` |
| Struct (incl. `Entry`) | §6.9 | `wire#/$defs/StructValue` |
| Enum variant without fields | §6.9 | `wire#/$defs/EnumValue` |
| Enum variant with fields | §6.9 | `wire#/$defs/EnumValue` |
| `List<T>` | §6.9 | `wire#/$defs/ListValue` |
| `Set<T>` (ascending, duplicate-free) | §6.9 | `wire#/$defs/SetValue` |
| `Map<String, V>` | §6.9 | `wire#/$defs/StringKeyedMapValue` |
| Other `Map<K, V>` (ascending pairs) | §6.9 | `wire#/$defs/PairMapValue` |
| `T?` | §6.9 | `wire#/$defs/OptionalValue` |
| Filter `any` (`\|`), `all` (`&`), `not` (`!`) | §8.4 | `wire#/$defs/ItemFilter`, `wire#/$defs/BlockFilter`, `wire#/$defs/EntityFilter` |
| Item leaves: item, tag, ANY, NOTHING, `damaged`, `durability_at_least`, `named`, `has_component`, `edible`, `of` | §8.1, §8.4 | `wire#/$defs/ItemFilter`, `wire#/$defs/NoArgs`, `wire#/$defs/TagLeafId` |
| Block leaves: block, state, tag, ANY, NOTHING, `air`, `liquid`, `solid`, `replaceable`, `breakable`, `prop`, `of`, `placed` | §8.1, §8.4 | `wire#/$defs/BlockFilter`, `wire#/$defs/NoArgs` |
| Entity leaves: type, tag, ANY, NOTHING, `within`, `named`, `is_player`, `hostile_type`, `in_region`, `near` | §8.1, §8.4 | `wire#/$defs/EntityFilter`, `wire#/$defs/NoArgs` |
| Selector arguments `type= distance= name= x/y/z/dx/dy/dz= team=` | §8.5 | `wire#/$defs/EntityFilter`, `wire#/$defs/SelectorBox` |
| Failure value (type, fields) | §16.1, §16.2 | `wire#/$defs/FailureValue`, `wire#/$defs/FailureBody`, `wire#/$defs/UserFailure` |
| Built-in failures | §16.1 | `wire#/$defs/BuiltinFailure`, `wire#/$defs/ClauseFailure`, `wire#/$defs/TaskFieldFailure`, `wire#/$defs/RejectedFailure`, `wire#/$defs/InterferedFailure`, `wire#/$defs/DefectFailure`, `wire#/$defs/InfrastructureFailure` |
| `Defect` kinds | §7.1 | `wire#/$defs/DefectKind` |

## 7. World keys (§14.1)

| Construct | § | Covered by |
| --- | --- | --- |
| Canonical key string grammar | §14.1, §16.1 (`Interfered.key`) | `world#/$defs/WorldKey`, `CONTRACTS.md#world-keys` |
| Blocks: `block(pos)` | §14.1 | `world#/$defs/BlockKeyValue` |
| Player: position | §14.1 | `world#/$defs/PlayerPositionKeyValue` |
| Player: rotation | §14.1 | `world#/$defs/PlayerRotationKeyValue` |
| Player: health | §14.1 | `world#/$defs/PlayerFloatKeyValue` |
| Player: food | §14.1 | `world#/$defs/PlayerIntKeyValue` |
| Player: saturation | §14.1 | `world#/$defs/PlayerFloatKeyValue` |
| Player: oxygen | §14.1 | `world#/$defs/PlayerIntKeyValue` |
| Player: effects | §14.1 | `world#/$defs/PlayerEffectsKeyValue`, `world#/$defs/Effect` |
| Player: on-ground | §14.1 | `world#/$defs/PlayerFlagKeyValue` |
| Player: in-water | §14.1 | `world#/$defs/PlayerFlagKeyValue` |
| Player: in-lava | §14.1 | `world#/$defs/PlayerFlagKeyValue` |
| Player: sneaking | §14.1 | `world#/$defs/PlayerFlagKeyValue` |
| Player: sprinting | §14.1 | `world#/$defs/PlayerFlagKeyValue` |
| Player: using-item | §14.1 | `world#/$defs/PlayerFlagKeyValue` |
| Player: sleeping | §14.1 | `world#/$defs/PlayerFlagKeyValue` |
| Player: dead | §14.1 | `world#/$defs/PlayerFlagKeyValue` |
| Player: dimension | §14.1 | `world#/$defs/PlayerDimensionKeyValue` |
| Player: held slot | §14.1 | `world#/$defs/PlayerIntKeyValue` |
| Inventory: slots 0–45 | §14.1 | `world#/$defs/InventorySlotKeyValue` |
| Inventory: cursor | §14.1 | `world#/$defs/InventorySlotKeyValue` |
| Window: id | §14.1 | `world#/$defs/WindowIdKeyValue` |
| Window: kind | §14.1 | `world#/$defs/WindowKindKeyValue` |
| Window: slots | §14.1 | `world#/$defs/WindowSlotKeyValue` |
| Window: properties | §14.1 | `world#/$defs/WindowPropertyKeyValue` |
| Entity: type | §14.1 | `world#/$defs/EntityTypeKeyValue` |
| Entity: position | §14.1 | `world#/$defs/EntityPositionKeyValue` |
| Entity: name | §14.1 | `world#/$defs/EntityNameKeyValue` |
| Entity: health | §14.1 | `world#/$defs/EntityHealthKeyValue` |
| Entity: equipment | §14.1 | `world#/$defs/EntityEquipmentKeyValue`, `world#/$defs/Equipment` |
| Entity: passengers | §14.1 | `world#/$defs/EntityPassengersKeyValue` |
| Entity: alive | §14.1 | `world#/$defs/EntityFlagKeyValue` |
| World: time of day | §14.1 | `world#/$defs/WorldTimeKeyValue` |
| World: weather | §14.1 | `world#/$defs/WorldWeatherKeyValue` |
| World: tag contents | §14.1 | `world#/$defs/WorldTagKeyValue` |
| World: known recipes | §14.1 | `world#/$defs/WorldRecipesKeyValue` |
| Keys §17.2 reads that §14.1 omits (light, sign text, on-fire, vehicle, reach attributes, entity item/owner/bite) | §17.2, decisions 75, 81, 82, 123 | `world#/$defs/LightKeyValue`, `world#/$defs/SignKeyValue`, `world#/$defs/PlayerVehicleKeyValue`, `world#/$defs/PlayerAttributeKeyValue`, `world#/$defs/EntityItemKeyValue`, `world#/$defs/EntityOwnerKeyValue`, `world#/$defs/EntityBitingKeyValue`, `ESCALATIONS.md#e-1-141-omits-world-keys-that-172-members-read` |
| Bulk chunk load and unload | §14.1, §15.2 | `world#/$defs/ChunkLoad`, `world#/$defs/ChunkUnload`, `world#/$defs/Run` |

## 8. Backend interface (§18.4, §14, §15)

| Construct | § | Covered by |
| --- | --- | --- |
| `connect(launch)` | §18.4 | `backend.d.ts#Backend`, `backend.d.ts#TickClock`, `backend-data#/$defs/ConnectResult` |
| `disconnect()` | §18.4 | `backend.d.ts#Backend` |
| `ingest() -> TickInput` | §18.4 | `backend.d.ts#Backend`, `tick-input#/$defs/TickInput` |
| `start(action, primitive, args, mode) -> Delta?` | §18.4 | `backend.d.ts#Backend`, `backend.d.ts#PrimitiveArgs`, `delta#/$defs/Delta` |
| `cancel(action)` | §18.4 | `backend.d.ts#Backend` |
| `flush()` | §18.4 | `backend.d.ts#Backend`, `provisional#/$defs/FlushMode` |
| 20 Hz clock ownership | §18.4, §15.5 | `backend.d.ts#TickClock`, `CONTRACTS.md#backend-interface` |
| Action ids (deterministic) | §15.5 | `tick-input#/$defs/ActionId` |
| `StartMode` sync/async | §10.8, §14.3 | `backend-data#/$defs/StartMode` |
| Backend-only handle encodings: `Entity`, `Window` | §6.1, §15.4 | `wire#/$defs/EntityHandle`, `wire#/$defs/WindowHandle` |
| Backend-only `Goal` encoding | §17.3 | `wire#/$defs/Goal`, `wire#/$defs/GoalAt`, `wire#/$defs/GoalNearEntity` |
| `PathOpts`, `BuildOpts` | §17.3 | `wire#/$defs/PathOpts`, `wire#/$defs/BuildOpts` |
| `TickInput` | §15.2 phase 1 | `tick-input#/$defs/TickInput` |
| Attributed key change `Own(action)` / `Outside` | §14.5 | `tick-input#/$defs/KeyChange`, `provisional#/$defs/KeyCause` |
| Action report `Running` | §9.6 | `tick-input#/$defs/ReportRunning` |
| Action report `Issued` | §9.6 | `tick-input#/$defs/ReportIssued` |
| Action report `Confirmed` | §9.6 | `tick-input#/$defs/ReportConfirmed` |
| Action report `Rejected(detail)` | §9.6 | `tick-input#/$defs/ReportRejected` |
| Action report `Failed(failure)` | §9.6 | `tick-input#/$defs/ReportFailed` |
| Infrastructure: connected, `Disconnected`, `Kicked` | §12.3 | `tick-input#/$defs/InfraConnected`, `tick-input#/$defs/InfraConnectFailed`, `tick-input#/$defs/InfraDisconnected`, `tick-input#/$defs/InfraKicked` |
| Infrastructure: `Died`, spawn and respawn | §12.3 | `tick-input#/$defs/InfraDied`, `tick-input#/$defs/InfraSpawned` |
| Measurements (round-trip time, path progress) | §17.1, §17.2 | `tick-input#/$defs/Measurements`, `provisional#/$defs/RoundTripTime` |
| `Delta` (predicted key values) | §14.3 | `delta#/$defs/Delta`, `delta#/$defs/DeltaEntry` |
| Recording for replay | §15.5 | `tick-input#/$defs/RecordedTick`, `backend-data#/$defs/StartRequest` |

## 9. Primitives (§17.1, §17.9 `golem.prim`)

| Construct | § | Covered by |
| --- | --- | --- |
| `pathfind` | §17.1 | `backend-data#/$defs/PathfindCall`, `backend-data#/$defs/PrimitiveName` |
| `pathfind_build` | §17.1 | `backend-data#/$defs/PathfindBuildCall`, `backend-data#/$defs/PrimitiveName` |
| `sneak` | §17.1 | `backend-data#/$defs/SneakCall`, `backend-data#/$defs/PrimitiveName` |
| `sprint` | §17.1 | `backend-data#/$defs/SprintCall`, `backend-data#/$defs/PrimitiveName` |
| `hold_jump` | §17.1 | `backend-data#/$defs/HoldJumpCall`, `backend-data#/$defs/PrimitiveName` |
| `steer` | §17.1 | `backend-data#/$defs/SteerCall`, `backend-data#/$defs/PrimitiveName` |
| `dismount` | §17.1 | `backend-data#/$defs/DismountCall`, `backend-data#/$defs/PrimitiveName` |
| `look_at` | §17.1 | `backend-data#/$defs/LookAtCall`, `backend-data#/$defs/PrimitiveName` |
| `dig` | §17.1 | `backend-data#/$defs/DigCall`, `backend-data#/$defs/PrimitiveName` |
| `interact(pos, face)` | §17.1 | `backend-data#/$defs/InteractBlockCall`, `backend-data#/$defs/PrimitiveName` |
| `place_block` | §17.1 | `backend-data#/$defs/PlaceBlockCall`, `backend-data#/$defs/PrimitiveName` |
| `interact(target)` | §17.1 | `backend-data#/$defs/InteractEntityCall`, `backend-data#/$defs/PrimitiveName` |
| `attack` | §17.1 | `backend-data#/$defs/AttackCall`, `backend-data#/$defs/PrimitiveName` |
| `use_item` | §17.1 | `backend-data#/$defs/UseItemCall`, `backend-data#/$defs/PrimitiveName` |
| `hold_use` | §17.1 | `backend-data#/$defs/HoldUseCall`, `backend-data#/$defs/PrimitiveName` |
| `swap_hands` | §17.1 | `backend-data#/$defs/SwapHandsCall`, `backend-data#/$defs/PrimitiveName` |
| `select_hotbar` | §17.1 | `backend-data#/$defs/SelectHotbarCall`, `backend-data#/$defs/PrimitiveName` |
| `pick_up` | §17.1 | `backend-data#/$defs/PickUpCall`, `backend-data#/$defs/PrimitiveName` |
| `put` | §17.1 | `backend-data#/$defs/PutCall`, `backend-data#/$defs/PrimitiveName` |
| `quick_move` | §17.1 | `backend-data#/$defs/QuickMoveCall`, `backend-data#/$defs/PrimitiveName` |
| `swap_hotbar` | §17.1 | `backend-data#/$defs/SwapHotbarCall`, `backend-data#/$defs/PrimitiveName` |
| `throw` | §17.1 | `backend-data#/$defs/ThrowCall`, `backend-data#/$defs/PrimitiveName` |
| `throw_cursor` | §17.1 | `backend-data#/$defs/ThrowCursorCall`, `backend-data#/$defs/PrimitiveName` |
| `click_button` | §17.1 | `backend-data#/$defs/ClickButtonCall`, `backend-data#/$defs/PrimitiveName` |
| `select_trade` | §17.1 | `backend-data#/$defs/SelectTradeCall`, `backend-data#/$defs/PrimitiveName` |
| `rename` | §17.1 | `backend-data#/$defs/RenameCall`, `backend-data#/$defs/PrimitiveName` |
| `close` | §17.1 | `backend-data#/$defs/CloseCall`, `backend-data#/$defs/PrimitiveName` |
| `edit_sign` | §17.1 | `backend-data#/$defs/EditSignCall`, `backend-data#/$defs/PrimitiveName` |
| `write_book` | §17.1 | `backend-data#/$defs/WriteBookCall`, `backend-data#/$defs/PrimitiveName` |
| `sign_book` | §17.1 | `backend-data#/$defs/SignBookCall`, `backend-data#/$defs/PrimitiveName` |
| `respawn` | §17.1 | `backend-data#/$defs/RespawnCall`, `backend-data#/$defs/PrimitiveName` |
| `leave_bed` | §17.1 | `backend-data#/$defs/LeaveBedCall`, `backend-data#/$defs/PrimitiveName` |
| `chat` | §17.1 | `backend-data#/$defs/ChatCall`, `backend-data#/$defs/PrimitiveName` |
| `command` | §17.1 | `backend-data#/$defs/CommandCall`, `backend-data#/$defs/PrimitiveName` |

## 10. Events (§17.6)

| Construct | § | Covered by |
| --- | --- | --- |
| `spawned` | §17.6 | `tick-input#/$defs/InfraSpawned`, `tick-input#/$defs/EventName` |
| `died(cause)` | §17.6 | `tick-input#/$defs/InfraDied`, `tick-input#/$defs/EventName` |
| `hurt(amount, attacker)` | §17.6 | `tick-input#/$defs/Hurt` |
| `entity_hurt(e, attacker)` | §17.6 | `tick-input#/$defs/EntityHurt` |
| `chat(sender, text)` | §17.6 | `tick-input#/$defs/Chat` |
| `whisper(sender, text)` | §17.6 | `tick-input#/$defs/Whisper` |
| `system(text)` | §17.6 | `tick-input#/$defs/SystemMessage` |
| `entity_appeared(e)` | §17.6 | `tick-input#/$defs/EntityAppeared` |
| `entity_gone(id, kind)` | §17.6 | `tick-input#/$defs/EntityGone` |
| `item_collected(stack)` | §17.6 | `tick-input#/$defs/ItemCollected` |
| `window_opened(menu_type)` | §17.6 | `tick-input#/$defs/WindowOpened` |
| `window_closed` | §17.6 | `tick-input#/$defs/WindowClosedEvent` |

## 11. Reports (§16.2)

| Construct | § | Covered by |
| --- | --- | --- |
| Envelope `seq`, `tick`, `bot`, `type` | §16.2 | `report#/$defs/Seq`, `report#/$defs/Tick`, `report#/$defs/BotName` |
| Failure object `{type, fields, trace}` and trace frame | §16.1, §16.2 | `report#/$defs/Failure`, `report#/$defs/TraceFrame` |
| `hello` | §16.2 | `report#/$defs/Hello`, `report#/$defs/JobSignature`, `report#/$defs/InstanceInfo` |
| `job_started` | §16.2 | `report#/$defs/JobStarted` |
| `job_completed` | §16.2 | `report#/$defs/JobCompleted` |
| `job_failed` | §16.2 | `report#/$defs/JobFailed` |
| `job_cancelled` | §16.2 | `report#/$defs/JobCancelled` |
| `thread_started` | §16.2 | `report#/$defs/ThreadStartedJob`, `report#/$defs/ThreadStartedHandler` |
| `thread_ended` | §16.2 | `report#/$defs/ThreadEnded` |
| `frozen` | §16.2 | `report#/$defs/Frozen` |
| `resumed` | §16.2 | `report#/$defs/Resumed` |
| `task_started` | §16.2 | `report#/$defs/TaskStarted` |
| `task_completed` | §16.2 | `report#/$defs/TaskCompleted` |
| `task_failed` | §16.2 | `report#/$defs/TaskFailed` |
| `progress` | §16.2 | `report#/$defs/Progress` |
| `rollback` | §16.2 | `report#/$defs/Rollback` |
| `notice` | §16.2, decision 94 | `report#/$defs/NoticeFromJob`, `report#/$defs/NoticeFromHandler` |
| `handler_failed` | §16.2 | `report#/$defs/HandlerFailed` |
| `handler_backoff` | §16.2 | `report#/$defs/HandlerBackoff` |
| `handler_disabled` | §16.2 | `report#/$defs/HandlerDisabled` |
| `event_dropped` | §16.2 | `report#/$defs/EventDropped` |
| `defer_failed` | §16.2 | `report#/$defs/DeferFailed` |
| `disconnected` | §16.2 | `report#/$defs/Disconnected` |
| `reconnected` | §16.2 | `report#/$defs/Reconnected` |
| `died` | §16.2 | `report#/$defs/Died` |
| `respawned` | §16.2 | `report#/$defs/Respawned` |
| Persistence mismatch report | §18.5 | `report#/$defs/StateNotRestored` |

## 12. Commands, replies and refusals (§16.3, §6.9)

| Construct | § | Covered by |
| --- | --- | --- |
| `assign {job, args, job_id}` | §16.3 | `command#/$defs/Assign` |
| `cancel {job_id}` | §16.3 | `command#/$defs/Cancel` |
| `pause {job_id}` | §16.3 | `command#/$defs/Pause` |
| `resume {job_id}` | §16.3 | `command#/$defs/Resume` |
| `snapshot {}` | §16.3 | `command#/$defs/Snapshot` |
| Reply `accepted` | §6.9, §16.3 | `reply#/$defs/JobAccepted`, `reply#/$defs/SnapshotAccepted` |
| Reply `refused` with reason | §6.9, §16.3 | `reply#/$defs/Refused` |
| Refusal `Busy` | §16.3 | `reply#/$defs/RefusalReason` |
| Refusal `UnknownJob` | §16.3 | `reply#/$defs/RefusalReason` |
| Refusal `BadArgs` | §16.3, §6.9, §8.4 | `reply#/$defs/RefusalReason` |
| Refusal `NotReady` | §16.3, §12.3 | `reply#/$defs/RefusalReason` |
| Refusal `NoJob` | §16.3 | `reply#/$defs/RefusalReason` |
| Refusal `NotPaused` | §16.3 | `reply#/$defs/RefusalReason` |
| Snapshot reply: threads, strands, frames, state ids, elapsed ticks, wire args | §16.3 | `reply#/$defs/MachineSnapshot`, `reply#/$defs/ThreadSnapshot`, `reply#/$defs/StrandSnapshot`, `reply#/$defs/FrameSnapshot`, `reply#/$defs/InstanceSnapshot` |
| Reply correlation | §16.3 | `command#/$defs/CorrelationId`, `ESCALATIONS.md#e-2-replies-have-no-correlation-id` |

## 13. Diagnostics (§13.1, finding 15)

| Construct | § | Covered by |
| --- | --- | --- |
| Diagnostic object (code, severity, message, span, spec, related) | finding 15 | `diagnostic#/$defs/Diagnostic`, `diagnostic#/$defs/SourceSpan`, `diagnostic#/$defs/RelatedSpan` |
| Lexical and syntax errors (§3–§4) | §3, §4 | `diagnostic#/$defs/DiagnosticCode` |
| Check 1: names, imports, case | §13.1 | `diagnostic#/$defs/DiagnosticCode`, `diagnostic#/$defs/SpecRef`, `CONTRACTS.md#diagnostics` |
| Check 2: types, overloads, registries, `Eq + Ord` keys | §13.1 | `diagnostic#/$defs/DiagnosticCode`, `diagnostic#/$defs/SpecRef`, `CONTRACTS.md#diagnostics` |
| Check 3: fn effects, task-call positions | §13.1 | `diagnostic#/$defs/DiagnosticCode`, `diagnostic#/$defs/SpecRef`, `CONTRACTS.md#diagnostics` |
| Check 4: acyclic calls and consts | §13.1 | `diagnostic#/$defs/DiagnosticCode`, `diagnostic#/$defs/SpecRef`, `CONTRACTS.md#diagnostics` |
| Check 5: resources, disjoint `with` | §13.1 | `diagnostic#/$defs/DiagnosticCode`, `diagnostic#/$defs/SpecRef`, `CONTRACTS.md#diagnostics` |
| Check 6: termination | §13.1 | `diagnostic#/$defs/DiagnosticCode`, `diagnostic#/$defs/SpecRef`, `CONTRACTS.md#diagnostics` |
| Check 7: clause placement, `old`, `result` | §13.1 | `diagnostic#/$defs/DiagnosticCode`, `diagnostic#/$defs/SpecRef`, `CONTRACTS.md#diagnostics` |
| Check 8: exact `fails`, failure inference | §13.1 | `diagnostic#/$defs/DiagnosticCode`, `diagnostic#/$defs/SpecRef`, `CONTRACTS.md#diagnostics` |
| Check 9: async-safe and atomic bodies | §13.1 | `diagnostic#/$defs/DiagnosticCode`, `diagnostic#/$defs/SpecRef`, `CONTRACTS.md#diagnostics` |
| Check 10: ongoing rules | §13.1 | `diagnostic#/$defs/DiagnosticCode`, `diagnostic#/$defs/SpecRef`, `CONTRACTS.md#diagnostics` |
| Check 11: exhaustive `match`, diverging `let … else` | §13.1 | `diagnostic#/$defs/DiagnosticCode`, `diagnostic#/$defs/SpecRef`, `CONTRACTS.md#diagnostics` |
| Check 12: wire types where required | §13.1 | `diagnostic#/$defs/DiagnosticCode`, `diagnostic#/$defs/SpecRef`, `CONTRACTS.md#diagnostics` |
| Check 13: handlers | §13.1 | `diagnostic#/$defs/DiagnosticCode`, `diagnostic#/$defs/SpecRef`, `CONTRACTS.md#diagnostics` |
| Check 14: bots | §13.1 | `diagnostic#/$defs/DiagnosticCode`, `diagnostic#/$defs/SpecRef`, `CONTRACTS.md#diagnostics` |
| Warning: catch arm for a failure that cannot occur | §13.1 | `diagnostic#/$defs/Severity`, `CONTRACTS.md#diagnostics` |
| Warning: unused import | §13.1 | `diagnostic#/$defs/Severity`, `CONTRACTS.md#diagnostics` |
| Warning: `requires` implied by a callee | §13.1 | `diagnostic#/$defs/Severity`, `CONTRACTS.md#diagnostics` |

## 14. Question 7 defaults and persistence (§16.3, §18.5)

| Construct | § | Covered by |
| --- | --- | --- |
| Transport: stdio JSON Lines | §16.3, question 7 | `CONTRACTS.md#transport` |
| `launch.json` | §12.2, question 7 | `launch#/$defs/Launch`, `CONTRACTS.md#launchjson` |
| Auth by reference, never inline secrets | §12.2 | `launch#/$defs/Auth` |
| Per-bot persistence file | §18.5, question 7 | `persistence#/$defs/PersistedState` |
| Persisted activity `var`s (instance, name, type) | §18.5 | `persistence#/$defs/PersistedInstance`, `persistence#/$defs/PersistedVar` |
| Persisted handler backoff state | §18.5 | `persistence#/$defs/PersistedBackoff` |
| CLI `golem build` | question 7 | `CONTRACTS.md#cli` |
| CLI `golem run` | question 7 | `CONTRACTS.md#cli` |
