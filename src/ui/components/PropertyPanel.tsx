import { Trash2 } from "lucide-react";
import { Button } from "./Button";
import styles from "./PropertyPanel.module.css";

/** Inspector of the scene / remote editors; fills its side panel and scrolls. */
export function PropertyPanel({ title, subtitle, children }: {
  /** Bold header line (e.g. the widget kind); omit for a header-less panel. */
  title?: React.ReactNode;
  /** Muted text after the title, prefixed with "·". */
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.panel}>
      {title !== undefined && (
        <div className={styles.header}>
          {title}
          {subtitle !== undefined && <> <span className={styles.subtitle}>· {subtitle}</span></>}
        </div>
      )}
      {children}
    </div>
  );
}

/** "In Python" box showing how to use the selected item from code. */
export function CodeUsage({ code }: { code: string }) {
  return (
    <div className={styles.usage}>
      <div className={styles.usageLabel}>In Python</div>
      <pre className={styles.usageCode}>{code}</pre>
    </div>
  );
}

/** Small note under a field. */
export function PropertyNote({ tone = "danger", children }: { tone?: "danger" | "warn" | "dim"; children: React.ReactNode }) {
  return <div className={`${styles.note} ${styles[tone]}`}>{children}</div>;
}

export function DeleteButton({ onClick, label = "Delete" }: { onClick: () => void; label?: string }) {
  return (
    <Button variant="danger" icon={<Trash2 size={13} />} onClick={onClick} style={{ alignSelf: "flex-start" }}>
      {label}
    </Button>
  );
}
