import styles from "./SectionTitle.module.css";

/** Small uppercase heading; with `action`, a right-aligned link button follows. */
export function SectionTitle({ children, action, style }: {
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
  style?: React.CSSProperties;
}) {
  if (!action) return <div className={styles.title} style={style}>{children}</div>;
  return (
    <div className={styles.row} style={style}>
      <div className={styles.title}>{children}</div>
      <button type="button" onClick={action.onClick} className={styles.action}>{action.label}</button>
    </div>
  );
}
