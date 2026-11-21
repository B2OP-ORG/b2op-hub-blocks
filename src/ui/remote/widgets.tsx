// Remote controller widgets. Each renders its own body inside a card; in edit
// mode the body is inert (the canvas handles drag / select), in run mode it is
// live: controls report values through `onChange`, indicators show `value`.

import { useRef, useState } from "react";
import type { RemoteValue } from "../../device/protocol";
import { joystickNames, type Widget } from "../../remote/layout";
import type { Palette } from "../theme";
import { INSET, KNOB, fmt, isVertical, num, quantize } from "./widgetUtils";

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

/**
 * Slider: a pill track that fills the card, with the knob inside the track
 * (never larger than it). Horizontal, or bottom-to-top when the card is taller
 * than wide. Pointer drag, arrows / PageUp / PageDown / Home / End.
 */
function Slider({ w, p, live, values, onChange }: WidgetProps) {
  const min = w.min ?? -100, max = w.max ?? 100;
  const float = w.valueType === "float";
  const step = w.step ?? (float ? 0.1 : 1);
  const vertical = isVertical(w);
  const v = live ? num(values[w.name], w.initial ?? 0) : (w.initial ?? 0);
  const frac = max > min ? Math.max(0, Math.min(1, (v - min) / (max - min))) : 0;
  const ref = useRef<HTMLDivElement>(null);
  const set = (raw: number, merge: boolean) => {
    const q = quantize(raw, min, max, step, float);
    if (q !== v) onChange(w.name, q, merge);
  };
  const fromPointer = (e: React.PointerEvent) => {
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    // Work in the track's own (unzoomed) px: the canvas may be scaled.
    const scale = el.offsetWidth ? r.width / el.offsetWidth : 1;
    const d = Math.min(el.offsetWidth, el.offsetHeight) - INSET * 2;
    const usable = (vertical ? el.offsetHeight : el.offsetWidth) - INSET * 2 - d;
    const along = (vertical ? r.bottom - e.clientY : e.clientX - r.left) / scale;
    const f = usable > 0 ? (along - INSET - d / 2) / usable : 0;
    set(min + Math.max(0, Math.min(1, f)) * (max - min), true);
  };
  const release = () => { if (live && w.springBack) onChange(w.name, w.initial ?? 0); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!live) return;
    const big = Math.max(step, (max - min) / 10);
    const keys: Record<string, number> = {
      ArrowRight: v + step, ArrowUp: v + step, ArrowLeft: v - step, ArrowDown: v - step,
      PageUp: v + big, PageDown: v - big, Home: min, End: max,
    };
    if (e.key in keys) { e.preventDefault(); set(keys[e.key], false); }
  };
  // Knob travel along the track: from INSET to (track length - INSET - knob).
  const travel = `(${vertical ? "100cqh" : "100cqw"} - ${INSET * 2}px - ${KNOB})`;
  const offset = `calc(${INSET}px + ${frac} * ${travel})`;
  const filled = `calc(${frac} * ${travel} + ${KNOB} + ${INSET * 2}px)`;
  return (
    <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", alignItems: "stretch", gap: vertical ? 4 : 12, height: "100%" }}>
      <div
        ref={ref} role="slider" aria-label={w.name} aria-valuemin={min} aria-valuemax={max} aria-valuenow={v}
        aria-orientation={vertical ? "vertical" : "horizontal"} aria-disabled={!live} tabIndex={live ? 0 : -1}
        onPointerDown={(e) => { if (!live || e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.focus(); fromPointer(e); }}
        onPointerMove={(e) => { if (live && e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e); }}
        onPointerUp={release} onPointerCancel={release}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => { if (/^(Arrow|Page|Home|End)/.test(e.key)) release(); }}
        style={{
          position: "relative", flex: 1, minWidth: 0, minHeight: 0, containerType: "size", borderRadius: 9999, overflow: "hidden",
          background: p.border, cursor: live ? "pointer" : "default", touchAction: "none", outline: "none",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,.25)",
        }}
      >
        <span style={{
          position: "absolute", borderRadius: 9999, background: p.accent,
          ...(vertical ? { left: 0, right: 0, bottom: 0, height: filled } : { left: 0, top: 0, bottom: 0, width: filled }),
        }} />
        <span style={{
          position: "absolute", width: KNOB, height: KNOB, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.35)",
          ...(vertical
            ? { left: "50%", bottom: offset, transform: "translateX(-50%)" }
            : { top: "50%", left: offset, transform: "translateY(-50%)" }),
        }} />
      </div>
      <span style={{ alignSelf: "center", minWidth: vertical ? 0 : 44, textAlign: vertical ? "center" : "right", fontVariantNumeric: "tabular-nums", fontSize: 16, fontWeight: 600 }}>
        {fmt(v, float)}
      </span>
    </div>
  );
}

