import styles from "./ListRow.module.css";

export interface ListRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Nesting level; each level adds `indent` px of left padding. */
  depth?: number;
  indent?: number;
  /** Vertical / horizontal padding in px. */
  padY?: number;
  padX?: number;
  gap?: number;
  active?: boolean;
  /** Show a 2px accent bar on the left of the active row. */
  bar?: boolean;
  /** Stack children instead of laying them out in a row. */
  block?: boolean;
}

/** Hoverable row in a sidebar list or tree. */
export function ListRow({ depth = 0, indent = 12, padY = 3, padX = 8, gap = 5, active, bar, block, className, style, ...rest }: ListRowProps) {
  const cls = [styles.row, block && styles.block, bar && styles.bar, active && styles.active, className].filter(Boolean).join(" ");
  return (
    <div
      className={cls}
      style={{ gap, padding: `${padY}px ${padX}px ${padY}px ${padX + depth * indent}px`, ...style }}
      {...rest}
    />
  );
}

/** Icon slot of a row. `top` aligns by padding instead of line height. */
export function RowIcon({ children, color, top, width }: { children?: React.ReactNode; color?: string; top?: boolean; width?: number }) {
  return <span className={top ? styles.iconTop : styles.icon} style={{ color, width }}>{children}</span>;
}

/** Wrapping text of a row. */
export function RowLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className={styles.label} style={style}>{children}</div>;
}

/** Muted second line under a row label. */
export function RowDetail({ children }: { children: React.ReactNode }) {
  return <div className={styles.detail}>{children}</div>;
}
