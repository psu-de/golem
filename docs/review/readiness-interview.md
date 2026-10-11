# Golem v0.1 Spec — Implementation Readiness Review

Oct 11, 2026 · @Paul

## 1. Executive summary

**Verdict: Not ready, but close.** The language semantics are unusually complete and careful, and the lexer, parser and type checker could be built from §3–§6 today. Three things block a team of agents from implementing the whole system:

1. **The spec depends on a document the implementers don't have.** The design log, decisions 1–36, is still normative.
2. **The interfaces between components are only described in tables.** The IR, the backend interface and the protocol messages are not typed or schema'd, so the compiler, runtime and backend can't be built independently against one contract.
3. **The backend assumptions are unverified against Mineflayer.** These are per-tick packet flushing, Own/Outside attribution, and where the version data comes from. If they're wrong, the runtime design changes.

The single most important next step is a one-to-two-week effort that runs two tracks in parallel: produce a self-contained spec v0.2 with an IR JSON Schema and TypeScript backend interfaces, and run a time-boxed Mineflayer feasibility spike that ends in a go/no-go decision.

## 2. Understanding of the draft

Golem v0.1 specifies a statically typed, contract-checked language for Minecraft (Java Edition) bots. It covers the full grammar, the type system, task contracts (`@requires`, `@ensures`, `@invariant` and the other clauses), reactive activities, a deterministic 20 Hz tick scheduler with resource-based preemption, speculative execution with exact per-strand rollback, a typed JSON supervisor protocol, a 34-primitive standard library, and a TypeScript compiler, runtime and Mineflayer backend (decision 64).

Programs compile to one finite-statechart IR file per bot. The runtime executes that IR and reports every outcome as typed JSON to an external supervisor, which is out of scope.

The spec never states success outright. Implied, it looks like this: agents build a compiler that accepts and rejects programs exactly as §3–§13 describe, and a runtime and backend that run programs like the Lumberjack example (§19) on a version-pinned vanilla server, deterministically, with no silent failures.

I can restate the draft confidently. The gap is in what surrounds the semantics, not in the semantics themselves.

**Strengths worth keeping:**

- Decisions come with rationale.
- The grammar is complete and its disambiguation rules are explicit.
- Normative MUST language is tied to conformance targets.
- Determinism is defined precisely enough to support record and replay (§15.5).
- The draft already anticipates a conformance suite and a simulator.

## 3. Validation findings

Two blockers, nine majors and four minors; the blockers sit at the spec's boundaries, not in its semantics.

