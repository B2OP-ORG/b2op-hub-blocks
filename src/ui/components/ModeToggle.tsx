import styles from "./ModeToggle.module.css";

export interface ModeOption<T extends string> {
  value: T;
  label: string;
  title: string;
  icon?: React.ReactNode;
}

/**
 * Sliding switch between modes (e.g. Edit / Preview). One button: a click
 * anywhere on it moves to the next option (with two options, the other one),
 * and the highlight slides over.
 */
export function ModeToggle<T extends string>({ value, options, onChange, disabled, iconOnly }: {
  /** Active option; null = none (e.g. run mode, which is neither). */
  value: T | null;
  options: ModeOption<T>[];
  onChange: (v: T) => void;
  /** Disable switching entirely (the active option stays highlighted). */
  disabled?: boolean;
  /** Hide the labels (compact toolbar); the labels move into the tooltip. */
  iconOnly?: boolean;
}) {
  const index = options.findIndex((o) => o.value === value);
  const next = options[(index + 1) % options.length];
  const current = options[index];
  const title = [
    current ? `${iconOnly ? `${current.label}: ` : ""}${current.title}` : null,
    !disabled && next ? `Click to switch to ${next.label.toLowerCase()}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      role="radiogroup"
      disabled={disabled}
      title={title}
      onClick={() => { if (next) onChange(next.value); }}
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const o = options[Math.min(options.length - 1, Math.max(0, (index < 0 ? 0 : index) + step))];
        if (o && o.value !== value) onChange(o.value);
      }}
      className={styles.group}
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      {index >= 0 && (
        <span aria-hidden className={styles.thumb}
          style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${index * 100}%)` }} />
      )}
      {options.map((o, i) => (
        <span key={o.value} role="radio" aria-checked={i === index} aria-label={o.label}
          className={[styles.option, i === index && styles.active, iconOnly && styles.iconOnly].filter(Boolean).join(" ")}>
          {o.icon}{!iconOnly && o.label}
        </span>
      ))}
    </button>
  );
}
