import styles from "./Callout.module.css";

/** Inline notice in a dialog body: `warn` = red box, `ok` = check-marked line. */
export function Callout({ kind, children }: { kind: "warn" | "ok"; children: React.ReactNode }) {
  return (
    <div className={`${styles.callout} ${styles[kind]}`}>
      {kind === "ok" && "✓ "}
      {children}
    </div>
  );
}
