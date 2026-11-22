import { useEffect, useRef, useState } from "react";
import { useResizeDrag } from "../hooks/useResizeDrag";
import styles from "./SplitPane.module.css";

function loadRatio(key: string, fallback: number): number {
  try {
    const n = Number(localStorage.getItem(key));
    if (localStorage.getItem(key) !== null && Number.isFinite(n) && n >= 0 && n <= 1) return n;
  } catch { /* storage unavailable */ }
  return fallback;
}

/**
 * Top / bottom split with a draggable separator. The top part's share of the
 * height is remembered in localStorage under `storageKey`. Without `bottom`,
 * `top` fills the whole height.
 */
export function SplitPane({ storageKey, defaultRatio, top, bottom }: {
  storageKey: string;
  /** Share of the height given to `top` (0–1). */
  defaultRatio: number;
  top: React.ReactNode;
  bottom?: React.ReactNode;
}) {
  const [ratio, setRatio] = useState(() => loadRatio(storageKey, defaultRatio));
  const boxRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey, String(ratio)); } catch { /* not remembered */ }
  }, [storageKey, ratio]);

  const resize = useResizeDrag({
    axis: "y",
    getSize: () => topRef.current?.getBoundingClientRect().height ?? 0,
    onResize: (px) => {
      const total = boxRef.current?.getBoundingClientRect().height ?? 0;
      if (total > 0) setRatio(Math.min(1, Math.max(0, px / total)));
    },
  });

  const hasBottom = bottom !== undefined && bottom !== null && bottom !== false;
  return (
    <div ref={boxRef} className={styles.box}>
      <div ref={topRef} className={styles.pane} style={hasBottom ? { flex: `0 0 ${ratio * 100}%` } : { flex: 1 }}>{top}</div>
      {hasBottom && (
        <>
          <div role="separator" aria-orientation="horizontal" title="Drag to resize · double-click to reset"
            className={styles.handle} onDoubleClick={() => setRatio(defaultRatio)} {...resize} />
          <div className={styles.pane} style={{ flex: 1 }}>{bottom}</div>
        </>
      )}
    </div>
  );
}
