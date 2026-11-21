import styles from "./Field.module.css";

/** Label above a control; optional error line below. */
export function Field({ label, error, grow, children }: {
  label: React.ReactNode;
  error?: string | null;
  /** Share the width of a FieldRow (flex: 1). */
  grow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={grow ? `${styles.field} ${styles.grow}` : styles.field}>
      {label}
      {children}
      {error && <span className={styles.error}>{error}</span>}
    </label>
  );
}

/** Lays out its fields side by side. */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}
