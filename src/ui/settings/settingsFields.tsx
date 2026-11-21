// Form primitives of the settings dialog (label | control grid rows).

import { useState } from "react";
import { usePalette } from "../theme";
import { SectionTitle } from "../components/SectionTitle";

const inputStyle = (p: ReturnType<typeof usePalette>): React.CSSProperties => ({
  background: p.inputBg, color: p.text, border: `1px solid ${p.border}`, borderRadius: 4, padding: "3px 6px", fontSize: 13,
});

/** Setting label (+ help) on the left, its control(s) on the right. */
export function Row({ label, help, children }: { label: string; help?: React.ReactNode; children: React.ReactNode }) {
  const p = usePalette();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1fr) minmax(160px, 1.2fr)", gap: "4px 14px", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${p.dark ? "#10303c" : "#e3f1f5"}` }}>
      <div>
        <div style={{ fontSize: 13 }}>{label}</div>
        {help && <div style={{ fontSize: 11, color: p.dimText, marginTop: 2, lineHeight: 1.4 }}>{help}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** Heading of a group of rows; `onReset` adds "Reset to defaults". */
export function GroupTitle({ children, onReset }: { children: React.ReactNode; onReset?: () => void }) {
  return (
    <SectionTitle style={{ margin: "16px 0 2px" }} action={onReset && { label: "Reset to defaults", onClick: onReset }}>
      {children}
    </SectionTitle>
  );
}

/** Muted explanatory paragraph between rows. */
export function Note({ children, pad = "6px 0" }: { children: React.ReactNode; pad?: string }) {
  const p = usePalette();
  return <div style={{ fontSize: 12, color: p.dimText, lineHeight: 1.5, padding: pad }}>{children}</div>;
}

/** On / Off checkbox. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      {checked ? "On" : "Off"}
    </label>
  );
}

export function Select<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const p = usePalette();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} style={{ ...inputStyle(p), maxWidth: "100%" }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function TextInput({ value, onChange, placeholder, grow }: { value: string; onChange: (v: string) => void; placeholder?: string; grow?: boolean }) {
  const p = usePalette();
  return (
    <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
      style={{ ...inputStyle(p), ...(grow ? { flex: 1, minWidth: 0 } : {}) }} />
  );
}

/** Number input clamped to [min, max]; applies valid values while typing. */
export function NumberInput({ value, min, max, step = 1, onChange, suffix }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  const p = usePalette();
  const [text, setText] = useState(String(value));
  const commit = (raw: string) => {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n));
      onChange(clamped);
      setText(String(clamped));
    } else {
      setText(String(value));
    }
  };
  return (
    <>
      <input
        type="number"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(n) && n >= min && n <= max) onChange(n); }}
        onBlur={(e) => commit(e.target.value)}
        style={{ ...inputStyle(p), width: 72 }}
      />
      {suffix && <span style={{ fontSize: 12, color: p.dimText }}>{suffix}</span>}
    </>
  );
}
