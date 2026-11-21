// Remote control reporter kinds. Blockly-free: also used by pythonToBlocks.
import { RemoteType } from "../device/protocol";

/** Value kinds of remote control reporters (one block type each). */
export type RemoteValueKind = "number" | "bool" | "text";

export function remoteValueKind(t: RemoteType): RemoteValueKind {
  return t === RemoteType.Bool ? "bool" : t === RemoteType.Str ? "text" : "number";
}

/** Reporter block type per value kind. */
export const REMOTE_GET_BLOCK: Record<RemoteValueKind, string> = {
  number: "remote_get_number",
  bool: "remote_get_bool",
  text: "remote_get_text",
};

/** Value kind of a `remote_get_*` block type, or undefined for other blocks. */
export function remoteGetKind(blockType: string): RemoteValueKind | undefined {
  return (Object.keys(REMOTE_GET_BLOCK) as RemoteValueKind[]).find((k) => REMOTE_GET_BLOCK[k] === blockType);
}
