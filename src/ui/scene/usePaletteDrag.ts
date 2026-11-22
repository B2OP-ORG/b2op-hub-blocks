import { useEffect, useRef, useState } from "react";
import type { SceneKind } from "../../scene/model";

/** A widget being dragged in from the palette (client coordinates). */
export type NewDrag = {
  kind: SceneKind; startX: number; startY: number; x: number; y: number; moved: boolean;
  /** The pointer has been outside the toolbox (so coming back over it means "put it back"). */
  away: boolean;
};

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
    /**
     * Pointer (x, y) near the bin, or the dragged thing's client `rect`
     * touching it: the bin accepts in a generous range.
     */
    hit: (x: number, y: number, rect?: { left: number; top: number; right: number; bottom: number } | null) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return false;
      const m = 16;
      if (x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m) return true;
      return !!rect && rect.right >= r.left && rect.left <= r.right && rect.bottom >= r.top && rect.top <= r.bottom;
    },
  };
}

/**
 * Palette drag: pointer events on the window (the chip stays put), the widget
 * itself follows the pointer. `onDrop` is read at drop time, so it may change
 * every render (it needs the current scene); the listeners only change per drag.
 */
export function usePaletteDrag(trash: ReturnType<typeof useTrash>, onDrop: (d: NewDrag) => void,
  /** Client rect the dragged widget's ghost covers with the pointer at (x, y). */
  ghostRect?: (d: NewDrag, x: number, y: number) => { left: number; top: number; right: number; bottom: number } | null,
  /** Client rect of the toolbox the drag started in. */
  homeRect?: () => DOMRect | undefined) {
  const [newDrag, setNewDragState] = useState<NewDrag | null>(null);
  const newDragRef = useRef<NewDrag | null>(null);
  const setNewDrag = (d: NewDrag | null) => { newDragRef.current = d; setNewDragState(d); };
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const trashRef = useRef(trash);
  trashRef.current = trash;
  const ghostRef = useRef(ghostRect);
  ghostRef.current = ghostRect;
  const homeRef = useRef(homeRect);
  homeRef.current = homeRect;

  const dragging = newDrag !== null;
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const d = newDragRef.current;
      if (!d) return;
      const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4;
      const h = homeRef.current?.();
      const inHome = !!h && e.clientX >= h.left && e.clientX <= h.right && e.clientY >= h.top && e.clientY <= h.bottom;
      setNewDrag({ ...d, x: e.clientX, y: e.clientY, moved, away: d.away || (moved && !inHome) });
      trashRef.current.set(moved && trashRef.current.hit(e.clientX, e.clientY, ghostRef.current?.(d, e.clientX, e.clientY)));
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
    start: (kind: SceneKind, x: number, y: number) => setNewDrag({ kind, startX: x, startY: y, x, y, moved: false, away: false }),
  };
}
