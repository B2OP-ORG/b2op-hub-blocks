// HTML/SVG look-alikes of the LVGL widgets a scene uses, drawn at 1:1 LCD
// pixels with LVGL's default (light) theme colours. Approximations: good
// enough to lay a scene out, the hub is the real reference.

import type { CSSProperties } from "react";
import { LONG_MODES, lineSize, qrLayout, type SceneWidget } from "../../scene/model";

const LV = {
  primary: "#2196f3",
  secondary: "#f44336",
  text: "#212121",
  white: "#ffffff",
  track: "#e0e0e0",
  border: "#e0e0e0",
  muted: "#9e9e9e",
};

const FONT_FAMILY = "Montserrat, 'Segoe UI', Arial, sans-serif";

function fontCss(w: SceneWidget): CSSProperties {
  const size = w.font ?? 14;
  return { fontFamily: FONT_FAMILY, fontSize: size - 1, lineHeight: `${Math.round(size * 1.15)}px` };
}

/** Box styles shared by every widget (background / border / radius overrides). */
function boxCss(w: SceneWidget, defaults: { bg?: string; border?: number; borderColor?: string; radius?: number } = {}): CSSProperties {
  const bg = w.bg ?? defaults.bg;
  const border = w.border ?? defaults.border ?? 0;
  return {
    background: bg ?? "transparent",
    border: border > 0 ? `${border}px solid ${w.borderColor ?? defaults.borderColor ?? LV.border}` : "none",
    borderRadius: w.radius ?? defaults.radius ?? 0,
    boxSizing: "border-box",
  };
}

const fill: CSSProperties = { position: "absolute", inset: 0 };
const frac = (w: SceneWidget) => {
  const min = w.min ?? 0, max = w.max ?? 100;
  return max === min ? 0 : Math.min(1, Math.max(0, ((w.value ?? 0) - min) / (max - min)));
};
const align = (w: SceneWidget): CSSProperties["textAlign"] => w.align ?? "left";

