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

/**
 * Line widget with its points moved so the smallest x / y is 0 (and the
 * widget position moved the other way, so nothing moves on screen).
 * `lineSize` and LVGL both assume points at or right / below the origin.
 */
export function normalizeLine<W extends Pick<SceneWidget, "x" | "y" | "points">>(w: W): W {
  const pts = w.points ?? [];
  if (!pts.length) return w;
  const mx = Math.min(...pts.map((p) => p[0])), my = Math.min(...pts.map((p) => p[1]));
  if (mx === 0 && my === 0) return w;
  return { ...w, x: w.x + mx, y: w.y + my, points: pts.map(([x, y]) => [x - mx, y - my] as [number, number]) };
}

/** Distance of point p from segment a-b. */
function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Freehand stroke → few whole-pixel points (Ramer–Douglas–Peucker, then rounded and de-duplicated). */
export function simplifyPoints(pts: [number, number][], eps = 1): [number, number][] {
  const rdp = (a: number, b: number, out: [number, number][]) => {
    let far = -1, dist = eps;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i], pts[a], pts[b]);
      if (d > dist) { dist = d; far = i; }
    }
    if (far === -1) { out.push(pts[b]); return; }
    rdp(a, far, out);
    rdp(far, b, out);
  };
  if (pts.length < 3) return dedupe(pts.map(([x, y]) => [Math.round(x), Math.round(y)]));
  const out: [number, number][] = [pts[0]];
  rdp(0, pts.length - 1, out);
  return dedupe(out.map(([x, y]) => [Math.round(x), Math.round(y)]));
}

function dedupe(pts: [number, number][]): [number, number][] {
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
}

/** Clockwise sweep from a0 to a1 in degrees (0..360; equal angles = full circle). */
export function sweepOf(a0: number, a1: number): number {
  const s = (((a1 - a0) % 360) + 360) % 360;
  return s === 0 ? 360 : s;
}

/**
 * Where lv_arc (and lv_spinner) draws: the circle sits in the top-left corner
 * of the box (radius = half the smaller side, LVGL's get_center), and the
 * radius is the stroke's outer edge.
 */
export function lvArcCircle(w: Pick<SceneWidget, "w" | "h">): { cx: number; cy: number; r: number } {
  const r = Math.floor(Math.min(w.w, w.h) / 2);
  return { cx: r, cy: r, r };
}

/** Arc width LVGL's default theme gives arcs / spinners on the hub (15 dpx at 130 dpi). */
export const LV_ARC_WIDTH = 12;

/**
 * Arc stroke: an elliptical arc filling the box (stroke inside it), drawn on
 * the hub as an lv.line through these whole-pixel points.
 */
export function ellipseArcPoints(w: Pick<SceneWidget, "w" | "h" | "width" | "startAngle" | "endAngle" | "rotation">): [number, number][] {
  const lw = w.width ?? 3;
  const rx = Math.max(0, (w.w - lw) / 2), ry = Math.max(0, (w.h - lw) / 2);
  const cx = w.w / 2, cy = w.h / 2;
  const a0 = (w.startAngle ?? 180) + (w.rotation ?? 0);
  const span = sweepOf(w.startAngle ?? 180, w.endAngle ?? 0);
  // Segments of about 3 px along the ellipse.
  const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const steps = Math.max(2, Math.min(180, Math.ceil((perimeter * span) / 360 / 3)));
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = ((a0 + (span * i) / steps) * Math.PI) / 180;
    const p: [number, number] = [Math.round(cx + rx * Math.cos(t)), Math.round(cy + ry * Math.sin(t))];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

/** Visible window of a cropped arc, clamped to its box; undefined when nothing is cut off. */
export function effectiveCrop(w: Pick<SceneWidget, "kind" | "w" | "h" | "crop">): { x: number; y: number; w: number; h: number } | undefined {
  if (!w.crop || (w.kind !== "arc" && w.kind !== "arcline")) return undefined;
  const x = Math.max(0, Math.min(w.w - 1, Math.round(w.crop.x))), y = Math.max(0, Math.min(w.h - 1, Math.round(w.crop.y)));
  const cw = Math.max(1, Math.min(w.w - x, Math.round(w.crop.w))), ch = Math.max(1, Math.min(w.h - y, Math.round(w.crop.h)));
  if (x === 0 && y === 0 && cw === w.w && ch === w.h) return undefined;
  return { x, y, w: cw, h: ch };
}

/** Crop window after dragging edge `edge` (0..3 = left, top, right, bottom) by (dx, dy), kept inside the box. */
export function dragCropEdge(w: Pick<SceneWidget, "kind" | "w" | "h" | "crop">, edge: number, dx: number, dy: number): { x: number; y: number; w: number; h: number } {
  const c = effectiveCrop(w) ?? { x: 0, y: 0, w: w.w, h: w.h };
  let l = c.x, t = c.y, r = c.x + c.w, b = c.y + c.h;
  if (edge === 0) l = Math.max(0, Math.min(r - 1, Math.round(l + dx)));
  if (edge === 1) t = Math.max(0, Math.min(b - 1, Math.round(t + dy)));
  if (edge === 2) r = Math.min(w.w, Math.max(l + 1, Math.round(r + dx)));
  if (edge === 3) b = Math.min(w.h, Math.max(t + 1, Math.round(b + dy)));
  return { x: l, y: t, w: r - l, h: b - t };
}
