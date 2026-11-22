import { ChevronDown, ChevronRight } from "lucide-react";
import styles from "./PaletteGroup.module.css";

/**
 * A titled group of widget "chips" in an editor palette, one per line. The caller supplies the drag behaviour per chip (`chipProps`),
 * e.g. HTML5 drag or pointer drag. With `onToggle` the title folds the group.
 */
export function PaletteGroup<K extends string>({ title, kinds, label, hint, chipProps, icon, active, folded, onToggle }: {
  title: string;
  kinds: K[];
  label: (k: K) => string;
  hint: (k: K) => string;
  chipProps: (k: K) => React.ButtonHTMLAttributes<HTMLButtonElement>;
  /** Icon drawn before the label. */
  icon?: (k: K) => React.ReactNode;
  /** Pressed look (e.g. the selected draw tool). */
  active?: (k: K) => boolean;
  folded?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className={styles.group}>
      {onToggle ? (
        <button type="button" className={`${styles.title} ${styles.titleButton}`} onClick={onToggle} aria-expanded={!folded}>
          {folded ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          {title}
        </button>
      ) : (
        <div className={styles.title}>{title}</div>
      )}
      {!folded && (
        <div className={styles.chips}>
          {kinds.map((k) => {
            const on = active?.(k);
            return (
              <button key={k} type="button" title={hint(k)} className={on ? `${styles.chip} ${styles.active}` : styles.chip}
                aria-pressed={active ? !!on : undefined} {...chipProps(k)}>
                {icon && <span className={styles.icon}>{icon(k)}</span>}
                {label(k)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Scrolling column of palette groups (or a hint) inside an editor's side panel. */
export function PalettePanel({ children, ref }: { children: React.ReactNode; ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={styles.panel}>{children}</div>;
}

/** Muted message shown in the palette panel instead of the palette. */
export function PaletteHint({ children }: { children: React.ReactNode }) {
  return <div className={styles.hint}>{children}</div>;
}
