// Parsers for the name grammars of CONTRACTS.md: type references (PD-15), qualified names (PD-14)
// and state ids (PD-20). Each returns a parse tree or throws an Error with a reason.

export const BUILTIN_TYPES = new Map([
  ["Unit", 0], ["Bool", 0], ["Int", 0], ["Float", 0], ["String", 0], ["Duration", 0], ["Angle", 0],
  ["List", 1], ["Set", 1], ["Map", 2], ["Range", 0], ["BlockPos", 0], ["Vec3", 0], ["Region", 0],
  ["ItemType", 0], ["BlockType", 0], ["BlockState", 0], ["EntityType", 0], ["ItemStack", 0], ["Tag", 1],
  ["ItemFilter", 0], ["BlockFilter", 0], ["EntityFilter", 0], ["Entity", 0], ["Window", 1], ["Inventory", 0],
  ["Bot", 0], ["World", 0],
]);

const IDENT = /^[a-z_][A-Za-z0-9_]*$/;
const TYPE_IDENT = /^[A-Z][A-Za-z0-9_]*$/;

// Splits s at top-level occurrences of sep (outside <> and ()).
function splitTop(s, sep) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "<" || c === "(") depth++;
    else if (c === ">" || c === ")") depth--;
    if (depth < 0) throw new Error(`unbalanced brackets in ${s}`);
    if (c === sep && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  if (depth !== 0) throw new Error(`unbalanced brackets in ${s}`);
  parts.push(s.slice(start));
  return parts;
}

// type = base ["?"]; base = name ["<" type *("," type) ">"]; name = TypeIdent / module "." TypeIdent
export function parseType(s) {
  if (typeof s !== "string" || s.length === 0) throw new Error("empty type");
  let optional = false;
  let body = s;
  if (body.endsWith("?")) {
    optional = true;
    body = body.slice(0, -1);
    if (body.endsWith("?")) throw new Error(`T?? is not a type (§6.1): ${s}`);
  }
  let name = body;
  let args = [];
  const lt = body.indexOf("<");
  if (lt >= 0) {
    if (!body.endsWith(">")) throw new Error(`malformed type arguments: ${s}`);
    name = body.slice(0, lt);
    const inner = body.slice(lt + 1, -1);
    if (inner.length === 0) throw new Error(`empty type arguments: ${s}`);
    args = splitTop(inner, ",").map(parseType);
  }
  const segs = name.split(".");
  const last = segs.pop();
  if (!TYPE_IDENT.test(last) || !segs.every((x) => IDENT.test(x))) throw new Error(`malformed type name ${name} in ${s}`);
  if (/\s/.test(s)) throw new Error(`whitespace in type ${s}`);
  return { name, args, optional, text: s };
}

export function typeToString(t) {
  return `${t.name}${t.args.length ? `<${t.args.map(typeToString).join(",")}>` : ""}${t.optional ? "?" : ""}`;
}

// Every named type in t (recursively), for resolution against the types section.
export function namedTypes(t, out = []) {
  out.push({ base: t.args.length ? `${t.name}<${t.args.map(typeToString).join(",")}>` : t.name, name: t.name, arity: t.args.length });
  for (const a of t.args) namedTypes(a, out);
  return out;
}

// qualified = [module "."] [receiver-type "."] member [type-args] [signature]
export function parseQualified(s) {
  if (typeof s !== "string" || s.length === 0) throw new Error("empty name");
  const segs = splitTop(s, ".");
  const lastSeg = segs.pop();
  const m = /^([A-Za-z_][A-Za-z0-9_]*)(<.*>)?(\(.*\))?$/.exec(lastSeg);
  if (!m) throw new Error(`malformed member ${lastSeg} in ${s}`);
  const [, member, targs, sig] = m;
  const typeArgs = targs ? splitTop(targs.slice(1, -1), ",").map(parseType) : [];
  const signature = sig === undefined ? null : sig === "()" ? [] : splitTop(sig.slice(1, -1), ",").map(parseType);
  const module = [];
  let receiver = null;
  for (const seg of segs) {
    if (receiver === null && IDENT.test(seg)) module.push(seg);
    else if (receiver === null && /^[A-Z]/.test(seg)) receiver = parseType(seg);
    else throw new Error(`malformed qualified name ${s}`);
  }
  return { module: module.join(".") || null, receiver, member, typeArgs, signature, text: s };
}

// ---------- state ids (§18.3, PD-20) ----------

const IDX = "(0|[1-9][0-9]*)";
export const REGION =
  "(if\\.(then|else|elif[1-9][0-9]*)|match\\.arm" + IDX + "|(for|repeat|while|loop|abort|retry|atomic)\\.body|with\\.(child|body)|try\\.(body|catch" + IDX +
  ")|catch\\.(call|arm" + IDX + ")|async\\.(body|barrier)|defer\\.call|let\\.else|call\\.pending)";
const PATH = new RegExp(`^(end|restart|${IDX}(\\.${REGION}\\.${IDX})*(\\.${REGION})?)$`);
const HANDLER_OWNER = /^([a-z_][A-Za-z0-9_]*(\.[a-z_][A-Za-z0-9_]*)?)\/(0|[1-9][0-9]*)$/;

export function parseStateId(id) {
  const hash = id.indexOf("#");
  const owner = hash < 0 ? id : id.slice(0, hash);
  const path = hash < 0 ? null : id.slice(hash + 1);
  if (path !== null && !PATH.test(path)) throw new Error(`malformed state path #${path}`);
  let kind;
  if (owner.startsWith("job:")) {
    parseQualified(owner.slice(4));
    kind = "job";
  } else if (HANDLER_OWNER.test(owner)) kind = "handler";
  else {
    parseQualified(owner);
    kind = "task";
  }
  return { owner, path, kind };
}
