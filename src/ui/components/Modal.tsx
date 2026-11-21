import styles from "./Modal.module.css";

/**
 * Centered card over a dimmed overlay. Clicking the overlay or pressing Escape
 * calls `onClose` (omit it for a modal that must be answered).
 */
export function Modal({ onClose, zIndex = 1000, ariaLabel, cardRef, cardStyle, children }: {
  onClose?: () => void;
  zIndex?: number;
  ariaLabel?: string;
  cardRef?: React.Ref<HTMLDivElement>;
  /** Size / padding / layout of the card. */
  cardStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={styles.overlay}
      style={{ zIndex }}
      onPointerDown={onClose && ((e) => { if (e.target === e.currentTarget) onClose(); })}
      onKeyDown={onClose && ((e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } })}
    >
      <div ref={cardRef} role="dialog" aria-modal="true" aria-label={ariaLabel} className={styles.card} style={cardStyle}>
        {children}
      </div>
    </div>
  );
}

export function ModalTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <h3 className={styles.title} style={style}>{children}</h3>;
}

/** Right-aligned button row at the bottom of a modal. */
export function ModalActions({ children }: { children: React.ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}
