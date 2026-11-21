import styles from "./EmptyNote.module.css";

/** Muted placeholder text for an empty list or panel. */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className={styles.note}>{children}</div>;
}
