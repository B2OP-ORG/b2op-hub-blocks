import styles from "./PaletteGroup.module.css";

/**
 * A titled group of widget "chips" in an editor palette, one per line. The caller supplies the drag behaviour per chip (`chipProps`),
 * e.g. HTML5 drag or pointer drag.
 */
export function PaletteGroup<K extends string>({ title, kinds, label, hint, chipProps }: {
  title: string;
  kinds: K[];
  label: (k: K) => string;
  hint: (k: K) => string;
  chipProps: (k: K) => React.ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  return (
    <div className={styles.group}>
      <div className={styles.title}>{title}</div>
      <div className={styles.chips}>
        {kinds.map((k) => (
          <button key={k} type="button" title={hint(k)} className={styles.chip} {...chipProps(k)}>
            {label(k)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Scrolling column of palette groups (or a hint) inside an editor's side panel. */
export function PalettePanel({ children }: { children: React.ReactNode }) {
  return <div className={styles.panel}>{children}</div>;
}

/** Muted message shown in the palette panel instead of the palette. */
export function PaletteHint({ children }: { children: React.ReactNode }) {
  return <div className={styles.hint}>{children}</div>;
}
