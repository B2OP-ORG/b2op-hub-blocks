import { useApp } from "../../state/store";
import { DEFAULT_PY_PREVIEW_WIDTH } from "../../settings/storage";
import { useResizeDrag } from "../hooks/useResizeDrag";
import styles from "./PythonPanel.module.css";

/** Narrower than this → the panel closes. */
const CLOSE_BELOW = 40;
const maxWidth = () => Math.max(CLOSE_BELOW, Math.round(window.innerWidth * 0.7));

/**
 * Read-only Python panel on the right of the blocks / scene editor. The 3px
 * separator resizes it (drag it shut to close, out again to open; double-click
 * toggles); the header has a toggle too. State: store `pyPanel`.
 */
export function PythonPanel({ children }: { children: React.ReactNode }) {
  const { open, width } = useApp((s) => s.pyPanel);
  const setPyPanel = useApp((s) => s.setPyPanel);

  const resize = useResizeDrag({
    axis: "x",
    invert: true,
    getSize: () => (open ? width : 0),
    onResize: (next) => {
      if (next < CLOSE_BELOW) { if (open) setPyPanel({ open: false }); return; }
      setPyPanel({ open: true, width: Math.min(next, maxWidth()) });
    },
  });

  return (
    <div className={styles.panel}>
      <div role="separator" aria-orientation="vertical" className={styles.sep}
        title={open ? "Drag to resize · double-click to hide the Python code" : "Drag or double-click to show the Python code"}
        onDoubleClick={() => setPyPanel(open ? { open: false } : { open: true, width: width || DEFAULT_PY_PREVIEW_WIDTH })}
        {...resize} />
      {open && <div className={styles.content}>{children}</div>}
    </div>
  );
}