/** SVG arc path (angles in degrees, 0 = 3 o'clock, clockwise like LVGL). */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const rad = (a: number) => (a * Math.PI) / 180;
  let sweep = a1 - a0;
  while (sweep < 0) sweep += 360;
  if (sweep >= 359.9) sweep = 359.9;
  const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a0 + sweep)), y1 = cy + r * Math.sin(rad(a0 + sweep));
  return `M ${x0} ${y0} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/**
 * The widget's own drawing (children of containers are drawn by the caller).
 * `focusItem`: index of the focused list item / tab in focus preview.
 */
export function SceneWidgetBody({ w, focused, focusItem, editing }: { w: SceneWidget; focused?: boolean; focusItem?: number; editing?: boolean }) {
  const ring: CSSProperties = focused ? { outline: `2px solid ${editing ? LV.secondary : LV.primary}`, outlineOffset: 1 } : {};
  switch (w.kind) {
    case "label": {
      const mode = w.longMode ?? "wrap";
      return (
        <div style={{
          ...fill, ...boxCss(w), ...fontCss(w), color: w.color ?? LV.text, textAlign: align(w), overflow: "hidden",
          whiteSpace: mode === "wrap" ? "pre-wrap" : "pre", textOverflow: mode === "dots" ? "ellipsis" : "clip", wordBreak: "break-word",
        }} title={LONG_MODES.includes(mode) && mode !== "wrap" ? `long mode: ${mode}` : undefined}>
          {w.text}
        </div>
      );
    }
    case "panel":
    case "scrollbox":
      return <div style={{ ...fill, ...boxCss(w, { bg: w.kind === "scrollbox" ? LV.white : undefined, radius: w.kind === "scrollbox" ? 6 : 0, borderColor: LV.border }), ...ring }} />;
    case "line": {
      const pts = w.points ?? [];
      const s = lineSize(w);
      const off = (w.width ?? 2) / 2;
      return (
        <svg width={s.w} height={s.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          <polyline points={pts.map((p) => `${p[0] + off},${p[1] + off}`).join(" ")} fill="none" stroke={w.color ?? LV.primary}
            strokeWidth={w.width ?? 2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    case "bar":
    case "slider": {
      const vertical = w.h > w.w;
      const f = frac(w);
      const ind = w.color ?? LV.primary;
      const r = Math.min(w.w, w.h) / 2;
      return (
        <div style={{ ...fill, ...ring, borderRadius: r }}>
          <div style={{ ...fill, ...boxCss(w, { bg: LV.track, radius: r }) }} />
          <div style={{
            position: "absolute", left: 0, bottom: 0, borderRadius: r, background: ind,
            width: vertical ? "100%" : `${f * 100}%`, height: vertical ? `${f * 100}%` : "100%",
          }} />
          {w.kind === "slider" && (
            <div style={{
              position: "absolute", width: r * 2 + 6, height: r * 2 + 6, borderRadius: "50%", background: ind,
              left: vertical ? -3 : `calc(${f * 100}% - ${r + 3}px)`, top: vertical ? `calc(${(1 - f) * 100}% - ${r + 3}px)` : -3,
            }} />
          )}
        </div>
      );
    }
    case "arc": {
      const size = Math.min(w.w, w.h);
      const aw = w.width ?? 6;
      const r = size / 2 - aw / 2;
      const end = 135 + 270 * frac(w);
      return (
        <svg width={w.w} height={w.h} style={{ position: "absolute", left: 0, top: 0 }}>
          <path d={arcPath(w.w / 2, w.h / 2, r, 135, 45)} fill="none" stroke={w.bg ?? LV.track} strokeWidth={aw} strokeLinecap="round" />
          {frac(w) > 0 && <path d={arcPath(w.w / 2, w.h / 2, r, 135, end)} fill="none" stroke={w.color ?? LV.primary} strokeWidth={aw} strokeLinecap="round" />}
        </svg>
      );
    }
    case "led": {
      const c = w.color ?? "#ff0000";
      const on = w.checked !== false;
      return (
        <div style={{
          ...fill, borderRadius: "50%", background: c, opacity: on ? 1 : 0.35,
          boxShadow: on ? `0 0 ${Math.max(3, w.w / 3)}px ${c}` : "none",
        }} />
      );
    }
    case "spinner": {
      const s = Math.min(w.w, w.h);
      const aw = Math.max(2, Math.round(s / 8));
      const r = s / 2 - aw / 2;
      return (
        <svg width={w.w} height={w.h} style={{ position: "absolute", left: 0, top: 0 }}>
          <circle cx={w.w / 2} cy={w.h / 2} r={r} fill="none" stroke={LV.track} strokeWidth={aw} />
          <path d={arcPath(w.w / 2, w.h / 2, r, 200, 320)} fill="none" stroke={w.color ?? LV.primary} strokeWidth={aw} strokeLinecap="round" />
        </svg>
      );
    }
    case "image":
      return (
        <div style={{ ...fill, ...boxCss(w), display: "flex", alignItems: "center", justifyContent: "center", outline: `1px dashed ${LV.muted}`, color: LV.muted, fontSize: 8, fontFamily: FONT_FAMILY, overflow: "hidden", textAlign: "center" }}>
          {w.src || "image"}
        </div>
      );
    case "qrcode": {
      const { modules: n, scale: cell, px: s } = qrLayout(w.text ?? "", Math.min(w.w, w.h));
      const dark = w.color ?? "#000000";
      // Deterministic pseudo pattern from the text (not a real QR code).
      let seed = 0;
      for (const ch of w.text ?? "") seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
      const rects: React.ReactNode[] = [];
      const finder = (x: number, y: number) => (x >= 0 && x < 7 && y >= 0 && y < 7) && (x === 0 || x === 6 || y === 0 || y === 6 || (x > 1 && x < 5 && y > 1 && y < 5));
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const inF = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
        const on = inF ? finder(x < 8 ? x : x - (n - 7), y < 8 ? y : y - (n - 7)) : ((seed = (seed * 1103515245 + 12345) >>> 0) & 0x10000) !== 0;
        if (on) rects.push(<rect key={`${x},${y}`} x={x * cell} y={y * cell} width={cell + 0.2} height={cell + 0.2} fill={dark} />);
      }
      return (
        <svg width={s} height={s} style={{ position: "absolute", left: 0, top: 0, background: w.bg ?? "#ffffff" }}>{rects}</svg>
      );
    }
    case "chart": {
      const vals = w.values ?? [];
      const min = w.min ?? 0, max = w.max ?? 100;
      const pad = 4;
      const iw = w.w - pad * 2, ih = w.h - pad * 2;
      const y = (v: number) => pad + ih - (ih * (Math.min(max, Math.max(min, v)) - min)) / (max - min || 1);
      const c = w.color ?? LV.primary;
      return (
        <svg width={w.w} height={w.h} style={{ position: "absolute", left: 0, top: 0 }}>
          <rect x={0.5} y={0.5} width={w.w - 1} height={w.h - 1} rx={w.radius ?? 4} fill={w.bg ?? LV.white} stroke={LV.border} />
          {[1, 2, 3, 4].map((i) => <line key={i} x1={pad} x2={w.w - pad} y1={pad + (ih * i) / 5} y2={pad + (ih * i) / 5} stroke={LV.border} strokeWidth={1} />)}
          {w.chartType === "bar"
            ? vals.map((v, i) => {
                const bw = iw / Math.max(1, vals.length);
                return <rect key={i} x={pad + i * bw + bw * 0.15} y={y(v)} width={bw * 0.7} height={pad + ih - y(v)} fill={c} />;
              })
            : <polyline fill="none" stroke={c} strokeWidth={2} points={vals.map((v, i) => `${pad + (iw * i) / Math.max(1, vals.length - 1)},${y(v)}`).join(" ")} />}
        </svg>
      );
    }
    case "scale": {
      const ticks = Math.max(2, w.ticks ?? 11);
      const every = Math.max(1, w.majorEvery ?? 5);
      const min = w.min ?? 0, max = w.max ?? 100;
      const c = w.color ?? LV.text;
      const items: React.ReactNode[] = [];
      for (let i = 0; i < ticks; i++) {
        const x = 1 + ((w.w - 2) * i) / (ticks - 1);
        const major = i % every === 0;
        items.push(<line key={`t${i}`} x1={x} x2={x} y1={0} y2={major ? 8 : 4} stroke={c} strokeWidth={1} />);
        if (major) items.push(
          <text key={`l${i}`} x={x} y={19} fontSize={9} fill={c} textAnchor={i === 0 ? "start" : i === ticks - 1 ? "end" : "middle"} fontFamily={FONT_FAMILY}>
            {Math.round(min + ((max - min) * i) / (ticks - 1))}
          </text>,
        );
      }
      return <svg width={w.w} height={w.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}><line x1={0} x2={w.w} y1={0} y2={0} stroke={c} />{items}</svg>;
    }
    case "table": {
      const cells = w.cells ?? [];
      const cols = Math.max(1, ...cells.map((r) => r.length));
      return (
        <div style={{ ...fill, ...boxCss(w, { bg: LV.white, border: 1 }), overflow: "hidden", ...fontCss(w), color: w.color ?? LV.text }}>
          <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
            <tbody>
              {cells.map((row, r) => (
                <tr key={r}>
                  {Array.from({ length: cols }, (_, c) => (
                    <td key={c} style={{ border: `1px solid ${LV.border}`, padding: "1px 2px", overflow: "hidden", whiteSpace: "nowrap", textAlign: align(w) }}>{row[c] ?? ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "textarea":
      return (
        <div style={{ ...fill, ...boxCss(w, { bg: LV.white, border: 2, radius: 4 }), ...fontCss(w), color: w.color ?? LV.text, padding: 2, overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: align(w) }}>
          {w.text}
        </div>
      );
    case "button":
      return (
        <div style={{
          ...fill, ...boxCss(w, { bg: LV.primary, radius: 6 }), ...fontCss(w), color: w.color ?? LV.white, ...ring,
          display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", whiteSpace: "nowrap",
          boxShadow: "0 2px 2px rgba(0,0,0,.2)",
        }}>
          {w.text}
        </div>
      );
    case "list": {
      const items = w.items ?? [];
      return (
        <div style={{ ...fill, ...boxCss(w, { bg: LV.white, border: 2, radius: 6 }), padding: 2, overflow: "hidden", ...fontCss(w), color: w.color ?? LV.text }}>
          {items.map((t, i) => {
            const f = focused && focusItem === i;
            return (
              <div key={i} style={{
                padding: "3px 6px", borderBottom: `1px solid ${LV.border}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                background: f ? LV.primary : undefined, color: f ? LV.white : undefined,
              }}>
                {w.icons?.[i] ? <span style={{ opacity: 0.8, marginRight: 4, fontSize: "0.8em" }}>[{w.icons[i].toLowerCase()}]</span> : null}
                {t}
              </div>
            );
          })}
        </div>
      );
    }
    case "roller": {
      const items = w.items ?? [];
      const sel = Math.min(Math.max(0, w.value ?? 0), Math.max(0, items.length - 1));
      const lh = Math.round((w.font ?? 14) * 1.4);
      const top = w.h / 2 - lh / 2 - sel * lh;
      return (
        <div style={{ ...fill, ...boxCss(w, { bg: LV.white, border: 2, radius: 6 }), overflow: "hidden", ...fontCss(w), color: LV.text, ...ring }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: w.h / 2 - lh / 2, height: lh, background: w.color ?? LV.primary }} />
          {items.map((t, i) => (
            <div key={i} style={{ position: "absolute", left: 0, right: 0, top: top + i * lh, height: lh, lineHeight: `${lh}px`, textAlign: "center", color: i === sel ? LV.white : LV.text, opacity: i === sel ? 1 : 0.6 }}>{t}</div>
          ))}
        </div>
      );
    }
    case "dropdown": {
      const items = w.items ?? [];
      const t = items[Math.min(Math.max(0, w.value ?? 0), Math.max(0, items.length - 1))] ?? "";
      return (
        <div style={{ ...fill, ...boxCss(w, { bg: LV.white, border: 2, radius: 6 }), ...fontCss(w), color: w.color ?? LV.text, ...ring, display: "flex", alignItems: "center", padding: "0 6px", overflow: "hidden", whiteSpace: "nowrap" }}>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{t}</span>
          <span style={{ fontSize: 9 }}>▼</span>
        </div>
      );
    }
    case "checkbox": {
      const s = Math.round((w.font ?? 14) * 1.15);
      return (
        <div style={{ ...fill, ...fontCss(w), color: w.color ?? LV.text, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", overflow: "hidden", ...ring }}>
          <span style={{
            width: s, height: s, flexShrink: 0, borderRadius: 3, boxSizing: "border-box", border: `2px solid ${LV.primary}`,
            background: w.checked ? LV.primary : LV.white, color: LV.white, fontSize: s - 4, lineHeight: `${s - 4}px`, textAlign: "center",
          }}>{w.checked ? "✓" : ""}</span>
          {w.text}
        </div>
      );
    }
    case "switch": {
      const on = !!w.checked;
      const r = w.h / 2;
      return (
        <div style={{ ...fill, borderRadius: r, background: on ? w.color ?? LV.primary : LV.track, ...ring }}>
          <div style={{ position: "absolute", top: 2, left: on ? w.w - w.h + 2 : 2, width: w.h - 4, height: w.h - 4, borderRadius: "50%", background: LV.white }} />
        </div>
      );
    }
    case "tabview": {
      const tabs = w.items?.length ? w.items : ["Tab"];
      const bar = w.barSize ?? 20;
      const active = Math.min(Math.max(0, w.value ?? 0), tabs.length - 1);
      return (
        <div style={{ ...fill, ...boxCss(w, { bg: LV.white }), overflow: "hidden" }}>
          <div style={{ display: "flex", height: bar, background: LV.white, borderBottom: `1px solid ${LV.border}`, ...fontCss(w) }}>
            {tabs.map((t, i) => {
              const f = focused && focusItem === i;
              return (
                <div key={i} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", whiteSpace: "nowrap",
                  color: i === active ? w.color ?? LV.primary : LV.text, borderBottom: i === active ? `3px solid ${w.color ?? LV.primary}` : "3px solid transparent",
                  outline: f ? `2px solid ${LV.primary}` : undefined, outlineOffset: -2,
                }}>{t}</div>
              );
            })}
          </div>
        </div>
      );
    }
  }
}