| # | Severity | Area | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| 1 | Blocker | Self-containment | An unavailable document is still normative. Agents can't consult the design log, the four std draft files, prototypes 7 and 9, or findings F1–F36. | §0 "Sources": std signatures were "re-derived from the log… Diff them against the drafts in review". §1 closing: "All other decisions stand as written". Rationale cites decisions 1–36 throughout (e.g. 15, 19, 21, 32). | Inline the normative content of decisions 1–36 as an appendix, or declare the log non-normative and confirm the spec covers everything. Reconcile the std drafts and record the outcome. Replace the prototype references with inline examples. |
| 2 | Blocker | Interfaces | The contracts between components are prose tables, not types. The IR's expression-tree nodes, statechart encoding and state-id format are undefined. `TickInput`, `Delta`, action reports, `launch` and action ids are untyped. Report and command payloads are only partly specified. | §18.2 lists only the IR's sections. §18.4: `ingest() -> TickInput`, `start(action, primitive, args, mode) -> Delta?`. §16.2's "Extra fields" column gives names without types. | Publish an IR JSON Schema, TS interfaces (`Backend`, `TickInput`, `Delta`, `ActionReport`, `Launch`), and JSON Schemas for the report stream and the commands. Separate agents can only build compiler, runtime and backend against these artifacts. |
| 3 | Major | Feasibility (backend) | The phase model assumes the runtime controls when packets go out and can attribute every change. Mineflayer's high-level APIs send packets immediately and run their own timers, and mineflayer-pathfinder drives control states itself. Mineflayer has no notion of Own versus Outside causes. Misattribution turns into `ContractViolation`, which is uncatchable and disables handlers for the whole session. | §15.2 phase 7: "The backend sends this tick's packets". §14.5: the backend tags every change `Own(action)` or `Outside`. §18.4 maps `dig`, `lookAt` and `clickWindow` to Mineflayer calls. §11.4 "Defects". | Run a time-boxed spike (Phase 3). Make the attribution algorithm normative instead of leaving it to the backend. One option: a change to a key in the action's declared affected-key set, between `start` and verdict plus the settle window, counts as Own. Say whether determinism is defined at the ingest boundary, so that "sent at start" is conforming. |
| 4 | Major | Feasibility (data) | The named data source doesn't cover what the runtime must compute. Assumption: the vanilla data generator gives registries, block states, tags and recipes, but not hardness, outline or collision shapes, furnace burn times or placement rules. | §18.1 names only the vanilla data generator. The runtime computes dig times, ray casts against outline shapes (§17.3), `burn_time` (§17.2), tool tiers (decision 80), and `can_place` ("seeds need farmland, torches a sturdy face"). | Name a source for each datum (e.g. minecraft-data for physics, the data generator for registries, tags and recipes). Make placement rules a hand-authored table with an explicit v0.1 scope. State the Java dependency at compile time. |
| 5 | Major | Completeness (std) | The std surface is only partly declared, so agents will invent wire-visible types. About 20 failures are used without declarations: `NoPath`, `TooHungry`, `NotRiding`, `EntityGone`, `CannotPut`, `NoRoom`, `CursorNotEmpty`, `BadMessage`, `Missing`, `ChestFull`, `SmelterBusy`, `NoRecipe`, `MissingIngredients`, `NotPlaceable`, `UnsupportedState`, `WrongTool`, `ScreenBusy`, `NotOpened`, `WrongKind` and others. `Trade` and `support_face` are undefined. The types of `held`, `offhand` and `block_reach` are missing. | §17.1: failures each carry "the offending position, slot or entity id". §17.7 gives only a "Contract summary" column, without `@fails`, `@timeout` or `@progress` or bodies, so boundedness can't be checked. | Write full module listings for `golem.prim`, `golem.core`, `golem.filters` and `golem.windows`: every declaration, failure fields and full annotations. Failure fields are part of the supervisor contract (§16.2). |
| 6 | Major | Consistency | Some examples break the spec's own rules, and agents will treat examples as ground truth. In §19.1, `collect(...) catch { _ => {} }` puts a non-diverging block on an `Int`-returning call, which §10.5 forbids. §11.1's `auto_eat` has no `priority` parameter, which conflicts with decision 89 and §17.8. `support_face` (§9.10) is undeclared. | §10.5: "a block that diverges or, for `Unit` calls, any block". §11.1 vs §17.8. | Extract every code block as a golden test and fix it, then keep them checked by the compiler in CI from the parser milestone on. |
| 7 | Major | Semantics (liveness) | There are two scheduler gaps. (a) A `when … until` body that returns immediately restarts in the same thread with no stated tick boundary. `escape_lava` with no dry spot (`else { return }`) can therefore spin without bound inside one tick. (b) §15.3 promises that a pin delays others by at most `atomic_limit`, but only `atomic` enforces this. Async and cursor pins are unbounded, so a job holding cursor items can block `escape_lava`. | §11.4: "the body starts again in the same thread unless `u` holds". §15.3 vs §10.7. | Specify that a restart happens no earlier than the next tick. Apply `atomic_limit` to every pin cause (atomic, confirm async, cursor). |
| 8 | Major | Scope | The v0.1 deliverables beyond the compiler, runtime and backend are unclear, and some are large: a scripted-world simulator with fault injection, a packet-reverting conformance proxy, second-player attribution tests, a supervisor client, a persistence store, a launch format and a CLI. | §18.4 "Conformance suite", "Simulator". §16.3: "The transport … is implementation-defined". §18.5 never names a store. | Publish an in/out list for v0.1 with a default for each item (see questions 6–7). |
| 9 | Major | Measurability | There is no definition of done. The build order exists, but nothing says when the compiler, runtime or backend is "finished". | §19.3 "Build order". No acceptance thresholds anywhere. | Define gates, for example: every spec code block compiles or is rejected as annotated; at least one negative test per §13.1 check; every IR failure transition is covered in the simulator; 34/34 primitives pass conformance; Lumberjack reaches `target = 64` on a pinned server. |
| 10 | Major | Open decisions | Syntax is explicitly still open. Changing it later means rewriting the lexer, parser, golden corpus and all std source. | §19.3 "Syntax": semicolon insertion vs indentation vs `;`, the selector syntax, `self` vs `bot`, `task` vs `action`, the name. | Freeze the syntax as written for v0.1, and record that later changes are deferred to v0.2. |
| 11 | Major | Ownership | Only one author is named. Nobody has decision rights over questions agents raise during implementation, and there is no errata or versioning process, no timeline and no budget. | Header "@Paul". Nothing else. | Name a spec owner and approver, define an escalation and errata process (spec v0.2.x), and set a compute and review budget with a timebox. |
| 12 | Minor | Type system | There are loose ends. `Float` and `Angle` are `Ord` but not `Eq`, so `Set<Float>` and `Map<Float, V>` are legal but their equality is undefined. The relationship between `Ord` and `Eq` is unstated. There is no `Set` or `Map` construction syntax (the grammar has only `ListLit`). `Duration / Int` floors while `Int /` truncates; is that intentional? | §6.1, §6.6, §7.2, §4.1 `ListLit`. | Make `Ord: Eq` a supertrait, or require `Eq + Ord` for set and map keys. Specify `Set()` and `Map()` constructors or literals. Confirm the division rule. |
| 13 | Minor | Consistency | The open-question count doesn't add up: Q3 is missing. | §0: "resolves every open question … (Q1–Q18)". §1: "All 17 open questions". | State where Q3 was resolved. |
| 14 | Minor | Editorial | The markup in a normative ordering rule is broken. | §15.2 step 6(c): the list of `progress`, `timeout` and `stalls_after` checks has mismatched backticks. | Fix it. The check order is normative. |
| 15 | Minor | Agent ergonomics | The compiler diagnostic format is unspecified. If LLM agents will write Golem, structured diagnostics drive their repair loop. | §13 defines checks but no output format. | Define JSON diagnostics: code, span, message, the violated § reference. |

