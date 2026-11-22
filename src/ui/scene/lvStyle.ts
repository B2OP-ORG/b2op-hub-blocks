// LVGL look-alike styling helpers for the scene widget drawings (widgets.tsx).

import type { CSSProperties } from "react";
import type { SceneWidget } from "../../scene/model";
import { sweepOf } from "../../scene/geometry";

// LVGL default (light) theme on the hub: 160 px wide ("small" display), 130 dpi.
// Sizes are lv_dpx() of the theme's values at that dpi.
export const LV = {
  primary: "#2196f3",
  /** Primary at 20 % opacity (bar / slider track, active tab). */
  primaryMuted: "rgba(33, 150, 243, 0.2)",
  secondary: "#f44336",
  text: "#212121",
  white: "#ffffff",
  /** theme color_grey: arc / switch tracks, card borders, divider lines. */
  track: "#e0e0e0",
  border: "#e0e0e0",
  muted: "#9e9e9e",
  /** Card (lv.obj, textarea, list, roller, dropdown, chart): radius / border. */
  radius: 7,
  borderWidth: 2,
  padDef: 13,
  padSmall: 8,
};

/** Montserrat line heights LVGL uses per font size. */
export const LINE_HEIGHT: Record<number, number> = { 14: 16, 16: 18, 24: 27 };
export const lineHeightOf = (w: SceneWidget) => LINE_HEIGHT[w.font ?? 14] ?? Math.round((w.font ?? 14) * 1.15);

export const FONT_FAMILY = "Montserrat, 'Segoe UI', Arial, sans-serif";

export function fontCss(w: SceneWidget): CSSProperties {
  const size = w.font ?? 14;
  return {
    fontFamily: FONT_FAMILY, fontSize: size - 1, lineHeight: `${(LINE_HEIGHT[size] ?? Math.round(size * 1.15)) + (w.lineSpace ?? 0)}px`,
    letterSpacing: w.letterSpace ? w.letterSpace : undefined,
  };
}

/** Card look of the default theme (white, 2 px grey border, radius 7). */
export const CARD = { bg: "#ffffff", border: 2, borderColor: "#e0e0e0", radius: 7 };

/** Box styles shared by every widget (background / border / radius overrides). */
export function boxCss(w: SceneWidget, defaults: { bg?: string; border?: number; borderColor?: string; radius?: number } = {}): CSSProperties {
  const bg = w.bg ?? defaults.bg;
  const border = w.border ?? defaults.border ?? 0;
  return {
    background: bg ?? "transparent",
    border: border > 0 ? `${border}px solid ${w.borderColor ?? defaults.borderColor ?? LV.border}` : "none",
    borderRadius: w.radius ?? defaults.radius ?? 0,
    boxSizing: "border-box",
  };
}

export const fill: CSSProperties = { position: "absolute", inset: 0 };
export const frac = (w: SceneWidget) => {
  const min = w.min ?? 0, max = w.max ?? 100;
  return max === min ? 0 : Math.min(1, Math.max(0, ((w.value ?? 0) - min) / (max - min)));
};
export const align = (w: SceneWidget): CSSProperties["textAlign"] => w.align ?? "left";

/** SVG arc path (angles in degrees, 0 = 3 o'clock, clockwise like LVGL). */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const rad = (a: number) => (a * Math.PI) / 180;
  let sweep = a1 - a0;
  while (sweep < 0) sweep += 360;
  while (sweep > 360) sweep -= 360;
  if (sweep === 0) return "";
  if (sweep >= 359.9) sweep = 359.9;
  const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a0 + sweep)), y1 = cy + r * Math.sin(rad(a0 + sweep));
  return `M ${x0} ${y0} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/**
 * Background and indicator angles of an LVGL arc (rotation applied), like
 * lv_arc does for its modes. Indicator is null when it would be empty.
 */
export function arcAngles(w: SceneWidget): { bg: [number, number] | null; ind: [number, number] | null } {
  const rot = w.rotation ?? 0;
  const a0 = (w.startAngle ?? 135) + rot;
  const span = sweepOf(w.startAngle ?? 135, w.endAngle ?? 45);
  const f = frac(w);
  let ind: [number, number] | null;
  switch (w.arcMode) {
    case "symmetrical": {
      const mid = a0 + span / 2;
      const d = (f - 0.5) * span;
      ind = Math.abs(d) < 0.01 ? null : d > 0 ? [mid, mid + d] : [mid + d, mid];
      break;
    }
    case "reverse":
      ind = f <= 0 ? null : [a0 + span - f * span, a0 + span];
      break;
    default:
      ind = f <= 0 ? null : [a0, a0 + f * span];
  }
  return { bg: span ? [a0, a0 + span] : null, ind: span ? ind : null };
}
