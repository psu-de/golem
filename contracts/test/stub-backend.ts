// Compile-time test (tsc --noEmit --strict): a backend that replays recorded TickInputs, written
// against the hand-written Backend interface and the generated data types. It also shows how a
// runtime drives the backend's clock (PD-2) and how PrimitiveArgs narrows by primitive name.

import type {
  ActionId,
  Backend,
  ConnectResult,
  Delta,
  DeltaEntry,
  Launch,
  PrimitiveArgs,
  PrimitiveCall,
  PrimitiveName,
  StartMode,
  StartRequest,
  TickClock,
  TickInput,
} from "../types/index.js";

export class StubBackend implements Backend {
  readonly started: StartRequest[] = [];
  readonly cancelled: ActionId[] = [];
  private next = 0;
  private clock: TickClock | undefined;

  constructor(private readonly recording: readonly TickInput[]) {}

  async connect(launch: Launch, clock: TickClock): Promise<ConnectResult> {
    this.clock = clock;
    return {
      minecraft: launch.minecraft,
      protocol: 769,
      capabilities: { flush: "deferred", attribution: "backend" },
    };
  }

  async disconnect(): Promise<void> {
    this.clock = undefined;
  }

  // Stands in for the physics tick: one synchronous clock.tick() per recorded input.
  run(): void {
    while (this.clock && this.next < this.recording.length) this.clock.tick();
  }

  ingest(): TickInput {
    const input = this.recording[this.next++];
    if (!input) throw new Error("recording exhausted");
    return input;
  }

  start<P extends PrimitiveName>(action: ActionId, primitive: P, args: PrimitiveArgs<P>, mode: StartMode): Delta | undefined {
    const call = { primitive, args } as PrimitiveCall;
    this.started.push({ action, call, mode });
    return mode === "async" ? predict(call) : undefined;
  }

  cancel(action: ActionId): void {
    this.cancelled.push(action);
  }

  flush(): void {}
}

// §14.3: a backend predicts the keys an instant action affects. Exhaustive over PrimitiveCall, so a
// primitive added to the schema without a case here fails to compile.
function predict(call: PrimitiveCall): Delta {
  switch (call.primitive) {
    case "pick_up":
      return [{ key: "inventory.cursor", value: null }, slot(call.args.slot, null)];
    case "put":
    case "quick_move":
    case "swap_hotbar":
    case "throw":
      return [slot(call.args.slot, null)];
    case "throw_cursor":
    case "close":
      return [{ key: "inventory.cursor", value: null }];
    case "select_hotbar":
      return [{ key: "player.held_slot", value: call.args.slot }];
    case "place_block": {
      const [x, y, z] = call.args.support;
      return [{ key: `block(${x},${y + 1},${z})`, value: "minecraft:stone" }];
    }
    case "pathfind":
    case "pathfind_build":
    case "sneak":
    case "sprint":
    case "hold_jump":
    case "steer":
    case "dismount":
    case "look_at":
    case "dig":
    case "interact(BlockPos,Face)":
    case "edit_sign":
    case "interact(Entity)":
    case "attack":
    case "use_item":
    case "hold_use":
    case "swap_hands":
    case "click_button":
    case "select_trade":
    case "rename":
    case "write_book":
    case "sign_book":
    case "respawn":
    case "leave_bed":
    case "chat":
    case "command":
      return [];
    default:
      return assertNever(call);
  }
}

function slot(i: number, value: null): DeltaEntry {
  return { key: `window.slot(${i})`, value };
}

function assertNever(x: never): never {
  throw new Error(`unhandled ${JSON.stringify(x)}`);
}

// A minimal runtime loop: phase 1 ingest, phase 6 start, phase 7 flush, all synchronous (§15.2).
export function attach(backend: Backend): TickClock {
  let action = 0;
  return {
    tick(): void {
      const input = backend.ingest();
      for (const r of input.reports) if (r.status === "Failed") void r.failure.type;
      if (input.infra.some((e) => e.infra === "spawned")) {
        const goal = { InReach: { pos: [5, 63, 5] as [number, number, number] } };
        backend.start(++action, "pathfind", { goal, limit: 2400, opts: { avoid: null } }, "sync");
        backend.start(++action, "dig", { pos: [5, 63, 5] }, "sync");
        // @ts-expect-error dig takes pos, not goal: PrimitiveArgs narrows by primitive name
        backend.start(++action, "dig", { goal }, "sync");
      }
      backend.flush();
    },
  };
}
