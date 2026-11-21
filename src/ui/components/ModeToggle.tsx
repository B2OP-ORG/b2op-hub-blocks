import styles from "./ModeToggle.module.css";

export interface ModeOption<T extends string> {
  value: T;
  label: string;
  title: string;
  icon?: React.ReactNode;
}

/** Segmented control (e.g. Edit / Preview). The active option is not clickable. */
export function ModeToggle<T extends string>({ value, options, onChange, disabled }: {
  /** Active option; null = none (e.g. run mode, which is neither). */
  value: T | null;
  options: ModeOption<T>[];
  onChange: (v: T) => void;
  /** Disable switching entirely (the active option stays highlighted). */
  disabled?: boolean;
}) {
  return (
    <div className={styles.group}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled || active}
            onClick={() => onChange(o.value)}
            title={o.title}
            aria-pressed={active}
            className={active ? `${styles.option} ${styles.active}` : styles.option}
          >
            {o.icon}{o.label}
          </button>
        );
      })}
    </div>
  );
}
