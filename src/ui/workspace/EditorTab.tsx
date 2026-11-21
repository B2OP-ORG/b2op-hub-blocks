import { usePalette } from "../theme";

/** One tab in the editor tab bar (file or doc / example), with a close button. */
export function EditorTab({ active, title, italic, padLeft = 11, gap = 4, dirty, onClick, onClose, onDoubleClick, onContextMenu, children }: {
  active: boolean;
  title: string;
  /** Non-file tabs (docs, example previews). */
  italic?: boolean;
  padLeft?: number;
  gap?: number;
  /** Changed since last upload: the close button shows ● until hovered. */
  dirty?: boolean;
  onClick: () => void;
  onClose: () => void;
  onDoubleClick?: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const p = usePalette();
  const border = `1px solid ${p.border}`;
  return (
    <div
      title={title}
      style={{
        display: "flex", alignItems: "center", gap, padding: `4px 6px 4px ${padLeft}px`,
        background: active ? (p.dark ? "#0b1216" : "#ffffff") : (p.dark ? "#111a20" : "#eaf4f7"), color: p.text,
        borderTop: border, borderLeft: border, borderRight: border,
        borderBottom: active ? `2px solid ${p.accent}` : border,
        borderRadius: "4px 4px 0 0", cursor: "pointer", fontWeight: active ? 600 : 400, fontSize: 13, fontStyle: italic ? "italic" : undefined,
        userSelect: "none", maxWidth: 220, whiteSpace: "nowrap", flexShrink: 0,
      }}
      onClick={onClick}
      onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(); } }}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {children}
      <button
        type="button"
        title={dirty ? "Changed since last upload · close" : "Close"}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{
          marginLeft: 2, background: "none", border: "none", cursor: "pointer", color: dirty ? p.accent : p.dimText,
          fontSize: dirty ? 10 : 14, lineHeight: 1, padding: "0 2px", borderRadius: 3, flexShrink: 0, width: 16,
        }}
        onMouseEnter={dirty ? (e) => { e.currentTarget.textContent = "×"; e.currentTarget.style.fontSize = "14px"; } : undefined}
        onMouseLeave={dirty ? (e) => { e.currentTarget.textContent = "●"; e.currentTarget.style.fontSize = "10px"; } : undefined}
      >
        {dirty ? "●" : "×"}
      </button>
    </div>
  );
}

/** Tab title text, cut with an ellipsis. */
export function TabLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{children}</span>;
}
