import styles from "./CheckField.module.css";

/** Checkbox with its label to the right. */
export function CheckField({ label, value, onChange }: { label: React.ReactNode; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
