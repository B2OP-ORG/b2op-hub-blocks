import { usePalette } from "../theme";

/** Section title bar at the top of a sidebar tab. */
export function PanelHeader({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  const p = usePalette();
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 4,
      padding: "6px 8px 6px 12px",
      borderBottom: `1px solid ${p.border}`,
      flexShrink: 0,
      minHeight: 30,
      boxSizing: "border-box",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: p.dimText, letterSpacing: 0.6, textTransform: "uppercase" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: p.text, fontWeight: 600, overflowWrap: "anywhere", marginTop: 1 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

export function IconButton({ title, onClick, children, disabled, buttonRef }: {
  title: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  disabled?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  const p = usePalette();
  return (
    <button
      ref={buttonRef}
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        color: p.dimText,
        cursor: disabled ? "default" : "pointer",
        padding: 3,
        borderRadius: 4,
        display: "inline-flex",
        alignItems: "center",
        opacity: disabled ? 0.4 : 1,
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = p.hoverBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
    >
      {children}
    </button>
  );
}

/** Text that wraps instead of being cut off (long file names). */
export const wrapText: React.CSSProperties = {
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  minWidth: 0,
  flex: 1,
  lineHeight: 1.35,
};

export function EmptyNote({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return <div style={{ padding: "14px 12px", color: p.dimText, fontSize: 12, lineHeight: 1.5 }}>{children}</div>;
}

/** Inline rename input used in tree rows. */
export function InlineInput({ value, onChange, onCommit, onCancel }: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const p = usePalette();
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
      style={{
        flex: 1,
        minWidth: 0,
        background: p.inputBg,
        color: p.text,
        border: `1px solid ${p.accent}`,
        borderRadius: 3,
        padding: "1px 4px",
        fontSize: 12,
        outline: "none",
      }}
    />
  );
}
