# Phase 3 spike: escalations for Paul (spec owner)

Spec questions the Mineflayer feasibility spike raised. Decision 130 routes them to Paul. Per the spike brief, none of them blocked the work: the spike proceeded on each proposed answer, and REPORT.md and proposed-errata.md assume them. The ids are SE-n (spike escalation), distinct from the D2 escalations E-1 to E-13.

Each entry gives the question, why it matters, the evidence, and the proposed answer.

| Id | Question | Proposed answer | Errata |
| --- | --- | --- | --- |
| SE-1 | What is the attribution rule, and who applies it? | The refined rule (REPORT.md E4), normative in §14.5; the backend applies it at ingest | §14.5 |
| SE-2 | What is a "live" action in §14.5? | From `start` until its verdict, inclusive of the verdict's TickInput; not cancelled, not rolled back | §14.5 |
| SE-3 | Rollback of an action that already has a verdict in the same tick: who un-tags its changes? | The runtime: a change tagged Own(k) is treated as Outside when k is rolled back in that tick's phase 2 | §14.5 |
| SE-4 | Ghost blocks: §14.5 says they are an Outside change back; the confirmed view never holds the prediction | A refused action leaves no change; a server update that repeats the current value is not a change | §14.5 |
| SE-5 | §14.3 Folding: what does "contradict the prediction" mean for `place_block`? | Compare at the primitive's confirmation granularity (block type for `place_block`); the Delta predicts the placement-table state | §14.3, §17.1 |
| SE-6 | `RecordedTick` does not carry the Delta `start` returned; how does a replay reproduce an async strand? | The Delta is a pure function of (primitive, args, confirmed view, version data); the simulator recomputes it | §14.3, §15.5 |
| SE-7 | Settle-confirmed window clicks are falsely Confirmed when the server ignores them | Window primitives confirm by **resync**: a no-op probe click forces the full window state | §17.1, §18.4 |
| SE-8 | Must an ack-confirmed action's state change and its acknowledgement arrive in the same TickInput? | Yes: the backend holds back an affected-key change that matches the prediction until the ack | §14.5, §18.4 |
| SE-9 | `pathfind` `NoPath` in an open world | `NoPath` only when the search space is exhausted; elsewhere the `@progress` clause ends it | §17.1 |
| SE-10 | Rotation convention of `player.rotation` (`Angle` radians, but which zero and sign?) | Vanilla convention in radians: yaw 0 = +z (south), clockwise; pitch positive looking down; yaw normalised to (−π, π]; the value is the rotation last sent to the server or set by it | §14.1 |
| SE-11 | Is "immediate" flushing conforming? | Yes; determinism is defined at the ingest boundary (§15.5), but backends SHOULD defer (`flush: "deferred"`) | §15.2, §15.5, §18.4 |
| SE-12 | Client-authoritative position: outside forces (knockback, pushing) during `pathfind` cannot be separated from own movement | Accept: position changes while a `pathfind` runs are Own unless they are a server correction; document the residual | §14.5 |

---

## SE-1: The attribution rule, and who applies it

**Question.** Review question 4 / S-2. §14.5 leaves the rule to the backend. What exactly is Own(a)?

**Why it matters.** §9.8: a false Own masks interference, so a failing `ensures` becomes `ContractViolation`. That is uncatchable and disables handlers for the session (§11.4). A false Outside turns a failing `ensures` into `Interfered`, which is catchable. That masks a defect, but only when an `ensures` is already false.

**Evidence.** E4, 14 scenarios × 3 repetitions, 526 labelled key changes (see REPORT.md):

- The provisional rule (window to verdict + max(4t, 2×RTT)) gave 51 false Own. 30 of them come from scenarios where the window after the verdict swallowed an outside change: S3, S4, S5, S8, S9b.
- The refined rule gave 30 false Own. 21 were knockback (SE-12), 6 were values equal to the prediction (benign), and 3 were same-tick rollback (SE-3).
- Neither rule produced a false Outside.

**Proposed answer.** Adopt the refined rule (text in REPORT.md §E4 and proposed-errata.md §14.5). Keep `capabilities.attribution: "backend"`: only the backend knows which position or rotation changes are server corrections (S9: without that knowledge the runtime-side variant tags 3 of 3 teleports Own). The rule is normative, so a conformance test can recompute it from a recording. No contract shape changes.

## SE-2: What is a live action?

