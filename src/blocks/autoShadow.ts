import * as Blockly from "blockly/core";
import { defaultShadow } from "./toolbox";

/**
 * Give every empty value input of `block` (no child, no shadow) its default
 * shadow, so every slot stays editable without separate literal blocks.
 * Covers inputs the toolbox can't prefill: mutator-added (else-if, list / join
 * items), function-call arguments, blocks from older projects.
 */
function fillBlock(block: Blockly.Block): void {
  if (block.isShadow() || block.isInsertionMarker() || block.isDeadOrDying()) return;
  for (const input of block.inputList) {
    const conn = input.connection;
    if (!conn || conn.type !== Blockly.ConnectionType.INPUT_VALUE) continue;
    if (conn.targetBlock() || conn.getShadowState()) continue;
    const shadow = defaultShadow(block.type, input.name, conn.getCheck());
    if (shadow) conn.setShadowState(shadow);
  }
}

/** Fill every block of `workspace` (e.g. right after loading a project). */
export function fillAllShadows(workspace: Blockly.Workspace): void {
  for (const b of workspace.getAllBlocks(false)) fillBlock(b);
}

/**
 * Change listener that keeps empty value inputs filled. Shadows are created
 * in the triggering event's group so they undo together with it; events
 * replayed by undo / redo are skipped.
 */
export function autoShadowListener(workspace: Blockly.Workspace): (e: Blockly.Events.Abstract) => void {
  return (e) => {
    if (e.isUiEvent || !e.recordUndo) return;
    const ids: string[] = [];
    if (e.type === Blockly.Events.BLOCK_CREATE) ids.push(...((e as Blockly.Events.BlockCreate).ids ?? []));
    else if (e.type === Blockly.Events.BLOCK_CHANGE) ids.push((e as Blockly.Events.BlockChange).blockId ?? "");
    else if (e.type === Blockly.Events.BLOCK_MOVE) ids.push((e as Blockly.Events.BlockMove).oldParentId ?? "");
    else return;
    const blocks = ids.map((id) => (id ? workspace.getBlockById(id) : null)).filter((b): b is Blockly.Block => !!b);
    if (!blocks.length) return;
    const prevGroup = Blockly.Events.getGroup();
    Blockly.Events.setGroup(e.group || prevGroup || true);
    try {
      for (const b of blocks) fillBlock(b);
    } finally {
      Blockly.Events.setGroup(prevGroup || false);
    }
  };
}
