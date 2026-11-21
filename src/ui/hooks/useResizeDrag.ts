import { useRef } from "react";

/**
 * Pointer-captured drag for resizable panes. `getSize` is read when the drag
 * starts; `onResize` gets start size + pointer travel along `axis`
 * (negated when `invert`, i.e. the pane grows towards negative coordinates).
 */
export function useResizeDrag({ axis, invert, getSize, onResize }: {
  axis: "x" | "y";
  invert?: boolean;
  getSize: () => number;
  onResize: (next: number) => void;
}) {
  const drag = useRef<{ start: number; startSize: number } | null>(null);
  const pos = (e: React.PointerEvent) => (axis === "x" ? e.clientX : e.clientY);

  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { start: pos(e), startSize: getSize() };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const delta = invert ? d.start - pos(e) : pos(e) - d.start;
      onResize(d.startSize + delta);
    },
    onPointerUp,
    onPointerCancel: onPointerUp,
  };
}
