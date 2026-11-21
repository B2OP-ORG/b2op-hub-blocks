import { useEffect, useRef, useState } from "react";
import type { SceneKind } from "../../scene/model";

/** A widget being dragged in from the palette (client coordinates). */
export type NewDrag = { kind: SceneKind; startX: number; startY: number; x: number; y: number; moved: boolean };

/** Drop zone that deletes what is released over it. */
export function useTrash() {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const overRef = useRef(false);
  return {
    ref,
    over,
    /** Current value, safe to read in event handlers of the same tick. */
    overRef,
    set: (v: boolean) => { overRef.current = v; setOver(v); },
    hit: (x: number, y: number) => {
      const r = ref.current?.getBoundingClientRect();
      return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    },
  };
}

/**
 * Palette drag: pointer events on the window (the chip stays put), the widget
 * itself follows the pointer. `onDrop` is read at drop time, so it may change
 * every render (it needs the current scene); the listeners only change per drag.
 */
export function usePaletteDrag(trash: ReturnType<typeof useTrash>, onDrop: (d: NewDrag) => void) {
  const [newDrag, setNewDragState] = useState<NewDrag | null>(null);
  const newDragRef = useRef<NewDrag | null>(null);
  const setNewDrag = (d: NewDrag | null) => { newDragRef.current = d; setNewDragState(d); };
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const trashRef = useRef(trash);
  trashRef.current = trash;

  const dragging = newDrag !== null;
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const d = newDragRef.current;
      if (!d) return;
      const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4;
      setNewDrag({ ...d, x: e.clientX, y: e.clientY, moved });
      trashRef.current.set(moved && trashRef.current.hit(e.clientX, e.clientY));
    };
    const up = () => {
      const d = newDragRef.current;
      setNewDrag(null);
      if (d) dropRef.current(d);
      trashRef.current.set(false);
    };
    const cancel = () => { setNewDrag(null); trashRef.current.set(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") cancel(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [dragging]);

  return {
    newDrag,
    /** Pointer pressed on a palette chip (a release without moving counts as a click). */
    start: (kind: SceneKind, x: number, y: number) => setNewDrag({ kind, startX: x, startY: y, x, y, moved: false }),
  };
}
