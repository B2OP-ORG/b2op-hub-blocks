// Value helpers shared by the remote controller widgets (widgets.tsx).

import type { RemoteValue } from "../../device/protocol";
import type { Widget } from "../../remote/layout";

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