## 4. Open questions

Thirteen questions need an answer or an accepted default before implementation; twelve have a suggested default.

| # | Question | Why it matters | Who answers | Blocks | Suggested default |
| --- | --- | --- | --- | --- | --- |
| 1 | Is the design log normative after v0.2? | Agents can't read it (finding 1). | Spec owner (Paul) | All implementation | The log becomes non-normative; decisions 1–36 are inlined in an appendix. |
| 2 | What did the std draft diff show? | Signatures may change (§0). | Spec owner | Std, golden corpus | The spec's signatures win; the drafts are archived. |
| 3 | Which Minecraft, Mineflayer and pathfinder versions are pinned? | Version is fixed per project (decision 46), and the protocol and data depend on it. | Backend lead (spike) | Backend, data import | 1.21.4 if the pinned Mineflayer fully supports it; otherwise the newest version it does support. |
| 4 | What exactly is the attribution rule? | It decides whether a failure is `Interfered` or an uncatchable `ContractViolation`. | Spec owner plus backend lead | Runtime §9.8, backend | Own if the key is in the action's affected-key set between `start` and verdict plus settle; otherwise Outside. |
| 5 | Where does each runtime datum come from (hardness, shapes, burn time, tool tiers, placement rules)? | Reach, `can_place`, `can_harvest` and `smelt` depend on it. | Backend lead | Runtime extern fns, std | minecraft-data for physics; data generator for registries, tags and recipes; a hand-authored placement table. |
| 6 | Are the scripted-world simulator and the reverting proxy in v0.1? | They are large and sit on the critical path for testing. | Spec owner | Test plan, roadmap | Replay simulator plus a minimal scripted fault injector in v0.1; the proxy in the conformance phase. |
| 7 | What are the supervisor transport, launch format, persistence store and CLI? | Needed for any end-to-end run. | Spec owner | Runtime, integration tests | stdio JSON lines; `launch.json`; one JSON file per bot; `golem build` and `golem run`. |
| 8 | Is the syntax frozen for v0.1? | Changing it means parser and corpus rework (finding 10). | Spec owner | Parser, std source | Frozen as written. |
| 9 | When does a `when … until` body restart? | Otherwise a body can spin within one tick (finding 7a). | Spec owner | Runtime handler state machine | Next tick at the earliest. |
| 10 | Does `atomic_limit` bound async and cursor pins? | Survival reflexes can starve (finding 7b). | Spec owner | Scheduler | Yes, for every pin cause. |
| 11 | Does `Ord` imply `Eq`, and how are `Set` and `Map` built? | The type checker can't be finished without it. | Spec owner | Type checker | `Ord: Eq`; floats are excluded from keys; `Set(xs)` and `Map(pairs)` constructors. |
| 12 | Who answers agent escalations, and how fast? | Agents will hit ambiguities daily. | Project sponsor | Every phase | Paul owns the spec; an errata log with versioned patches; answers within one business day. |
| 13 | What are the timebox and budget? | Without them, scope can't be traded against time. | Project sponsor | Roadmap | Needs a sponsor decision; there is no sensible default. |

