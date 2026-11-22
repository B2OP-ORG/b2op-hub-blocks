import { useEffect, useRef } from "react";
import type { SidePanelState } from "../hooks/useSidePanels";
import { useResizeDrag } from "../hooks/useResizeDrag";
import styles from "./SidePanel.module.css";

/** Narrower than this when released → the panel closes. */
const CLOSE_BELOW = 24;
/** Pointer travel that turns a press on the handle into a drag (no click). */
const CLICK_SLOP = 3;
const maxWidth = () => Math.max(CLOSE_BELOW, Math.min(600, Math.round(window.innerWidth * 0.4)));

/**
 * Resizable, closeable column at the left / right edge of an editor. Any width
 * goes: below `contentMinWidth` the content keeps that width and scrolls
 * sideways. Dragging the edge (almost) shut closes it to a 1px line; click or
 * drag that line to open it again. State comes from useSidePanels.
 */
export function SidePanel({ side, state, contentMinWidth, children }: {
  side: "left" | "right";
  state: SidePanelState;
  contentMinWidth: number;
  children: React.ReactNode;
}) {
  const { open } = state;
  const width = Math.min(state.width, maxWidth());
  const press = useRef<{ x: number; moved: boolean } | null>(null);

  // Canvases / editors relayout on window resize.
  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(id);
  }, [width, open]);

  const resize = useResizeDrag({
    axis: "x",
    invert: side === "right",
    getSize: () => (open ? width : 0),
    onResize: (next) => {
      // The stored width is kept on close, so the toggle reopens at the last real size.
      if (next < CLOSE_BELOW) { if (open) state.setOpen(false); return; }
      if (!open) state.setOpen(true);
      state.setWidth(Math.min(next, maxWidth()));
    },
  });

  const handle = (
    <div
      key="handle"
      role="separator"
      aria-orientation="vertical"
      title={open ? "Drag to resize · double-click to reset" : "Drag or click to open"}
      className={`${styles.handle} ${open ? styles.open : styles.closed} ${styles[side]}`}
      {...resize}
      onPointerDown={(e) => { press.current = { x: e.clientX, moved: false }; resize.onPointerDown(e); }}
      onPointerMove={(e) => {
        if (press.current && Math.abs(e.clientX - press.current.x) > CLICK_SLOP) press.current.moved = true;
        resize.onPointerMove(e);
      }}
      // A click opens the closed line, but not the click that ends a drag (e.g. the one that just closed it).
      onClick={() => { if (!open && !press.current?.moved) state.setOpen(true); press.current = null; }}
      onDoubleClick={open ? () => state.setWidth(state.defaultWidth) : undefined}
    />
  );
  const panel = open && (
    <div key="panel" className={`${styles.panel} ${styles[side]}`} style={{ width }}>
      <div className={styles.inner} style={{ minWidth: contentMinWidth }}>{children}</div>
    </div>
  );
  return side === "left" ? <>{panel}{handle}</> : <>{handle}{panel}</>;
}
