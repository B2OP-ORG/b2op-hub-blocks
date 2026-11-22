import type { Block } from "blockly";
import { Order, pythonGenerator, type PythonGenerator } from "blockly/python";
import { RemoteType } from "../../device/protocol";
import { findSymbol } from "../../remote/registry";
import { isAttrName } from "../../remote/layout";
import { REMOTE_GET_BLOCK, type RemoteValueKind } from "../remoteKinds";

const KEY_IMPORT = "remote_import";
const KEY_MESSAGES = "remote_messages";
const TYPE_CONST: Record<RemoteType, string> = {
  [RemoteType.Int]: "remote.INT",
  [RemoteType.Float]: "remote.FLOAT",
  [RemoteType.Bool]: "remote.BOOL",
  [RemoteType.Str]: "remote.STR",
};

/** Names set in the current generation pass (indicators, or controls): name → { id, type }. */
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

/**
 * Id + type of the layout indicator / control `name`, recorded for the
 * create_message declarations (a no-op on the hub for controls while the
 * editor has them defined, but the program still works without it).
 */
function declare(name: string, sym: { id: number; type: RemoteType }): { id: number; type: RemoteType } {
  const entry = declared.get(name) ?? { id: sym.id, type: sym.type };
  declared.set(name, entry);
  return entry;
}

function writeDeclarations(gen: PythonGenerator): void {
  const lines = [...declared.entries()]
    .sort((a, b) => a[1].id - b[1].id || a[0].localeCompare(b[0]))
    .map(([name, d]) => `remote.create_message(${d.id}, ${pyString(name)}, ${TYPE_CONST[d.type]})`);
  defs(gen)[KEY_MESSAGES] = lines.join("\n");
}

function outputsString(block: Block | null): boolean {
  const check = block?.outputConnection?.getCheck();
  return !!check && check.length > 0 && check.every((c) => c === "String");
}

export function registerRemoteGenerators(gen: PythonGenerator): void {
  for (const [kind, type] of Object.entries(REMOTE_GET_BLOCK) as [RemoteValueKind, string][]) {
    const empty = kind === "bool" ? "False" : kind === "text" ? "''" : "0";
    gen.forBlock[type] = (block: Block) => {
      const name: string = block.getFieldValue("NAME") ?? "";
      // Deleted / not yet created control: read nothing.
      if (!name || !findSymbol("control", name)) return [empty, Order.ATOMIC];
      needsRemote(gen);
      return [remoteReadExpr(name), isAttrName(name) ? Order.MEMBER : Order.FUNCTION_CALL];
    };
  }

  gen.forBlock["remote_set_indicator"] = (block: Block) => {
    const name: string = block.getFieldValue("NAME") ?? "";
    if (!name) return "";
    // Deleted / not yet created indicator or control: send nothing.
    const sym = findSymbol("any", name);
    if (!sym) return `pass  # remote name ${pyString(name)} not defined\n`;
    needsRemote(gen);
    const { id, type } = declare(name, sym);
    writeDeclarations(gen);
    const target = block.getInputTargetBlock("VALUE");
    let value = gen.valueToCode(block, "VALUE", Order.NONE);
    if (!value) value = type === RemoteType.Str ? '""' : type === RemoteType.Bool ? "False" : "0";
    // The hub converts loosely, except INT needs an int and STR a str.
    else if (type === RemoteType.Int && !(target?.type === "math_number" && /^-?\d+$/.test(value))) value = `int(${value})`;
    else if (type === RemoteType.Str && !outputsString(target)) value = `str(${value})`;
    return `remote.send(${id}, ${value})\n`;
  };
}
