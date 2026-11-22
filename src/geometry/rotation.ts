// Whole-widget rotation shared by the scene and remote editors. A widget's
// `angle` (degrees, clockwise, absent = 0) turns its x / y / w / h box around
// the box centre; x / y stay the unrotated top-left corner.

const RAD = Math.PI / 180;

/** Angle in 0..359 (whole degrees). */
export function normAngle(a: number): number {
  return ((Math.round(a) % 360) + 360) % 360;
}

/** Vector (x, y) turned clockwise by `deg` (screen coordinates, y down). */
export function rotateVec(x: number, y: number, deg: number): [number, number] {
  if (!deg) return [x, y];
  const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD);
  return [x * c - y * s, x * s + y * c];
}

/** Axis-aligned box around a rotated box (what it covers on screen). */
export function rotatedBounds(b: { x: number; y: number; w: number; h: number; angle?: number }): { x: number; y: number; w: number; h: number } {
  const a = b.angle ?? 0;
  if (!a) return { x: b.x, y: b.y, w: b.w, h: b.h };
  const c = Math.abs(Math.cos(a * RAD)), s = Math.abs(Math.sin(a * RAD));
  const w = b.w * c + b.h * s, h = b.w * s + b.h * c;
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
}

/**
 * New x / y for a box resized from (w0, h0) to (w1, h1) so its rotated
 * top-left corner stays where it was on screen.
 */
export function keepTopLeft(x: number, y: number, w0: number, h0: number, w1: number, h1: number, angle: number): { x: number; y: number } {
  if (!angle) return { x, y };
  // Top-left corner on screen = centre + R(-w/2, -h/2); the centre moves by R((dw, dh) / 2), the box by that minus the unrotated half.
  const [rx, ry] = rotateVec((w1 - w0) / 2, (h1 - h0) / 2, angle);
  return { x: x + rx - (w1 - w0) / 2, y: y + ry - (h1 - h0) / 2 };
}

/** Distance of point (px, py), given relative to the box centre in the box's own frame, from a w x h box (0 inside). */
export function distToBox(px: number, py: number, w: number, h: number): number {
  return Math.hypot(Math.max(0, Math.abs(px) - w / 2), Math.max(0, Math.abs(py) - h / 2));
}