## 5. Readiness verdict

**Not ready.** As a language definition this is strong work: the grammar, typing, contract semantics, scheduling and rollback are specified to a level most specs never reach. Implementation-readiness, though, is decided at the boundaries, and the boundaries are where the gaps are.

Implementing agents cannot see a document that is still normative. The artifacts that let several agents build the compiler, runtime and backend independently (IR schema, TS interfaces, protocol schemas) don't exist. The two load-bearing backend assumptions, tick-controlled packet flushing with attribution and data availability, have not been tested against Mineflayer. There is also no definition of done, no owner for in-flight questions, and no timeline.

None of this needs a redesign. All of it can be closed in roughly two to three weeks. The lexer and parser can start now, as soon as the syntax is frozen.

## 6. Roadmap to implementation

The path to the gate takes roughly two to three weeks, with Phases 1–3 running in parallel after a one-to-two-day freeze.

&#91;embedded content: roadmap · 5 phases, 4 decision points\]

A no-go at D3 on flushing or attribution sends §15.2 or §14.5 back into Phase 1 before the gate.

**Phase 0: Freeze and triage** (estimate: 1–2 days)

- **Objective:** stop the ground moving.
- **Activities:** decide questions 1, 8 and 12. Extract every code block in the spec into a corpus folder, each annotated "must compile" or "must reject (§x)".
- **Responsible:** Paul (spec owner).
- **Inputs:** this review and the design log.
- **Deliverables:** a decision record and the corpus.
- **Exit:** decision point D1 is signed off (syntax frozen, log status settled, escalation owner named). An agent can start the lexer and parser against §3–§4 in parallel from here.

**Phase 1: Spec v0.2, self-contained and consistent** (estimate: 5–7 days)

