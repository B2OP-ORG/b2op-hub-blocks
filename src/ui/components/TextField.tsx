import { useEffect, useState } from "react";
import { Field } from "./Field";
import fieldStyles from "./Field.module.css";

/**
 * Text input that commits on blur / Enter (Escape reverts).
 * `validate` checks the draft and blocks the commit; `error` shows an external problem.
 */
export function TextField({ label, value, onCommit, validate, error }: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  validate?: (v: string) => string | null;
  error?: string | null;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const draftError = validate && draft !== value ? validate(draft) : null;
  const shown = draftError ?? error ?? null;
  const commit = () => { if (draft !== value && !draftError) onCommit(draft); };
  return (
    <Field label={label} error={shown}>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setDraft(value); }}
        className={shown ? `${fieldStyles.input} ${fieldStyles.bad}` : fieldStyles.input}
      />
    </Field>
  );
}
