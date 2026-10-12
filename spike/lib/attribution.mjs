// §14.5 attribution rules evaluated by the spike. Every rule works on the same per-action record, so a
// rule can run inside the backend at ingest time (S-2 "backend") or afterwards over a recording
// (S-2 no-go "affected-keys": the runtime attributes from start ticks, verdict ticks, Delta and RTT).
//
// Action record: { id, primitive, start, verdictTick, verdict, cancelled, rolledBack, affected: Map(key -> predicted | ANY) }
//   start, verdictTick, cancelled, rolledBack are tick numbers (or null). A change at tick t that is
//   delivered in the same TickInput as the verdict counts as before the verdict (PD-11: changes are
//   processed before reports).

export const ANY = Symbol("any-value");

export const settleTicks = (rttMs) => Math.max(4, Math.ceil((2 * (rttMs ?? 0)) / 50));

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// place_block is confirmed on the block type at the target cell (§17.1), so its prediction matches by type.
const blockType = (v) => (typeof v === "string" ? v.replace(/\[.*$/, "") : v);

function matchesPrediction(action, key, value) {
  const p = action.affected.get(key);
  if (p === ANY) return true;
  if (action.primitive === "place_block" && key.startsWith("block(")) return blockType(p) === blockType(value);
  return sameValue(p, value);
}

// Provisional rule (SPIKE_DEPENDENCIES S-2, review question 4 default):
// Own(a) iff key in affected(a), start(a) <= t <= verdict(a) + max(4t, 2 x RTT), a not cancelled or rolled back.
export function provisional(actions, change, t, rttMs) {
  let best = null;
  for (const a of actions) {
    if (!a.affected.has(change.key)) continue;
    if (t < a.start) continue;
    if (a.cancelled != null && a.cancelled <= t) continue;
    if (a.rolledBack != null && a.rolledBack <= t) continue;
    if (a.verdictTick != null && t > a.verdictTick + settleTicks(rttMs)) continue;
    if (!best || a.start > best.start) best = a;
  }
  return best ? { own: best.id } : "outside";
}

// Refined rule (the spike's recommendation, REPORT.md E4):
// Own(a) iff (1) key in affected(a); (2) start(a) <= t and a has no verdict before t (the verdict's own
// TickInput still counts); (3) a is live: not cancelled, rolled back or Rejected before t; (4) the new
// value agrees with a's prediction for the key, where a has one; (5) the change is not a server
// correction of a client-authoritative key (player position or rotation set by the server).
export function refined(actions, change, t, _rttMs, meta = {}) {
  if (meta.correction) return "outside";
  let best = null;
  for (const a of actions) {
    if (!a.affected.has(change.key)) continue;
    if (t < a.start) continue;
    if (a.verdictTick != null && t > a.verdictTick) continue;
    if (a.cancelled != null && a.cancelled <= t) continue;
    if (a.rolledBack != null && a.rolledBack <= t) continue;
    if (!matchesPrediction(a, change.key, change.value)) continue;
    if (!best || a.start > best.start) best = a;
  }
  return best ? { own: best.id } : "outside";
}

// Runtime-side variant (S-2 no-go): the refined rule computed from recorded data only. The runtime
// has the Delta, start/verdict ticks and round_trip_ms, but not the backend's knowledge of which
// position or rotation changes were server corrections, unless the TickInput carries it.
export function runtimeSide(actions, change, t, rttMs) {
  return refined(actions, change, t, rttMs, {});
}

export const RULES = { provisional, refined, runtimeSide };
