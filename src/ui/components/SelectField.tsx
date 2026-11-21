import { Field } from "./Field";
import fieldStyles from "./Field.module.css";

/** Labelled dropdown; options are [value, label] pairs. */
export function SelectField({ label, value, options, onChange, grow }: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
  grow?: boolean;
}) {
  return (
    <Field label={label} grow={grow}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldStyles.input}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Field>
  );
}
