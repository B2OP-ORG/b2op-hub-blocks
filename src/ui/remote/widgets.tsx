// Remote controller widgets. Each renders its own body inside a card; in edit
// mode the body is inert (the canvas handles drag / select), in run mode it is
// live: controls report values through `onChange`, indicators show `value`.

import { useRef, useState } from "react";
import type { RemoteValue } from "../../device/protocol";
import { joystickNames, type Widget } from "../../remote/layout";
import type { Palette } from "../theme";

export interface WidgetProps {
  w: Widget;
  p: Palette;
  live: boolean;
  /** Control values by name (run mode). */
  values: Record<string, RemoteValue>;
  /** Indicator value from the program, undefined until it sends one. */
  value?: RemoteValue;
  onChange: (name: string, value: RemoteValue, merge?: boolean) => void;
}

function num(v: RemoteValue | undefined, fallback = 0): number {
  return typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : fallback;
}

function fmt(v: RemoteValue | undefined, float: boolean): string {
  if (v === undefined) return "—";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "string") return v;
  if (!float) return String(Math.round(v));
  return Number.isInteger(v) ? v.toFixed(1) : String(Math.round(v * 100) / 100);
}

function Slider({ w, p, live, values, onChange }: WidgetProps) {
  const min = w.min ?? -100, max = w.max ?? 100;
  const step = w.step ?? (w.valueType === "float" ? 0.1 : 1);
  const v = num(values[w.name], w.initial ?? 0);
  const release = () => { if (live && w.springBack) onChange(w.name, w.initial ?? 0); };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, height: "100%" }}>
      <input
        type="range" min={min} max={max} step={step} value={live ? v : (w.initial ?? 0)} disabled={!live}
        onChange={(e) => onChange(w.name, w.valueType === "float" ? Number(e.target.value) : Math.round(Number(e.target.value)), true)}
        onPointerUp={release} onKeyUp={release}
        style={{ flex: 1, minWidth: 0, accentColor: p.accent }}
      />
      <span style={{ minWidth: 40, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
        {fmt(live ? v : (w.initial ?? 0), w.valueType === "float")}
      </span>
    </div>
  );
}

function Switch({ w, p, live, values, onChange }: WidgetProps) {
  const on = live && values[w.name] === true;
  return (
    <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
      <button
        type="button" role="switch" aria-checked={on} disabled={!live}
        onClick={() => onChange(w.name, !on)}
        style={{
          width: 52, height: 28, borderRadius: 14, border: "none", padding: 3, cursor: live ? "pointer" : "default",
          background: on ? p.accent : p.border, display: "flex", justifyContent: on ? "flex-end" : "flex-start", transition: "background .15s",
        }}
      >
        <span style={{ width: 22, height: 22, borderRadius: 11, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
      </button>
      <span style={{ marginLeft: 10, fontSize: 13, color: p.dimText }}>{on ? "on" : "off"}</span>
    </div>
  );
}

function PushButton({ w, p, live, values, onChange }: WidgetProps) {
  const down = live && values[w.name] === true;
  const set = (v: boolean) => { if (live) onChange(w.name, v); };
  return (
    <button
      type="button" disabled={!live}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(true); }}
      onPointerUp={() => set(false)} onPointerCancel={() => set(false)} onLostPointerCapture={() => set(false)}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") set(true); }}
      onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") set(false); }}
      style={{
        width: "100%", height: "100%", borderRadius: 8, border: `1px solid ${p.accent}`, cursor: live ? "pointer" : "default",
        background: down ? p.accent : "transparent", color: down ? p.accentText : p.text, fontWeight: 600, fontSize: 13,
        touchAction: "none", userSelect: "none",
      }}
    >
      {w.name}
    </button>
  );
}