- **Objective:** close findings 1, 5, 6, 7 and 12–14.
- **Activities:** inline decisions 1–36; reconcile the std drafts; write the full std module listings (every failure with its fields, every composite with full annotations, plus `Trade` and `support_face`); fix the examples; specify the restart tick and the pin bound; settle the `Ord`/`Eq` question and `Set`/`Map` construction; fix the editorial issues.
- **Responsible:** Paul. An agent can draft the std listings for Paul to review.
- **Inputs:** the Phase 0 decisions and the std drafts.
- **Deliverables:** Golem spec v0.2.
- **Exit:** there are no external normative references, and every corpus file passes or fails exactly as annotated under the Phase 0 parser.

**Phase 2: Interface contracts** (estimate: 4–5 days, overlapping Phase 1)

- **Objective:** close finding 2.
- **Activities:** IR JSON Schema (expression nodes, statechart states and regions, state-id grammar); TS interfaces for `Backend`, `TickInput`, `Delta`, `ActionReport` and `Launch`; JSON Schemas for report messages and commands; the diagnostic format; defaults for question 7.
- **Responsible:** Paul, with an architect role. An agent can draft; a human approves.
- **Inputs:** §14–§18 and the early spike findings.
- **Deliverables:** a `contracts/` package of schemas and `.d.ts` files.
- **Exit:** the Lumberjack IR is hand-written and validates against the schema. Decision point D2: contracts signed off and frozen for v0.1.

**Phase 3: Backend feasibility spike** (estimate: 1–2 weeks, parallel with Phases 1–2)

- **Objective:** confirm or change the assumptions behind findings 3 and 4.
- **Activities:** on the pinned server, prototype tick-aligned ingest and deferred flush; `dig`, `place_block` and window clicks with verdicts; attribution with a second player changing the same keys; pathfinder under runtime control, including cancelling it on freeze; loading hardness, shapes, burn times and tool tiers for the pinned version.
- **Responsible:** a backend lead, which may be an agent with a human reviewer.
- **Inputs:** questions 3–5 and the §18.4 mapping.
- **Deliverables:** a spike report with a go/no-go per assumption, the attribution rule (question 4) and the data-source table (question 5).
- **Exit:** decision point D3, the go/no-go, signed off by Paul.

**Phase 4: Acceptance criteria and work packages** (estimate: 3–5 days)

- **Objective:** close findings 8, 9 and 11.
- **Activities:** write the measurable gates for each component (finding 9); fix the v0.1 scope list (question 6); split the work into agent-sized packages, each with inputs, the contract files it codes against, and corpus or conformance tests as its definition of done (lexer/parser, resolver/types, analyses, lowering/IR, runtime core, scheduler/rollback, simulator, Mineflayer backend, std); set the timebox and budget (question 13).
- **Responsible:** Paul, with the project sponsor.
- **Inputs:** Phases 1–3.
- **Deliverables:** an implementation plan and a test plan.
- **Exit:** decision point D4, the implementation gate. The sponsor and Paul sign off that every blocker is closed, every open question is answered or defaulted, and the gates are measurable.

## 7. Immediate next steps (next 1–2 weeks)

- [ ] **Freeze the syntax and declare the design log non-normative.** Record both as dated decisions so agents stop treating §19.3 as open. *Owner: Paul (spec owner).*
- [ ] **Start the Mineflayer spike now**, focused on deferred flush, attribution and data sources, because its outcome can change §14–§15. *Owner: backend lead.*
- [ ] **Extract every spec code block into an annotated golden corpus** and fix the three known violations: the `collect` catch, `auto_eat` in §11.1, and `support_face`. *Owner: Paul, with an agent doing the extraction.*
- [ ] **Draft the IR JSON Schema and the `Backend` TS interfaces**, and validate them against a hand-written Lumberjack IR. *Owner: architect role (agent drafts, Paul approves).*
- [ ] **Write the full std declarations**: failures with fields, and fully annotated composites. *Owner: Paul, with an agent drafting from §17.*
