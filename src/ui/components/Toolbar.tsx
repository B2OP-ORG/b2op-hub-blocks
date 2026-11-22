import { useRef } from "react";
import { useCompactLevel } from "../hooks/useCompactLevel";
import styles from "./Toolbar.module.css";

/**
 * One-line title bar of an editor (mode toggle, zoom, panel toggles). Never
 * wraps: like the app header, items compact step by step when it gets too
 * narrow. `children` gets the compaction level 0…`maxCompact`.
 */
export function Toolbar({ maxCompact, children }: { maxCompact: number; children: (compact: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const compact = useCompactLevel(ref, maxCompact);
  return <div ref={ref} className={styles.bar}>{children(compact)}</div>;
}