function Joystick({ w, p, live, values, onChange }: WidgetProps) {
  const [nx, ny] = joystickNames(w.name);
  const range = w.max ?? 100;
  const ref = useRef<HTMLDivElement>(null);
  const x = live ? num(values[nx]) : 0;
  const y = live ? num(values[ny]) : 0;
  const move = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const half = Math.min(r.width, r.height) / 2;
    let dx = (e.clientX - (r.left + r.width / 2)) / half;
    let dy = -(e.clientY - (r.top + r.height / 2)) / half;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    onChange(nx, Math.round(dx * range), true);
    onChange(ny, Math.round(dy * range), true);
  };
  const release = () => { if (!live) return; onChange(nx, 0); onChange(ny, 0); };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", gap: 4 }}>
      <div
        ref={ref}
        onPointerDown={(e) => { if (!live) return; e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
        onPointerMove={(e) => { if (live && e.currentTarget.hasPointerCapture(e.pointerId)) move(e); }}
        onPointerUp={release} onPointerCancel={release}
        style={{
          position: "relative", flex: 1, aspectRatio: "1", maxWidth: "100%", borderRadius: "50%", minHeight: 0,
          background: p.inputBg, border: `1px solid ${p.border}`, touchAction: "none", cursor: live ? "grab" : "default",
        }}
      >
        <span style={{
          position: "absolute", width: "34%", height: "34%", borderRadius: "50%", background: p.accent,
          left: `${50 + (x / range) * 33 - 17}%`, top: `${50 - (y / range) * 33 - 17}%`, boxShadow: "0 2px 6px rgba(0,0,0,.3)",
        }} />
      </div>
      <span style={{ fontSize: 11, color: p.dimText, fontVariantNumeric: "tabular-nums" }}>x {x} · y {y}</span>
    </div>
  );
}

function TextInput({ w, p, live, values, onChange }: WidgetProps) {
  const [draft, setDraft] = useState("");
  const sent = typeof values[w.name] === "string" ? (values[w.name] as string) : "";
  const submit = () => onChange(w.name, draft);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", height: "100%" }}>
      <input
        value={live ? draft : ""} disabled={!live} placeholder={live ? (sent ? `sent: ${sent}` : "type, then Enter") : ""}
        onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        maxLength={255}
        style={{ flex: 1, minWidth: 0, padding: "5px 8px", borderRadius: 6, border: `1px solid ${p.border}`, background: p.inputBg, color: p.text, fontSize: 13 }}
      />
      <button type="button" disabled={!live} onClick={submit}
        style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: p.accent, color: p.accentText, fontSize: 12, cursor: live ? "pointer" : "default" }}>
        Send
      </button>
    </div>
  );
}

function Display({ w, value }: WidgetProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", height: "100%", fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
      {fmt(value, w.valueType === "float")}
    </div>
  );
}

function Led({ w, p, value }: WidgetProps) {
  const on = value === true || (typeof value === "number" && value !== 0);
  const color = w.color ?? "#22c55e";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <span style={{
        width: 28, height: 28, borderRadius: "50%", border: `1px solid ${p.border}`,
        background: on ? color : p.inputBg, boxShadow: on ? `0 0 12px ${color}` : "none", transition: "all .1s",
      }} />
    </div>
  );
}

function Gauge({ w, p, value }: WidgetProps) {
  const min = w.min ?? 0, max = w.max ?? 100;
  const v = num(value, min);
  const frac = max > min ? Math.max(0, Math.min(1, (v - min) / (max - min))) : 0;
  const label = fmt(value, w.valueType !== "int");
  if (w.style === "dial") {
    const a = Math.PI * (1 - frac);
    const nx = 50 + 38 * Math.cos(a), ny = 50 - 38 * Math.sin(a);
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%" }}>
        <svg viewBox="0 0 100 56" style={{ flex: 1, minHeight: 0, width: "100%" }}>
          <path d="M 8 50 A 42 42 0 0 1 92 50" fill="none" stroke={p.border} strokeWidth="8" strokeLinecap="round" />
          <path d="M 8 50 A 42 42 0 0 1 92 50" fill="none" stroke={p.accent} strokeWidth="8" strokeLinecap="round"
            pathLength={100} strokeDasharray={`${frac * 100} 100`} />
          <line x1="50" y1="50" x2={nx} y2={ny} stroke={p.text} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="50" cy="50" r="3.5" fill={p.text} />
        </svg>
        <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{label}</span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, height: "100%" }}>
      <div style={{ height: 14, borderRadius: 7, background: p.inputBg, border: `1px solid ${p.border}`, overflow: "hidden" }}>
        <div style={{ width: `${frac * 100}%`, height: "100%", background: p.accent, transition: "width .1s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: p.dimText, fontVariantNumeric: "tabular-nums" }}>
        <span>{min}</span><span style={{ color: p.text, fontSize: 13 }}>{label}</span><span>{max}</span>
      </div>
    </div>
  );
}

export function WidgetBody(props: WidgetProps) {
  switch (props.w.kind) {
    case "slider": return <Slider {...props} />;
    case "switch": return <Switch {...props} />;
    case "button": return <PushButton {...props} />;
    case "joystick": return <Joystick {...props} />;
    case "text_input": return <TextInput {...props} />;
    case "display": return <Display {...props} />;
    case "led": return <Led {...props} />;
    case "gauge": return <Gauge {...props} />;
  }
}
