import { useState } from "react";

export interface WidgetDrag<W> {
  uid: string;
  /**
   * "point": one point of a line widget (index in `point`); "crop": an edge of an arc's crop window (0..3 = left, top, right, bottom);
   * "rotate": the rotate handle (`pivot`: where the pointer started, relative to the widget centre, in canvas units).
   */
  mode: "move" | "resize" | "point" | "crop" | "rotate";
  point?: number;
  pivot?: { x: number; y: number };
  startX: number;
  startY: number;
  /** Canvas scroll at drag start (a wheel scroll mid-drag moves the widget along). */
  scrollX: number;
  scrollY: number;
  orig: W;
  cur: W;
}

/**
 * Move / resize a widget on a zoomable, scrollable canvas with pointer capture.
 * The caller decides where the widget goes (`place`) and commits on `end()`.
 */
export function useWidgetDrag<W extends { uid: string }>(canvasRef: React.RefObject<HTMLDivElement | null>) {
  const [drag, setDrag] = useState<WidgetDrag<W> | null>(null);

  return {
    drag,
    /** Start dragging `w` (call from the widget's onPointerDown). */
    begin: (e: React.PointerEvent, w: W, mode: WidgetDrag<W>["mode"], point?: number, pivot?: WidgetDrag<W>["pivot"]) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const el = canvasRef.current;
      setDrag({ uid: w.uid, mode, point, pivot, startX: e.clientX, startY: e.clientY, scrollX: el?.scrollLeft ?? 0, scrollY: el?.scrollTop ?? 0, orig: w, cur: w });
    },
    /**
     * Pointer moved: `place` maps the travel since the start (in canvas units:
     * client px + scroll change, divided by `scale`) to the widget's new state.
     */
    move: (e: React.PointerEvent, scale: number, place: (orig: W, mode: WidgetDrag<W>["mode"], dx: number, dy: number, point?: number) => W) => {
      if (!drag) return;
      const el = canvasRef.current;
      const dx = (e.clientX - drag.startX + (el ? el.scrollLeft - drag.scrollX : 0)) / scale;
      const dy = (e.clientY - drag.startY + (el ? el.scrollTop - drag.scrollY : 0)) / scale;
      setDrag({ ...drag, cur: place(drag.orig, drag.mode, dx, dy, drag.point) });
    },
    /** Pointer released: clears the drag and returns it (null if none) for the caller to commit. */
    end: (): WidgetDrag<W> | null => {
      const d = drag;
      if (d) setDrag(null);
      return d;
    },
    cancel: () => setDrag(null),
  };
}

/** Whether a drag changed the widget's box. */
export function boxChanged(d: WidgetDrag<{ x: number; y: number; w: number; h: number }>): boolean {
  const { cur, orig } = d;
  return cur.x !== orig.x || cur.y !== orig.y || cur.w !== orig.w || cur.h !== orig.h;
}
