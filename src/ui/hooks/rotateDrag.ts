// Rotate-handle drag maths shared by the scene and remote editors. Dragging
// the handle turns the widget around its centre in snapped steps: big ones
// (`near`) while the pointer is close to the widget, fine ones (`far`) further
// out (Settings › Scene & remote).

import { useApp } from "../../state/store";
import type { RotateSnapSettings } from "../../settings/editorSettings";
import { distToBox, normAngle, rotateVec } from "../../geometry/rotation";

/** Rotate snapping from the editor settings. */
export function useRotateSnap(): RotateSnapSettings {
  return useApp((s) => s.editorSettings.rotateSnap);
}

/**
 * Where a pointer-down on a handle is, relative to the centre of the widget
 * element holding the handle, in canvas units (screen-aligned). The centre of
 * a rotated box's bounding rect is the box centre.
 */
export function rotatePivot(e: React.PointerEvent, scale: number): { x: number; y: number } {
  const r = (e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect();
  return { x: (e.clientX - (r.left + r.width / 2)) / scale, y: (e.clientY - (r.top + r.height / 2)) / scale };
}

/**
 * New angle while the rotate handle is dragged: the start angle `a0` plus how
 * far the pointer turned around the centre, snapped to the near / far step.
 * `pivot`: start point (rotatePivot); `dx`, `dy`: pointer travel (canvas units);
 * `frame`: rotation of the containers the widget is in; `w`, `h`: widget box;
 * `scale`: canvas units → screen px.
 */
export function dragAngle(o: {
  a0: number; pivot: { x: number; y: number }; dx: number; dy: number; frame?: number;
  w: number; h: number; scale: number; snap: RotateSnapSettings;
}): number {
  const vx = o.pivot.x + o.dx, vy = o.pivot.y + o.dy;
  const turned = (Math.atan2(vy, vx) - Math.atan2(o.pivot.y, o.pivot.x)) * 180 / Math.PI;
  const raw = o.a0 + turned;
  // Pointer distance from the widget's edge, in the widget's own frame, in screen px.
  const [lx, ly] = rotateVec(vx, vy, -((o.frame ?? 0) + raw));
  const dist = distToBox(lx, ly, o.w, o.h) * o.scale;
  const step = Math.max(1, dist > o.snap.distance ? o.snap.far : o.snap.near);
  return normAngle(Math.round(raw / step) * step);
}
