import { useEffect, useState } from "react";
import { Field } from "./Field";
import fieldStyles from "./Field.module.css";

/** Multi-line text that commits on blur. */
export function TextAreaField({ label, value, onCommit, rows = 3 }: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  rows?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Field label={label}>
      <textarea
        value={draft}
        rows={rows}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) onCommit(draft); }}
        className={`${fieldStyles.input} ${fieldStyles.textarea}`}
      />
    </Field>
  );
}