**Question.** §14.5: "an expected effect of a live action". Live from when to when?

**Proposed answer.** From the tick of `start(a)` up to and including the TickInput that carries a's verdict. PD-11 processes changes before reports, so a change delivered with the verdict counts. An action stops being live at the tick it is cancelled or rolled back. The spike measured no own effect arriving after its verdict: E4 counted 0 false Outside, including tool damage and inventory decrements.

## SE-3: Rollback of an action that already has a verdict

**Question.** §14.4 cancels the later actions of a strand when action j fails. But if a later action k was confirmed in the same TickInput as j's rejection, then:

- `cancel(k)` is a no-op (a verdict exists);
- the backend tagged k's change Own(k) at ingest, before the rollback was known.

§14.5 says the change is Outside.

**Evidence.** E4 S12: 3 of 3 runs, both async places issued in one tick, the first refused by spawn protection.

**Proposed answer.** The runtime re-tags: in phase 2, when it rolls back k, every change of the same TickInput tagged Own(k) is treated as Outside. This is a runtime rule, so no interface change is needed.

## SE-4: Ghost blocks

**Question.** §14.5's pitfall paragraph says ghost blocks after a rejected dig are "an Outside change back to the old state". That presumes the confirmed view held the prediction.

**Evidence.** In the spike backend the confirmed view holds only server data; predictions live in the runtime's predicted view (§14.2).

- E3 D3, D4, P2, P3, P4, A7 and A8 were refused. The server sent 1–2 block updates repeating the current value, and the confirmed view saw **no change**.
- Mineflayer's own `bot.dig` writes its prediction into the world (`node_modules/mineflayer/lib/plugins/digging.js:155`, `bot._updateBlockState(block.position, 0)`). That is one reason the spike does not use it (E2).

**Proposed answer.** Rewrite the sentence: a refused action leaves the confirmed view unchanged. A server update that repeats a key's current value is not a change and is never attributed. The predicted view is discarded by rollback (§14.4).

## SE-5: Folding granularity for place_block

**Question.** §14.3: "A backend MUST report `Rejected` ... when the server's values for an action's predicted keys contradict the prediction." §17.1 says `place_block` is confirmed by "ack + state (block type at the target cell)". Does a different state of the right block type contradict?

**Evidence (E3 A4, A5, P7).**

- An oak log placed on a side face gets `axis=z`, while the default-state prediction is `axis=y`.
- A torch on a side face becomes `wall_torch[facing=east]`: a different block type. The default-state prediction was falsely Rejected although the server placed the torch.

**Proposed answer.**

1. The Delta predicts the placement table's state (S-3), not the item's default state; the table covers the torch case.
2. Folding compares at the primitive's confirmation granularity: block type for `place_block`, full value for every other key.

## SE-6: Replay needs the Delta

**Question.** §15.5 says recording the backend input is enough to replay. In async mode, `start` returns a Delta that later decisions read (predicted view), and `RecordedTick` has no place for it.

**Evidence.** E1: replay with the recorded deltas reproduced every decision. Replay without them diverged (`control_without_deltas_identical: false`).

**Proposed answer.** Make the Delta a pure function of (primitive, args, confirmed view, version data). The spike's Deltas already are. The simulator then recomputes it and the recording needs nothing new. The alternative, recording `StartRequest` + Delta per tick, is a contracts 0.2 change; the spike does not recommend it for v0.1.

## SE-7: Settle confirmation of window clicks

**Question.** §17.1 confirms `pick_up`, `put`, `quick_move` and similar by **settle**: no correction for the affected keys within the window. Vanilla answers a correct click with silence, and it also silently ignores a click for a window it has already closed (the container id does not match).

**Evidence.** E3 W11: a `put` aimed at a window id the server had closed was reported Confirmed. The inventory mirror then disagreed with the server: 20 vs 10 oak logs after the close, and no later packet repaired it. W13: a no-op probe click (slot −1, stale state id) makes the server send the full window state (`broadcastFullState`), confirming by state in 1 tick. W14: for a closed window the probe gets no answer, so the action ends Unconfirmed at `confirm_timeout` instead of falsely Confirmed.

**Proposed answer.** Change the confirmation method of the window primitives from **settle** to **resync**. After the click, the backend sends a no-op click with a stale state id, and the verdict is by state on the resynchronised window. A window close (server or client) before the resync is a rejection. Define *resync* next to ack, settle, state and sent in §17.1.

