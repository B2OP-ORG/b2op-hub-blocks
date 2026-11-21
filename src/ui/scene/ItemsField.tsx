import { useEffect, useState } from "react";
import { SYMBOLS } from "../../scene/model";
import { usePalette } from "../theme";
import { Button } from "../components/Button";
import fieldStyles from "../components/Field.module.css";

/** Editable list of item texts (list / roller / dropdown / tab names), optionally with an icon each. */
export function ItemsField({ label, items, icons, onChange }: {
  label: string;
  items: string[];
  icons?: string[];
  onChange: (items: string[], icons: string[]) => void;
}) {
  const p = usePalette();
  const ic = icons ?? [];
  const set = (i: number, text: string | null, icon?: string) => {
    const nItems = [...items], nIcons = items.map((_, j) => ic[j] ?? "");
    if (text === null) { nItems.splice(i, 1); nIcons.splice(i, 1); }
    else { nItems[i] = text; if (icon !== undefined) nIcons[i] = icon; }
    onChange(nItems, nIcons);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
      {label}
      {items.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 4 }}>
          {icons && (
            <select value={ic[i] ?? ""} onChange={(e) => set(i, t, e.target.value)} title="Icon" className={fieldStyles.input} style={{ width: 74, flexShrink: 0, padding: "4px 2px" }}>
              {SYMBOLS.map((s) => <option key={s} value={s}>{s ? s.toLowerCase() : "—"}</option>)}
            </select>
          )}
          <ItemInput value={t} onCommit={(v) => set(i, v)} />
          <button type="button" title="Remove" onClick={() => set(i, null)} style={{ border: "none", background: "transparent", color: p.dimText, cursor: "pointer", padding: "0 4px" }}>×</button>
        </div>
      ))}
      <Button size="xs" style={{ alignSelf: "flex-start" }}
        onClick={() => onChange([...items, `Item ${items.length + 1}`], [...items.map((_, j) => ic[j] ?? ""), ""])}>
        + Add
      </Button>
    </div>
  );
}

function ItemInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft !== value) onCommit(draft); }}
    onKeyDown={(e) => { if (e.key === "Enter" && draft !== value) onCommit(draft); }} className={fieldStyles.input} style={{ flex: 1, minWidth: 0 }} />;
}
