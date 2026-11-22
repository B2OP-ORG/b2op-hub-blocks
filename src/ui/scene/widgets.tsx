// HTML/SVG look-alikes of the LVGL widgets a scene uses, drawn at 1:1 LCD
// pixels the way LVGL 9's default light theme draws them on the hub (160 px
// wide = "small" display, 130 dpi; see lvStyle.ts). Fonts differ slightly, the
// hub is the final reference.

import { useContext, type CSSProperties } from "react";
import { useAssetUrl } from "../hooks/useAssetUrl";
import { SceneAssetContext } from "./sceneAssets";
import { LONG_MODES, chartPointCount, chartStartValues, type SceneWidget } from "../../scene/model";
import { LV_ARC_WIDTH, arcStretch, lineSize, linePoints, lvArcCircle, qrLayout, triangulate } from "../../scene/geometry";
import { CARD, FONT_FAMILY, LV, align, arcAngles, arcPath, boxCss, fill, fontCss, frac, lineHeightOf } from "./lvStyle";

/** "#rrggbb" darkened like lv_color_mix(c, black, mix). */
function mixBlack(c: string, mix: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  if (!m) return c;
  const n = parseInt(m[1], 16);
  const ch = (sh: number) => Math.round((((n >> sh) & 255) * mix) / 255);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** Image widget: the project image stretched over the box (the PNG is re-rendered at the box size, see fitSceneImage), else a placeholder. */
function ImageBody({ w }: { w: SceneWidget }) {
  const asset = useContext(SceneAssetContext)(w.src ?? "");
  const url = useAssetUrl(asset);
  if (url) {
    return (
      <div style={{ ...fill, ...boxCss(w), overflow: "hidden" }}>
        <img src={url} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%", imageRendering: "pixelated", pointerEvents: "none" }} />
      </div>
    );
  }
  return (
    <div style={{ ...fill, ...boxCss(w), display: "flex", alignItems: "center", justifyContent: "center", outline: `1px dashed ${LV.muted}`, color: LV.muted, fontSize: 8, fontFamily: FONT_FAMILY, overflow: "hidden", textAlign: "center" }}>
      {url === null && asset ? "image data missing" : w.src || "image"}
    </div>
  );
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
      // Plain lv.obj: the theme's card (white, grey border, rounded).
      return <div style={{ ...fill, ...boxCss(w, CARD), ...ring }} />;
    case "line": {
      // The canvas places a line's box half a stroke up-left of its position
      // (see SceneCanvas), so points sit at +off here: exactly where LVGL draws them.
      const pts = linePoints(w);
      const s = lineSize(w);
      const off = (w.width ?? 2) / 2;
      const tris = w.closed && w.bg ? triangulate(pts) : [];
      const fillTris: React.ReactNode[] = [];
      for (let i = 0; i < tris.length; i += 6) {
        fillTris.push(<polygon key={i} points={`${tris[i] + off},${tris[i + 1] + off} ${tris[i + 2] + off},${tris[i + 3] + off} ${tris[i + 4] + off},${tris[i + 5] + off}`}
          fill={w.bg} stroke={w.bg} strokeWidth={0.5} strokeLinejoin="round" />);
      }
      return (
        <svg width={s.w} height={s.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          {fillTris}
          <polyline points={pts.map((p) => `${p[0] + off},${p[1] + off}`).join(" ")} fill="none" stroke={w.color ?? LV.text}
            strokeWidth={w.width ?? 2} strokeLinecap={w.rounded === false ? "butt" : "round"} strokeLinejoin={w.rounded === false ? "miter" : "round"}
            strokeDasharray={w.dashWidth && w.dashGap ? `${w.dashWidth} ${w.dashGap}` : undefined} />
        </svg>
      );
    }
    case "bar":
    case "slider": {
      const vertical = w.h > w.w;
      const f = frac(w);
      const ind = w.color ?? LV.primary;
      const r = Math.min(w.w, w.h) / 2;
      // Symmetrical: fill from 0 when the range contains it.
      const min = w.min ?? 0, max = w.max ?? 100;
      const z = w.barMode === "symmetrical" && min < 0 && max > 0 ? -min / (max - min) : 0;
      const lo = Math.min(z, f), hi = Math.max(z, f);
      return (
        <div style={{ ...fill, ...ring, borderRadius: r }}>
          <div style={{ ...fill, ...boxCss(w, { bg: LV.primaryMuted, radius: r }) }} />
          <div style={{
            position: "absolute", left: vertical ? 0 : `${lo * 100}%`, bottom: vertical ? `${lo * 100}%` : 0, borderRadius: r, background: ind,
            width: vertical ? "100%" : `${(hi - lo) * 100}%`, height: vertical ? `${(hi - lo) * 100}%` : "100%",
          }} />
          {w.kind === "slider" && (
            // Knob: a circle as thick as the bar, grown by the theme's knob padding (5 px).
            <div style={{
              position: "absolute", width: r * 2 + 10, height: r * 2 + 10, borderRadius: "50%", background: ind,
              left: vertical ? -5 : `calc(${f * 100}% - ${r + 5}px)`, top: vertical ? `calc(${(1 - f) * 100}% - ${r + 5}px)` : -5,
            }} />
          )}
        </div>
      );
    }
    case "arc": {
      // lv_arc: circle in the box's top-left corner, radius = outer edge of the stroke.
      // Stretched: a square arc of the smaller side scaled to the box (LVGL transform).
      const st = arcStretch(w);
      const { cx, cy, r } = lvArcCircle(st ? { w: st.s, h: st.s } : w);
      const aw = w.width ?? LV_ARC_WIDTH;
      const pr = Math.max(0, r - aw / 2);
      const { bg, ind } = arcAngles(w);
      const cap = w.rounded === false ? "butt" : "round";
      return (
        <svg width={w.w} height={w.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          <g transform={st ? `scale(${st.sx / 256} ${st.sy / 256})` : undefined}>
            {bg && <path d={arcPath(cx, cy, pr, bg[0], bg[1])} fill="none" stroke={w.bg ?? LV.track} strokeWidth={aw} strokeLinecap={cap} />}
            {ind && <path d={arcPath(cx, cy, pr, ind[0], ind[1])} fill="none" stroke={w.color ?? LV.primary} strokeWidth={aw} strokeLinecap={cap} />}
          </g>
        </svg>
      );
    }
    case "arcline": {
      // Background-only lv.arc of the smaller side, scaled to the box (LVGL transform).
      const st = arcStretch(w)!;
      const { cx, cy, r } = lvArcCircle({ w: st.s, h: st.s });
      const aw = w.width ?? 3;
      const { bg } = arcAngles(w);
      return (
        <svg width={w.w} height={w.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          {bg && (
            <g transform={`scale(${st.sx / 256} ${st.sy / 256})`}>
              <path d={arcPath(cx, cy, Math.max(0, r - aw / 2), bg[0], bg[1])} fill="none" stroke={w.color ?? LV.white} strokeWidth={aw}
                strokeLinecap={w.rounded === false ? "butt" : "round"} />
            </g>
          )}
        </svg>
      );
    }
    case "rect":
    case "ellipse":
      return <div style={{ ...fill, ...boxCss(w), ...(w.kind === "ellipse" ? { borderRadius: Math.min(w.w, w.h) / 2 } : {}) }} />;
    case "led": {
      // lv_led: off = colour mixed with black at brightness 80/255, no glow;
      // on = full colour with a 12 px (spread 4) glow of the same colour.
      const c = w.color ?? "#ff0000";
      const on = w.checked !== false;
      return (
        <div style={{
          ...fill, borderRadius: "50%", background: on ? c : mixBlack(c, 80),
          boxShadow: on ? `0 0 6px 4px ${c}` : "none",
        }} />
      );
    }
    case "spinner": {
      // An lv_arc underneath: same corner anchoring and theme width.
      const { cx, cy, r } = lvArcCircle(w);
      const aw = w.width ?? LV_ARC_WIDTH;
      const pr = Math.max(0, r - aw / 2);
      return (
        <svg width={w.w} height={w.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          <circle cx={cx} cy={cy} r={pr} fill="none" stroke={w.bg ?? LV.track} strokeWidth={aw} />
          <path d={arcPath(cx, cy, pr, 200, 200 + Math.min(359, Math.max(1, w.spinArc ?? 200)))} fill="none" stroke={w.color ?? LV.primary} strokeWidth={aw} strokeLinecap="round" />
        </svg>
      );
    }
    case "image":
      return <ImageBody w={w} />;
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
      // Card (2 px border) + 8 px padding; 3 horizontal / 5 vertical division lines
      // placed in the content area but drawn across the whole widget (as LVGL does);
      // 2 px series line with 7 px points. Start values fill the rightmost points
      // (set_next_value shifts them in), the rest stay empty.
      const n = chartPointCount(w);
      const vals = chartStartValues(w);
      const first = n - vals.length;
      const min = w.min ?? 0, max = w.max ?? 100;
      const border = w.border ?? CARD.border;
      const pad = LV.padSmall + border;
      const iw = Math.max(1, w.w - pad * 2), ih = Math.max(1, w.h - pad * 2);
      const y = (v: number) => pad + ih - (ih * (Math.min(max, Math.max(min, v)) - min)) / (max - min || 1);
      const c = w.color ?? LV.primary;
      const gap = 8;
      const bw = Math.max(1, (iw - gap * (n - 1)) / n);
      return (
        <svg width={w.w} height={w.h} style={{ position: "absolute", left: 0, top: 0 }}>
          <rect x={border / 2} y={border / 2} width={w.w - border} height={w.h - border} rx={w.radius ?? CARD.radius}
            fill={w.bg ?? CARD.bg} stroke={border ? w.borderColor ?? CARD.borderColor : "none"} strokeWidth={border} />
          {[0, 1, 2].map((i) => <line key={`h${i}`} x1={0} x2={w.w} y1={pad + (ih * i) / 2 + 0.5} y2={pad + (ih * i) / 2 + 0.5} stroke={LV.track} strokeWidth={1} />)}
          {[0, 1, 2, 3, 4].map((i) => <line key={`v${i}`} y1={0} y2={w.h} x1={pad + (iw * i) / 4 + 0.5} x2={pad + (iw * i) / 4 + 0.5} stroke={LV.track} strokeWidth={1} />)}
          {w.chartType === "bar"
            ? vals.map((v, i) => <rect key={i} x={pad + (first + i) * (bw + gap)} y={y(v)} width={bw} height={pad + ih - y(v)} rx={2} fill={c} />)
            : <>
                <polyline fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" points={vals.map((v, i) => `${pad + (iw * (first + i)) / (n - 1)},${y(v)}`).join(" ")} />
                {vals.map((v, i) => <rect key={i} x={pad + (iw * (first + i)) / (n - 1) - 3.5} y={y(v) - 3.5} width={7} height={7} rx={2} fill={c} />)}
              </>}
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
        // Theme: 2 px lines, every tick 6 px long, labels in the normal font.
        items.push(<line key={`t${i}`} x1={x} x2={x} y1={0} y2={6} stroke={c} strokeWidth={2} />);
        if (major) items.push(
          <text key={`l${i}`} x={x} y={6 + 2 + (w.font ?? 14) - 2} fontSize={(w.font ?? 14) - 1} fill={c} textAnchor="middle" fontFamily={FONT_FAMILY}>
            {Math.round(min + ((max - min) * i) / (ticks - 1))}
          </text>,
        );
      }
      return <svg width={w.w} height={w.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}><line x1={0} x2={w.w} y1={1} y2={1} stroke={c} strokeWidth={2} />{items}</svg>;
    }
    case "table": {
      const cells = w.cells ?? [];
      const cols = Math.max(1, ...cells.map((r) => r.length));
      return (
        // Card without radius; cells: 2 px padding (set by the scene), 1 px lines above and below.
        <div style={{ ...fill, ...boxCss(w, { ...CARD, radius: 0 }), overflow: "hidden", ...fontCss(w), color: w.color ?? LV.text }}>
          <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
            <tbody>
              {cells.map((row, r) => (
                <tr key={r}>
                  {Array.from({ length: cols }, (_, c) => (
                    <td key={c} style={{ borderTop: `1px solid ${LV.border}`, borderBottom: `1px solid ${LV.border}`, padding: 2, overflow: "hidden", whiteSpace: "nowrap", textAlign: align(w) }}>{row[c] ?? ""}</td>
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
        <div style={{ ...fill, ...boxCss(w, CARD), ...fontCss(w), color: w.color ?? LV.text, padding: 2, overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: align(w) }}>
          {w.text}
        </div>
      );
    case "button":
      return (
        <div style={{
          ...fill, ...boxCss(w, { bg: LV.primary, radius: 7 }), ...fontCss(w), color: w.color ?? LV.white, ...ring,
          display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", whiteSpace: "nowrap",
          // Theme shadow: 2 px wide, 2 px down, grey at 50 %.
          boxShadow: "0 2px 1px rgba(158, 158, 158, 0.5)",
        }}>
          {w.text}
        </div>
      );
    case "list": {
      const items = w.items ?? [];
      return (
        <div style={{ ...fill, ...boxCss(w, CARD), padding: 2, overflow: "hidden", ...fontCss(w), color: w.color ?? LV.text }}>
          {items.map((t, i) => {
            const f = focused && focusItem === i;
            return (
              <div key={i} style={{
                padding: "4px 6px", borderBottom: `1px solid ${LV.border}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                background: f ? LV.primary : undefined, color: f ? LV.white : undefined,
              }}>
                {w.icons?.[i] ? <span style={{ opacity: 0.8, marginRight: 8, fontSize: "0.8em" }}>[{w.icons[i].toLowerCase()}]</span> : null}
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
      // Theme line space: 16 px between options.
      const lh = lineHeightOf(w) + 16;
      const top = w.h / 2 - lh / 2 - sel * lh;
      return (
        <div style={{ ...fill, ...boxCss(w, CARD), overflow: "hidden", ...fontCss(w), color: LV.text, ...ring }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: w.h / 2 - lh / 2, height: lh, background: w.color ?? LV.primary }} />
          {items.map((t, i) => (
            <div key={i} style={{ position: "absolute", left: 0, right: 0, top: top + i * lh, height: lh, lineHeight: `${lh}px`, textAlign: "center", color: i === sel ? LV.white : LV.text }}>{t}</div>
          ))}
        </div>
      );
    }
    case "dropdown": {
      const items = w.items ?? [];
      const t = items[Math.min(Math.max(0, w.value ?? 0), Math.max(0, items.length - 1))] ?? "";
      return (
        <div style={{ ...fill, ...boxCss(w, CARD), ...fontCss(w), color: w.color ?? LV.text, ...ring, display: "flex", alignItems: "center", padding: `0 ${LV.padSmall}px`, overflow: "hidden", whiteSpace: "nowrap" }}>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{t}</span>
          <span style={{ fontSize: 9 }}>▼</span>
        </div>
      );
    }
    case "checkbox": {
      // Marker: line height + 2 px padding each side, 2 px primary border, radius 3; 8 px gap to the text.
      const s = lineHeightOf(w) + 4;
      return (
        <div style={{ ...fill, ...fontCss(w), color: w.color ?? LV.text, display: "flex", alignItems: "flex-start", gap: 8, whiteSpace: "nowrap", overflow: "hidden", ...ring }}>
          <span style={{
            width: s, height: s, flexShrink: 0, borderRadius: 3, boxSizing: "border-box", border: `2px solid ${LV.primary}`,
            background: w.checked ? LV.primary : LV.white, color: LV.white, fontSize: 12, lineHeight: `${s - 4}px`, textAlign: "center",
          }}>{w.checked ? "✓" : ""}</span>
          <span style={{ lineHeight: `${s}px` }}>{w.text}</span>
        </div>
      );
    }
    case "switch": {
      const on = !!w.checked;
      const r = w.h / 2;
      return (
        <div style={{ ...fill, borderRadius: r, background: on ? w.color ?? LV.primary : LV.track, ...ring }}>
          {/* Knob: white circle, 3 px inside the track (theme knob padding -4 dpx). */}
          <div style={{ position: "absolute", top: 3, left: on ? w.w - w.h + 3 : 3, width: w.h - 6, height: w.h - 6, borderRadius: "50%", background: LV.white }} />
        </div>
      );
    }
    case "tabview": {
      const tabs = w.items?.length ? w.items : ["Tab"];
      const bar = w.barSize ?? 20;
      const active = Math.min(Math.max(0, w.value ?? 0), tabs.length - 1);
      return (
        // Transparent body; white tab bar; the active tab is tinted with a 4 px primary underline.
        <div style={{ ...fill, ...boxCss(w), overflow: "hidden" }}>
          <div style={{ display: "flex", height: bar, background: LV.white, ...fontCss(w) }}>
            {tabs.map((t, i) => {
              const f = focused && focusItem === i;
              return (
                <div key={i} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", whiteSpace: "nowrap",
                  color: i === active ? w.color ?? LV.primary : LV.text, borderBottom: i === active ? `4px solid ${w.color ?? LV.primary}` : "4px solid transparent",
                  paddingTop: 4, boxSizing: "border-box", background: i === active ? LV.primaryMuted : undefined,
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
