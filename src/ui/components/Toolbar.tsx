import styles from "./Toolbar.module.css";

/** Horizontal editor bar. `main` = title bar, `palette` = the widget palette row below it. */
export function Toolbar({ variant = "main", children }: { variant?: "main" | "palette"; children: React.ReactNode }) {
  return <div className={`${styles.bar} ${styles[variant]}`}>{children}</div>;
}

export function ToolbarTitle({ children }: { children: React.ReactNode }) {
  return <span className={styles.title}>{children}</span>;
}

/** Muted one-line message shown in a palette bar instead of the palette. */
export function ToolbarHint({ children }: { children: React.ReactNode }) {
  return <span className={styles.hint}>{children}</span>;
}

export function ToolbarSeparator() {
  return <span className={styles.separator} />;
}
