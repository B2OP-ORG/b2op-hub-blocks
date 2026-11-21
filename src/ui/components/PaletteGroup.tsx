import styles from "./PaletteGroup.module.css";

/**
 * A titled row of widget "chips" in an editor palette. The caller supplies the
 * drag behaviour per chip (`chipProps`), e.g. HTML5 drag or pointer drag.
 */
export function PaletteGroup<K extends string>({ title, kinds, label, hint, chipProps }: {
  title: string;
  kinds: K[];
  label: (k: K) => string;
  hint: (k: K) => string;
  chipProps: (k: K) => React.ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  return (
    <>
      <span className={styles.title}>{title}</span>
      {kinds.map((k) => (
        <button key={k} type="button" title={hint(k)} className={styles.chip} {...chipProps(k)}>
          {label(k)}
        </button>
      ))}
    </>
  );
}
