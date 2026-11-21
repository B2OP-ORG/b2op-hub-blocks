import { useEffect, useState } from "react";
import { Field } from "./Field";
import fieldStyles from "./Field.module.css";

/** Number input that commits on blur / Enter, clamped to [min, max] (rounded when `int`). */
export function NumberField({ label, value, min, max, int, onCommit }: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  int?: boolean;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    let n = Number(draft);
    if (!Number.isFinite(n) || draft.trim() === "") { setDraft(String(value)); return; }
    if (int) n = Math.round(n);
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    setDraft(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <Field label={label} grow>
      <input
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
        className={fieldStyles.input}
      />
    </Field>
  );
}
