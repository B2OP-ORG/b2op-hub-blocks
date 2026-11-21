import { Button } from "./Button";
import styles from "./ColorField.module.css";

/**
 * Colour picker. Unless `required`, the value may be `undefined` (= theme default),
 * with buttons to switch between a custom colour and the default.
 */
export function ColorField({ label, value, onChange, required, initial = "#ffffff" }: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  required?: boolean;
  /** Colour picked when switching from the theme default to a custom colour. */
  initial?: string;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {value !== undefined ? (
        <>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className={styles.swatch} />
          {!required && (
            <Button variant="muted" size="xs" title="Use the theme default" onClick={(e) => { e.preventDefault(); onChange(undefined); }}>
              default
            </Button>
          )}
        </>
      ) : (
        <Button size="xs" onClick={(e) => { e.preventDefault(); onChange(initial); }}>theme default · set</Button>
      )}
    </label>
  );
}
