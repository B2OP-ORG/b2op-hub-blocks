import styles from "./ResizeHandle.module.css";

/** Thin vertical drag handle between two panes (pair with useResizeDrag). */
export function ResizeHandle({ side, title, onDoubleClick, handlers }: {
  /** Which side of the content the handle sits on. */
  side: "left" | "right";
  title: string;
  onDoubleClick?: () => void;
  handlers: Pick<React.HTMLAttributes<HTMLDivElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel">;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title={title}
      onDoubleClick={onDoubleClick}
      className={`${styles.handle} ${styles[side]}`}
      {...handlers}
    />
  );
}
