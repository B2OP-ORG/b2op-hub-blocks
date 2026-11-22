import { Redo2, Undo2 } from "lucide-react";
import type { UndoRedo } from "../hooks/useUndoRedo";
import { IconButton } from "./IconButton";

/** Undo / redo pair for an editor toolbar. */
export function UndoRedoButtons({ history }: { history: UndoRedo }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
      <IconButton variant="toolbar" title="Undo (Ctrl Z)" onClick={history.undo} disabled={!history.canUndo}><Undo2 size={14} /></IconButton>
      <IconButton variant="toolbar" title="Redo (Ctrl Shift Z)" onClick={history.redo} disabled={!history.canRedo}><Redo2 size={14} /></IconButton>
    </div>
  );
}
