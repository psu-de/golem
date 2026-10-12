// Validation against the frozen @golem/contracts 0.1.0 schemas, reusing the contracts package's own
// Ajv setup (contracts/scripts/lib/schemas.mjs). Requires `npm ci` in ../contracts.
import { loadSchemas, makeAjv, validatorFor } from "../../contracts/scripts/lib/schemas.mjs";

const ajv = makeAjv(loadSchemas());
const v = {
  tickInput: validatorFor(ajv, "tick-input.schema.json"),
  recordedTick: validatorFor(ajv, "tick-input.schema.json", "RecordedTick"),
  delta: validatorFor(ajv, "delta.schema.json"),
  startRequest: validatorFor(ajv, "backend-data.schema.json", "StartRequest"),
  connectResult: validatorFor(ajv, "backend-data.schema.json", "ConnectResult"),
  launch: validatorFor(ajv, "launch.schema.json"),
};

export function validate(kind, value) {
  const f = v[kind];
  if (f(value)) return null;
  return f.errors.slice(0, 5).map((e) => `${e.instancePath} ${e.message}`).join("; ");
}

// Counts validations by kind; experiments print and save this as evidence.
export class ValidationTally {
  constructor() { this.counts = {}; this.failures = []; }
  check(kind, value) {
    const err = validate(kind, value);
    const c = (this.counts[kind] ??= { valid: 0, invalid: 0 });
    if (err) { c.invalid++; if (this.failures.length < 20) this.failures.push({ kind, err, value: JSON.stringify(value).slice(0, 400) }); }
    else c.valid++;
    return err;
  }
  summary() { return { counts: this.counts, failures: this.failures }; }
}
