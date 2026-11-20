import type { Block } from "blockly";
import { Order, pythonGenerator, type PythonGenerator } from "blockly/python";
import { RemoteType } from "../../device/protocol";
import { findSymbol, indicatorSymbols } from "../../remote/registry";
import { isAttrName } from "../../remote/layout";

const KEY_IMPORT = "remote_import";
const KEY_MESSAGES = "remote_messages";
const TYPE_CONST: Record<RemoteType, string> = {
  [RemoteType.Int]: "remote.INT",
  [RemoteType.Float]: "remote.FLOAT",
  [RemoteType.Bool]: "remote.BOOL",
  [RemoteType.Str]: "remote.STR",
};

/** Indicators declared in the current generation pass: name → { id, type }. */
const declared = new Map<string, { id: number; type: RemoteType }>();

/** Call at the start of every workspace → Python pass. */
export function resetRemoteGen(): void {
  declared.clear();
}

function defs(gen: PythonGenerator): Record<string, string> {
  return (gen as unknown as { definitions_: Record<string, string> }).definitions_;
}

function needsRemote(gen: PythonGenerator): void {
  defs(gen)[KEY_IMPORT] = "import remote";
}

/** Python string literal, quoted like Blockly's own text blocks. */
export function pyString(s: string): string {
  return pythonGenerator.quote_(s);
}

/** Python expression reading control `name`. */
export function remoteReadExpr(name: string): string {
  return isAttrName(name) ? `remote.${name}` : `remote.get(${pyString(name)})`;
}

/** Message type for an indicator the layouts don't define, from the value block. */
function guessType(block: Block): RemoteType {
  const target = block.getInputTargetBlock("VALUE");
  if (!target) return RemoteType.Float;
  if (target.type === "remote_get") {
    const s = findSymbol("control", target.getFieldValue("NAME"));
    if (s) return s.type;
  }
  const check = target.outputConnection?.getCheck() ?? [];
  if (check.includes("String")) return RemoteType.Str;
  if (check.includes("Boolean")) return RemoteType.Bool;
  return RemoteType.Float;
}

/**
 * Id + type for indicator `name`: from the layouts, else a free id (not used
 * by any layout indicator or earlier declaration) and a type guessed from the block.
 */
function declare(name: string, block: Block): { id: number; type: RemoteType } {
  const known = declared.get(name);
  if (known) return known;
  const sym = findSymbol("indicator", name);
  let entry: { id: number; type: RemoteType };
  if (sym) {
    entry = { id: sym.id, type: sym.type };
  } else {
    const used = new Set([...indicatorSymbols().map((s) => s.id), ...[...declared.values()].map((d) => d.id)]);
    let id = 0;
    while (used.has(id) && id < 255) id++;
    entry = { id, type: guessType(block) };
  }
  declared.set(name, entry);
  return entry;
}

function writeDeclarations(gen: PythonGenerator): void {
  const lines = [...declared.entries()]
    .sort((a, b) => a[1].id - b[1].id || a[0].localeCompare(b[0]))
    .map(([name, d]) => `remote.create_message(${d.id}, ${pyString(name)}, ${TYPE_CONST[d.type]})`);
  defs(gen)[KEY_MESSAGES] = lines.join("\n");
}

export function registerRemoteGenerators(gen: PythonGenerator): void {
  gen.forBlock["remote_get"] = (block: Block) => {
    const name: string = block.getFieldValue("NAME") ?? "";
    if (!name) return ["0", Order.ATOMIC];
    needsRemote(gen);
    return [remoteReadExpr(name), isAttrName(name) ? Order.MEMBER : Order.FUNCTION_CALL];
  };

  gen.forBlock["remote_set_indicator"] = (block: Block) => {
    const name: string = block.getFieldValue("NAME") ?? "";
    if (!name) return "";
    needsRemote(gen);
    const { id, type } = declare(name, block);
    writeDeclarations(gen);
    const target = block.getInputTargetBlock("VALUE");
    let value = gen.valueToCode(block, "VALUE", Order.NONE);
    if (!value) value = type === RemoteType.Str ? '""' : type === RemoteType.Bool ? "False" : "0";
    // The hub converts loosely, except INT needs an int and STR a str.
    else if (type === RemoteType.Int && !(target?.type === "math_number" && /^-?\d+$/.test(value))) value = `int(${value})`;
    else if (type === RemoteType.Str && target?.type !== "text") value = `str(${value})`;
    return `remote.send(${id}, ${value})\n`;
  };
}
