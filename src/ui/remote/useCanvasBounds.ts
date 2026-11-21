import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Widget } from "../../remote/layout";
import { canvasBounds } from "./bounds";

/**
 * Scrollable area of the remote canvas (see canvasBounds) for the committed
 * widgets. When it grows / shrinks on the left or top, the scroll position
 * moves by the same amount so nothing on screen jumps. `origin` may be reset
 * by a caller that sets the scroll itself (fit).
 */
export function useCanvasBounds({ canvasRef, widgets, hasLayout, zoom, zoomRef }: {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  /** Committed widgets only: the area grows after a drop, not while dragging. */
  widgets: Widget[];
  /** Re-attach the size observer when the canvas element appears. */
  hasLayout: boolean;
  zoom: number;
  zoomRef: React.RefObject<number>;
}) {
  // Visible canvas size (layout units come from it: the home view is this size / zoom).
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [canvasRef, hasLayout]);

  const bounds = useMemo(() => canvasBounds(widgets, viewSize.w / zoom, viewSize.h / zoom), [widgets, viewSize, zoom]);

  const origin = useRef({ left: bounds.left, top: bounds.top });
  useLayoutEffect(() => {
    const el = canvasRef.current, o = origin.current;
    origin.current = { left: bounds.left, top: bounds.top };
    if (!el) return;
    // Zoom is read, not a trigger: zoom changes keep their own anchor (useCanvasView).
    el.scrollLeft += (o.left - bounds.left) * zoomRef.current;
    el.scrollTop += (o.top - bounds.top) * zoomRef.current;
  }, [canvasRef, bounds.left, bounds.top, zoomRef]);

  return { bounds, origin };
}