/**
 * Switch: a pill that fills the card; the knob slides inside it (to the right,
 * or up when the card is taller than wide), ON / OFF on the free side.
 */
function Switch({ w, p, live, values, onChange }: WidgetProps) {
  const on = live && values[w.name] === true;
  const vertical = isVertical(w);
  const end = `calc(100% - ${INSET}px - ${KNOB})`;
  const labelAt = `calc(${KNOB} / 2 + ${INSET}px)`;
  const knobPos: React.CSSProperties = vertical
    ? { left: "50%", transform: "translateX(-50%)", top: on ? `${INSET}px` : end, transition: "top .15s" }
    : { top: "50%", transform: "translateY(-50%)", left: on ? end : `${INSET}px`, transition: "left .15s" };
  const labelPos: React.CSSProperties = vertical
    ? { left: "50%", transform: "translate(-50%, -50%)", top: on ? `calc(100% - ${KNOB} / 2 - ${INSET}px - ${KNOB} / 2)` : `calc(${KNOB} + ${INSET}px + ${KNOB} / 2)` }
    : { top: "50%", transform: "translateY(-50%)", ...(on ? { left: labelAt } : { right: labelAt }) };
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={w.name} disabled={!live}
      onClick={() => onChange(w.name, !on)}
      style={{
        position: "relative", display: "block", width: "100%", height: "100%", padding: 0, border: "none", borderRadius: 9999,
        containerType: "size", background: on ? p.accent : p.border, cursor: live ? "pointer" : "default",
        transition: "background .15s", boxShadow: "inset 0 1px 2px rgba(0,0,0,.25)", overflow: "hidden",
      }}
    >
      <span style={{
        position: "absolute", fontWeight: 700, letterSpacing: 0.5, whiteSpace: "nowrap",
        fontSize: `clamp(10px, ${vertical ? "30cqw" : "38cqh"}, 18px)`, color: on ? p.accentText : p.dimText, ...labelPos,
      }}>
        {on ? "ON" : "OFF"}
      </span>
      <span style={{
        position: "absolute", width: KNOB, height: KNOB, borderRadius: "50%", background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,.35)", ...knobPos,
      }} />
    </button>
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
        background: down ? p.accent : "transparent", color: down ? p.accentText : p.text, fontWeight: 600, fontSize: 15,
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
    <div style={{ display: "flex", gap: 6, alignItems: "stretch", height: "100%" }}>
      <input
        value={live ? draft : ""} disabled={!live} placeholder={live ? (sent ? `sent: ${sent}` : "type, then Enter") : ""}
        onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        maxLength={255}
        style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "5px 10px", borderRadius: 8, border: `1px solid ${p.border}`, background: p.inputBg, color: p.text, fontSize: 15 }}
      />
      <button type="button" disabled={!live} onClick={submit}
        style={{ padding: "5px 14px", borderRadius: 8, border: "none", background: p.accent, color: p.accentText, fontSize: 14, fontWeight: 600, cursor: live ? "pointer" : "default" }}>
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
