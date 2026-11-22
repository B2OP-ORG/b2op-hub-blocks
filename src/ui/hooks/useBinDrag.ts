import { useRef, useState } from "react";
import { useTrash } from "./usePaletteDrag";

/** How close (client px) the pointer must come to the toolbox for it to start acting as a bin. */
const HEAT_RANGE = 120;

/**
 * Deleting widgets by dragging them away, shared by the visual editors: onto
 * the corner bin (`trash`, see TrashTarget) or back onto the toolbox, which
 * heats up as the pointer nears it (ToolboxBin). Also tracks where a widget
 * dragged out of the canvas should be drawn (`outsideGhost`).
 */
export function useBinDrag({ paletteRef, canvasRef }: {
  /** The toolbox (palette panel). */
  paletteRef: React.RefObject<HTMLElement | null>;
  canvasRef: React.RefObject<HTMLElement | null>;
}) {
  const trash = useTrash();
  /** Moving a widget: 0..1 as the pointer nears the toolbox (1 = over it: drop deletes). */
  const [heat, setHeat] = useState(0);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  /** Moving a widget: its client rect and the pointer at the start. */
  const start = useRef<{ rect: DOMRect; x: number; y: number } | null>(null);

  /** 0..1 as client point (x, y) nears the toolbox (1 = over it). */
  const heatAt = (x: number, y: number) => {
    const pr = paletteRef.current?.getBoundingClientRect();
    if (!pr) return 0;
    const dist = Math.hypot(Math.max(pr.left - x, 0, x - pr.right), Math.max(pr.top - y, 0, y - pr.bottom));
    return Math.max(0, Math.min(1, 1 - dist / HEAT_RANGE));
  };

  return {
    trash,
    heat,
    heatAt,
    /** The moved widget would be deleted if released now. */
    over: trash.over || heat >= 1,
    /** A widget move starts (call from its onPointerDown; `e.currentTarget` is the widget). */
    begin: (e: React.PointerEvent) => {
      start.current = { rect: (e.currentTarget as HTMLElement).getBoundingClientRect(), x: e.clientX, y: e.clientY };
    },
    /** Pointer moved while moving a widget. */
    move: (e: React.PointerEvent) => {
      trash.set(trash.hit(e.clientX, e.clientY));
      setHeat(heatAt(e.clientX, e.clientY));
      setPointer({ x: e.clientX, y: e.clientY });
    },
    /** The move ended: resets and returns whether the widget is to be deleted. */
    end: (): boolean => {
      const del = trash.overRef.current || heat >= 1;
      trash.set(false);
      setHeat(0);
      setPointer(null);
      start.current = null;
      return del;
    },
    /**
     * Centre (client px) of the moved widget while the pointer is outside the
     * canvas, so it can be drawn following the pointer; null inside.
     */
    outsideGhost: (): { x: number; y: number } | null => {
      const st = start.current, c = canvasRef.current?.getBoundingClientRect();
      if (!pointer || !st || !c) return null;
      if (pointer.x >= c.left && pointer.x <= c.right && pointer.y >= c.top && pointer.y <= c.bottom) return null;
      return { x: st.rect.left + st.rect.width / 2 + pointer.x - st.x, y: st.rect.top + st.rect.height / 2 + pointer.y - st.y };
    },
  };
}
