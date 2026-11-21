/**
 * Upgrade workspace JSON saved by older editor versions to the current block
 * shapes. Pure: returns a migrated copy, never mutates `state`. Run it on every
 * state before `Blockly.serialization.workspaces.load`.
 */

import { findSymbol } from "../remote/registry";
import { REMOTE_GET_BLOCK, remoteValueKind } from "./remoteKinds";

interface BlockState {
  type?: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: BlockState; shadow?: BlockState }>;
  next?: { block?: BlockState; shadow?: BlockState };
  [k: string]: unknown;
}

/** Per-block upgrades. Each takes and returns a shallow-copied block state. */
const BLOCK_MIGRATIONS: Record<string, (b: BlockState) => BlockState> = {
  // The untyped remote reporter was split per value kind; an unknown block
  // type would make the whole workspace fail to load.
  remote_get: (b) => {
    const sym = typeof b.fields?.NAME === "string" ? findSymbol("control", b.fields.NAME) : undefined;
    return { ...b, type: REMOTE_GET_BLOCK[sym ? remoteValueKind(sym.type) : "number"] };
  },
  // `set hub LED to` had a colour dropdown; it is now a value input (accepts
  // reporters) with a colour-word shadow.
  hub_led_color: (b) => {
    const colour = b.fields?.COLOR;
    if (typeof colour !== "string") return b;
    const { COLOR: _dropped, ...fields } = b.fields!;
    return {
      ...b,
      fields: Object.keys(fields).length ? fields : undefined,
      inputs: { ...b.inputs, COLOR: { shadow: { type: "color_literal", fields: { COLOR: colour } } } },
    };
  },
};

function migrateBlock(b: BlockState | undefined): BlockState | undefined {
  if (!b || typeof b !== "object") return b;
  let out: BlockState = { ...b };
  const m = out.type ? BLOCK_MIGRATIONS[out.type] : undefined;
  if (m) out = m(out);
  if (out.fields === undefined) delete out.fields;
  if (out.inputs) {
    const inputs: NonNullable<BlockState["inputs"]> = {};
    for (const [name, conn] of Object.entries(out.inputs)) {
      inputs[name] = { ...conn };
      if (conn.block) inputs[name].block = migrateBlock(conn.block);
      if (conn.shadow) inputs[name].shadow = migrateBlock(conn.shadow);
    }
    out.inputs = inputs;
  }
  if (out.next) {
    out.next = { ...out.next };
    if (out.next.block) out.next.block = migrateBlock(out.next.block);
    if (out.next.shadow) out.next.shadow = migrateBlock(out.next.shadow);
  }
  return out;
}

export function migrateWorkspaceState<T>(state: T): T {
  const s = state as { blocks?: { blocks?: BlockState[] } } | null;
  if (!s || typeof s !== "object" || !Array.isArray(s.blocks?.blocks)) return state;
  return {
    ...s,
    blocks: { ...s.blocks, blocks: s.blocks.blocks.map((b) => migrateBlock(b)) },
  } as T;
}
