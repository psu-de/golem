// Hand-written: the §18.4 backend interface. It defines methods, not data, so it is not generated;
// every data type it uses is generated from the schemas and imported below.
//
// Clock and call discipline (proposed decision PD-2, CONTRACTS.md "Backend interface"):
//
// - The backend owns the 20 Hz clock: its physics tick (§18.4). From the moment the first connect()
//   resolves until disconnect() resolves, it calls clock.tick() exactly once per physics tick, never
//   re-entrantly and never while another call into the runtime is in progress. The clock keeps
//   running across server disconnects (a local 50 ms timer stands in for the physics tick while no
//   connection exists), so the runtime can count reconnect_delay in ticks (§12.2).
// - clock.tick() runs the seven tick phases of §15.2 synchronously. Inside it the runtime calls
//   ingest() once (phase 1), then any number of start() and cancel() (phases 2, 5, 6), then flush()
//   once (phase 7). These four are synchronous and must not wait on I/O, so a tick's decisions depend
//   only on the TickInput and the supervisor commands of that tick (§15.5).
// - connect() and disconnect() are asynchronous and are only called outside clock.tick(). The runtime
//   acts on the connection's outcome only when it arrives as a "connected" or "connect_failed" infra
//   event in a TickInput, so a recording replays it at the same tick; the returned promise exists for
//   capabilities and error reporting.
// - The runtime calls connect() again to reconnect after a disconnected or kicked infra event; it calls
//   disconnect() only to end the session, which also stops the clock.

import type { ConnectResult, PrimitiveCall, PrimitiveName, StartMode } from "./backend-data.js";
import type { Delta } from "./delta.js";
import type { Launch } from "./launch.js";
import type { ActionId, TickInput } from "./tick-input.js";

/** §17.1 primitive arguments keyed by primitive name, derived from the generated PrimitiveCall union. */
export type PrimitiveArgsMap = { [C in PrimitiveCall as C["primitive"]]: C["args"] };

/** §17.1 the argument object of primitive P (every parameter present, defaults filled by the runtime). */
export type PrimitiveArgs<P extends PrimitiveName = PrimitiveName> = PrimitiveArgsMap[P];

/** PD-2 the runtime's side of the clock: the backend calls tick() once per physics tick. */
export interface TickClock {
  /** Runs tick phases 1-7 (§15.2) synchronously; calls back into ingest, start, cancel and flush. */
  tick(): void;
}

/**
 * §18.4 a backend talks only to the server. The runtime owns the world model, the scheduler,
 * contract checking and the extern fns; it drives the backend through these six operations.
 */
export interface Backend {
  /**
   * §18.4 session: open the connection described by launch (server, auth, version) and start the
   * clock if it is not running. Resolves after login with the server version and the backend's
   * provisional capabilities (SPIKE_DEPENDENCIES.md S-1, S-2); rejects if the attempt fails, which
   * is also reported as a connect_failed infra event. Never called inside clock.tick().
   */
  connect(launch: Launch, clock: TickClock): Promise<ConnectResult>;

  /** §18.4 session: close the connection and stop the clock. Never called inside clock.tick(). */
  disconnect(): Promise<void>;

  /**
   * §18.4 phase 1: everything received from the server since the previous ingest, with every key
   * change attributed Own(action) or Outside (§14.5), discrete events, action reports, infrastructure
   * events and measurements. Must be fully JSON-serialisable: recording these values is how a session
   * is replayed (§15.5).
   */
  ingest(): TickInput;

  /**
   * §18.4 phase 6: begin primitive with args as action. In "async" mode (inside confirm async) the
   * backend MUST return the action's predicted Delta (§14.3); in "sync" mode it returns undefined.
   * Reports on the action arrive through later ingest() calls. A stale Window or Entity handle in
   * args is reported as Failed(WindowClosed) or the primitive's declared failure, never thrown.
   */
  start<P extends PrimitiveName>(action: ActionId, primitive: P, args: PrimitiveArgs<P>, mode: StartMode): Delta | undefined;

  /**
   * §18.4 phases 2, 5, 6: stop the action and release its inputs (keys, sneaking, the pathfinder,
   * §15.4). Packets already sent cannot be unsent (decision 19); later changes they cause are
   * attributed Outside (§14.5). Cancelling an action that already has a verdict is a no-op.
   */
  cancel(action: ActionId): void;

  /** §18.4 phase 7: send this tick's packets (when they leave is spike item S-1). */
  flush(): void;
}
