import styles from "./InlineInput.module.css";

/** Inline rename input used in tree rows and tabs. Selects the name stem on focus. */
export function InlineInput({ value, onChange, onCommit, onCancel }: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => {
        const dot = e.currentTarget.value.lastIndexOf(".");
        e.currentTarget.setSelectionRange(0, dot > 0 ? dot : e.currentTarget.value.length);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onCommit();
        if (e.key === "Escape") onCancel();
      }}
      onBlur={onCommit}
      onClick={(e) => e.stopPropagation()}
      className={styles.input}
    />
  );
}
