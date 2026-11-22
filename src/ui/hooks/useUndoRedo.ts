import { useEffect, useRef } from "react";
import { useApp } from "../../state/store";
import { recordEdit, redoEdit, undoEdit, useEditHistory, type EditSnapshot } from "../editHistory";

/**
 * Write `content` to a visual editor's file as one undo step; `selected` is
 * the selection to restore on undo, `coalesceKey` merges quick repeats (see
 * editHistory.ts). No-op when the content is unchanged.
 */
export function commitEdit(fileId: string, content: string, selected: string | null, coalesceKey?: string): void {
  const st = useApp.getState();
  const before = st.mfp.files.find((f) => f.id === fileId)?.content;
  if (content === before) return;
  if (before !== undefined) recordEdit(fileId, { content: before, selected }, coalesceKey);
  st.updateFile(fileId, content);
}

/**
 * Undo / redo of a visual editor's file (history: editHistory.ts). Ctrl Z =
 * undo, Ctrl Shift Z / Ctrl Y = redo anywhere in `rootRef` (or with nothing
 * focused), except text fields, which keep their own undo.
 * `enabled`: false while a step can't run (preview, a drag in progress, a broken file).
 * `restore`: put a snapshot back (write the file, re-select).
 */
export function useUndoRedo({ fileId, rootRef, selected, enabled, restore }: {
  fileId: string;
  rootRef: React.RefObject<HTMLElement | null>;
  selected: string | null;
  enabled: boolean;
  restore: (s: EditSnapshot) => void;
}) {
  const history = useEditHistory(fileId);
  const step = (redo: boolean) => {
    if (!enabled) return;
    const content = useApp.getState().mfp.files.find((f) => f.id === fileId)?.content;
    if (content === undefined) return;
    const current: EditSnapshot = { content, selected };
    const s = redo ? redoEdit(fileId, current) : undoEdit(fileId, current);
    if (s) restore(s);
  };
  // Refreshed every render (the shortcut listener is installed once).
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && !(k === "y" && !e.shiftKey)) return;
      const t = e.target as HTMLElement;
      if (t !== document.body && !rootRef.current?.contains(t)) return;
      if (t.closest("textarea,[contenteditable],input:not([type=checkbox],[type=radio],[type=color],[type=range],[type=button])")) return;
      e.preventDefault();
      stepRef.current(k === "y" || e.shiftKey);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rootRef]);

  return {
    canUndo: enabled && history.canUndo,
    canRedo: enabled && history.canRedo,
    undo: () => step(false),
    redo: () => step(true),
  };
}

export type UndoRedo = ReturnType<typeof useUndoRedo>;
