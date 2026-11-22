import styles from "./ModeToggle.module.css";

export interface ModeOption<T extends string> {
  value: T;
  label: string;
  title: string;
  icon?: React.ReactNode;
}

/** Segmented control (e.g. Edit / Preview). The active option is not clickable. */
export function ModeToggle<T extends string>({ value, options, onChange, disabled, iconOnly }: {
  /** Active option; null = none (e.g. run mode, which is neither). */
  value: T | null;
  options: ModeOption<T>[];
  onChange: (v: T) => void;
  /** Disable switching entirely (the active option stays highlighted). */
  disabled?: boolean;
  /** Hide the labels (compact toolbar); the label moves into the tooltip. */
  iconOnly?: boolean;
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
            title={iconOnly ? `${o.label}: ${o.title}` : o.title}
            aria-label={o.label}
            aria-pressed={active}
            className={[styles.option, active && styles.active, iconOnly && styles.iconOnly].filter(Boolean).join(" ")}
          >
            {o.icon}{!iconOnly && o.label}
          </button>
        );
      })}
    </div>
  );
}
