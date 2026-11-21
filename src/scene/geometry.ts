// Scene geometry: positions, drawn sizes, QR layout, bounds checks.

import { SCREEN_H, SCREEN_W, type SceneDoc, type SceneWidget } from "./model";

/** Content offset of a container (tab views draw their tab bar on top). */
export function contentOffset(w: SceneWidget): { x: number; y: number } {
  return w.kind === "tabview" ? { x: 0, y: w.barSize ?? 20 } : { x: 0, y: 0 };
}

/** Absolute (screen) position of a widget's top-left corner. */
export function absolutePos(doc: SceneDoc, w: SceneWidget): { x: number; y: number } {
  let x = w.x, y = w.y;
  let p = w.parent ? doc.widgets.find((o) => o.uid === w.parent) : undefined;
  const seen = new Set<string>();
  while (p && !seen.has(p.uid)) {
    seen.add(p.uid);
    const off = contentOffset(p);
    x += p.x + off.x;
    y += p.y + off.y;
    p = p.parent ? doc.widgets.find((o) => o.uid === p!.parent) : undefined;
  }
  return { x, y };
}

/** Line widget size (from its points). */
export function lineSize(w: SceneWidget): { w: number; h: number } {
  const pts = w.points ?? [];
  const lw = w.width ?? 2;
  return {
    w: Math.max(1, ...pts.map((p) => p[0])) + lw,
    h: Math.max(1, ...pts.map((p) => p[1])) + lw,
  };
}

/** Byte-mode capacity of QR versions 1..40 at error correction level M (what LVGL uses). */
export const QR_CAPACITY_M = [
  14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666,
  711, 779, 857, 911, 997, 1059, 1125, 1190, 1264, 1370, 1452, 1538, 1628, 1722, 1809, 1911, 1989, 2099, 2213, 2331,
];

/**
 * QR code layout LVGL ends up with for `text` in a `size` px box: modules per
 * side, pixels per module and the drawn size (modules * scale). LVGL centres
 * the code with `(size - drawn) / 2` rounded down, so a box that isn't exactly
 * `drawn` px leaves a light row / column on the right and bottom; scenes size
 * the widget to `px` instead.
 */
export function qrLayout(text: string, size: number): { modules: number; scale: number; px: number } {
  const len = new TextEncoder().encode(text).length;
  let v = 1;
  while (v < 40 && QR_CAPACITY_M[v - 1] < len) v++;
  const scale = Math.max(1, Math.floor(size / (17 + 4 * v)));
  // LVGL then picks the largest version that still fits at that scale.
  while (v < 40 && (21 + 4 * v) * scale <= size) v++;
  const modules = 17 + 4 * v;
  return { modules, scale, px: modules * scale };
}

/** Size a widget really takes on the LCD (line / qrcode are special). */
export function drawnSize(w: SceneWidget): { w: number; h: number } {
  if (w.kind === "line") return lineSize(w);
  if (w.kind === "qrcode") { const s = qrLayout(w.text ?? "", Math.min(w.w, w.h)).px; return { w: s, h: s }; }
  return { w: w.w, h: w.h };
}

/** Size of the area a widget is placed in (its parent's content area, or the screen). */
export function parentArea(doc: SceneDoc, w: Pick<SceneWidget, "parent">): { w: number; h: number } {
  const p = w.parent ? doc.widgets.find((o) => o.uid === w.parent) : undefined;
  if (!p) return { w: SCREEN_W, h: SCREEN_H };
  const off = contentOffset(p);
  return { w: p.w - off.x, h: p.h - off.y };
}

/** True when nothing of the widget is inside its parent / the screen (so nothing of it shows). */
export function isOutside(doc: SceneDoc, w: SceneWidget): boolean {
  const a = parentArea(doc, w), s = drawnSize(w);
  return w.x >= a.w || w.y >= a.h || w.x + s.w <= 0 || w.y + s.h <= 0;
}

/** Position that keeps the widget inside its parent / the screen (as far as it fits). */
export function clampedPos(doc: SceneDoc, w: SceneWidget): { x: number; y: number } {
  const a = parentArea(doc, w), s = drawnSize(w);
  return {
    x: Math.round(Math.min(Math.max(0, w.x), Math.max(0, a.w - s.w))),
    y: Math.round(Math.min(Math.max(0, w.y), Math.max(0, a.h - s.h))),
  };
}
