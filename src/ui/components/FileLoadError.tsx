import { Button } from "./Button";
import styles from "./FileLoadError.module.css";

/** Shown by an editor when its file can't be parsed, with a way to reset it. */
export function FileLoadError({ fileName, error, resetLabel, onReset }: {
  fileName: string;
  error: string;
  resetLabel: string;
  onReset: () => void;
}) {
  return (
    <div className={styles.box}>
      <div className={styles.title}>Can't open {fileName}</div>
      <div className={styles.error}>{error}</div>
      <Button variant="danger" onClick={onReset}>{resetLabel}</Button>
    </div>
  );
}