## SE-8: Ack and state in one TickInput

**Question.** `dig` has `@invariant world.block(pos) == old(world.block(pos)) else fail BlockChanged(pos)`, checked every tick.

- If the server's block change for a successful dig arrives in TickInput n but its acknowledgement in n+1, the invariant fails at n: a spurious `BlockChanged` on the bot's own success.
- Vanilla sends both in the same server tick, and locally they always arrived together: 7 of 7 confirmed digs in E3.
- Nothing guarantees it under real network conditions (TCP segmentation, a tick boundary between two reads).

**Proposed answer.** Normative backend rule (§18.4): a change to an affected key of a live ack-confirmed action is delivered in the TickInput that carries the action's acknowledgement, when the change matches the prediction. The backend holds it back until then, up to `confirm_timeout`. A change that contradicts the prediction is delivered at once, so the invariant still sees outside interference immediately.

## SE-9: NoPath in open worlds

**Question.** `pathfind` declares `@fails NoPath`. mineflayer-pathfinder reports `noPath` only when A* exhausts the search space. In an open world an unreachable goal makes the search time out (`thinkTimeout`, partial paths) indefinitely.

**Evidence.** E5: a goal inside a closed box produced only `timeout`/`partial` path updates for 15 s and no `noPath`; progress stalled. With the bot itself enclosed (finite space), `NoPath` arrives promptly.

**Proposed answer.** Keep `NoPath` for an exhausted search. In the open-world case, `pathfind`'s `@progress bot.path_progress increasing within 5s` ends the call (§9.3), which E5 shows does trigger. State this in the `pathfind` row of §17.1 so authors do not rely on `NoPath` alone.

## SE-10: player.rotation convention

**Question.** `player.rotation` is `{yaw, pitch}` as `Angle` (radians). No zero direction or sign is defined. Mineflayer's internal yaw is π − vanilla yaw.

**Proposed answer.** The vanilla convention in radians:

- yaw 0 faces +z (south) and increases clockwise seen from above (west = π/2), normalised to (−π, π];
- pitch is positive looking down.

The confirmed rotation is the one last sent to the server, or set by a server correction. It is not Mineflayer's `entity.yaw`, which jumps to the target before any packet is sent.

## SE-11: Is immediate flushing conforming?

**Question.** Review finding 3 and S-1. §15.2 step 7 says "The backend sends this tick's packets".

**Evidence.** E2: Mineflayer's high-level calls send outside phase 6:

- from timers: `bot.dig` finish, `digging.js:149`;
- from promise continuations: `bot.dig` start after `await bot.lookAt`, `digging.js:130`; `bot.placeBlock`, `generic_place.js:75`;
- from the physics step after the tick: `physics.js:112/123/138`.

A write gate at `bot._client.write` defers every one of them to `flush()` (0 packets escaped in 30 runs). The cost is one tick of latency for packets produced between ticks.

**Proposed answer.** Both modes are conforming because §15.5 defines determinism at the ingest boundary. Backends SHOULD defer, because deferral buys two things:

- a start and cancel in the same tick never reach the server (E4 S11b);
- a tick's packets leave contiguously.

Errata wording is in proposed-errata.md (§15.2 step 7, §15.5).

## SE-12: Unattributable position changes

**Question.** §14.1 makes the confirmed position the backend's simulated position. The simulation integrates own control input and outside velocity (knockback via `entity_velocity`, explosions) into one value per tick.

**Evidence.** E4 S10: a punch during `pathfind` moved the bot about 2.2 blocks within 400 ms. Every rule tagged the 6–7 affected position changes Own; no rule can separate them.

**Proposed answer.** Accept and document the residual: while a `pathfind` (or other action with the position in its affected set) runs, position changes are Own unless they are a server correction (teleport or setback), which is always Outside. The harm is bounded:

- `pathfind`'s own `ensures` is `goal.reached`, which the pathfinder re-pursues after the push;
- after the verdict, position changes are Outside under the refined rule.

---

**Housekeeping (not an escalation).** `contracts/CONTRACTS.md` (status paragraph) and `contracts/ESCALATIONS.md` (header and the "Status" lines) still point at `docs/spec/errata.md`. Errata v0.2.1 was applied into `golem-spec-v0.2.md` (commit 5e71ece) and that file deleted. Left unchanged, because `contracts/` is frozen; the fix is a one-line wording change in each at the next contracts patch.
