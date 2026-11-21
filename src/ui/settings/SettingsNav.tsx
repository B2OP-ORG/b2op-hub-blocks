import { usePalette } from "../theme";
import { SECTIONS, type Section } from "./constants";

/** Section list on the left of the settings dialog. */
export function SettingsNav({ section, onSelect }: { section: Section; onSelect: (s: Section) => void }) {
  const p = usePalette();
  return (
    <nav style={{ width: 190, flexShrink: 0, borderRight: `1px solid ${p.border}`, padding: "8px 0", overflowY: "auto", background: p.dark ? "#0a1014" : "#f3f9fb" }}>
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "8px 16px",
            background: section === s.id ? p.activeBg : "none",
            border: "none",
            borderLeft: `3px solid ${section === s.id ? p.accent : "transparent"}`,
            color: p.text,
            fontWeight: section === s.id ? 700 : 400,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}
