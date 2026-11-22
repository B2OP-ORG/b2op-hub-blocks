import { useEffect, useRef, useState } from "react";

/** A widget being dragged in from the palette (client coordinates). */
export type NewDrag<K extends string = string> = {
  kind: K; startX: number; startY: number; x: number; y: number; moved: boolean;
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
    /** Pointer (x, y) over the bin, or within a small margin of it. */
    hit: (x: number, y: number) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return false;
      const m = 16;
      return x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m;
    },
  };
}

export type Trash = ReturnType<typeof useTrash>;

/**
 * Palette drag: pointer events on the window (the chip stays put), the widget
 * itself follows the pointer. `onDrop` is read at drop time, so it may change
 * every render (it needs the current scene); the listeners only change per drag.
 */
export function usePaletteDrag<K extends string>(trash: Trash, onDrop: (d: NewDrag<K>) => void,
  /** Client rect of the toolbox the drag started in. */
  homeRect?: () => DOMRect | undefined) {
  const [newDrag, setNewDragState] = useState<NewDrag<K> | null>(null);
  const newDragRef = useRef<NewDrag<K> | null>(null);
  const setNewDrag = (d: NewDrag<K> | null) => { newDragRef.current = d; setNewDragState(d); };
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const trashRef = useRef(trash);
  trashRef.current = trash;
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

  const start = (kind: K, x: number, y: number) => setNewDrag({ kind, startX: x, startY: y, x, y, moved: false, away: false });
  return {
    newDrag,
    /** Pointer pressed on a palette chip (a release without moving counts as a click). */
    start,
    /**
     * Props of a palette chip: pointer drag (a click is a drop without moving,
     * handled by `onDrop`); keyboard activation calls `onKeyboardAdd`.
     */
    chipProps: (k: K, onKeyboardAdd: (k: K) => void): React.ButtonHTMLAttributes<HTMLButtonElement> => ({
      onPointerDown: (e) => { if (e.button !== 0) return; e.preventDefault(); start(k, e.clientX, e.clientY); },
      // Keyboard activation only (detail 0): pointer clicks are handled by the drag.
      onClick: (e) => { if (e.detail === 0) onKeyboardAdd(k); },
      style: { touchAction: "none", userSelect: "none" },
    }),
  };
}
