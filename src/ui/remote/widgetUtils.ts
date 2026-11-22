// Value helpers shared by the remote controller widgets (widgets.tsx).

import type { RemoteValue } from "../../device/protocol";
import type { Widget } from "../../remote/layout";
import { rotateVec } from "../../geometry/rotation";

export function num(v: RemoteValue | undefined, fallback = 0): number {
  return typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : fallback;
}

export function fmt(v: RemoteValue | undefined, float: boolean): string {
  if (v === undefined) return "—";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "string") return v;
  if (!float) return String(Math.round(v));
  return Number.isInteger(v) ? v.toFixed(1) : String(Math.round(v * 100) / 100);
}

/** Inset between a track's edge and its knob, in px. */
export const INSET = 3;
/** Knob diameter: as big as the track allows (container query units of the track). */
export const KNOB = `calc(100cqmin - ${INSET * 2}px)`;

/**
 * Whether a widget's body is taller than wide, so a slider / switch runs
 * bottom-to-top. Uses the card size minus its padding and name header.
 */
export function isVertical(w: Widget): boolean {
  return w.h - 38 > w.w - 24;
}

/** Snap a raw slider value to the widget's step, range and type. */
export function quantize(raw: number, min: number, max: number, step: number, float: boolean): number {
  let v = step > 0 ? min + Math.round((raw - min) / step) * step : raw;
  v = Math.max(min, Math.min(max, v));
  return float ? Math.round(v * 1e6) / 1e6 : Math.round(v);
}

/**
 * Pointer position in an element's own unscaled, unrotated px (0,0 = its
 * top-left corner), for an element inside a card zoomed by the canvas and
 * rotated by `angle` degrees.
 */
export function localPoint(el: HTMLElement, clientX: number, clientY: number, angle = 0): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  const ow = el.offsetWidth, oh = el.offsetHeight;
  // Bounding box of the rotated element = scale * (w|cos| + h|sin|) wide; its centre is the element's centre.
  const c = Math.abs(Math.cos((angle * Math.PI) / 180)), s = Math.abs(Math.sin((angle * Math.PI) / 180));
  const span = ow * c + oh * s;
  const scale = span ? r.width / span : 1;
  const [x, y] = rotateVec((clientX - (r.left + r.width / 2)) / scale, (clientY - (r.top + r.height / 2)) / scale, -angle);
  return { x: x + ow / 2, y: y + oh / 2 };
}
