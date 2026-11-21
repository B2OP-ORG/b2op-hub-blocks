// LVGL look-alike styling helpers for the scene widget drawings (widgets.tsx).

import type { CSSProperties } from "react";
import type { SceneWidget } from "../../scene/model";

export const LV = {
  primary: "#2196f3",
  secondary: "#f44336",
  text: "#212121",
  white: "#ffffff",
  track: "#e0e0e0",
  border: "#e0e0e0",
  muted: "#9e9e9e",
};

export const FONT_FAMILY = "Montserrat, 'Segoe UI', Arial, sans-serif";

export function fontCss(w: SceneWidget): CSSProperties {
  const size = w.font ?? 14;
  return { fontFamily: FONT_FAMILY, fontSize: size - 1, lineHeight: `${Math.round(size * 1.15)}px` };
}

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
  if (sweep >= 359.9) sweep = 359.9;
  const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a0 + sweep)), y1 = cy + r * Math.sin(rad(a0 + sweep));
  return `M ${x0} ${y0} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}
