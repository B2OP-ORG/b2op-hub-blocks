// Rotate handle shared by the scene and remote editors: a round badge on a
// selected widget's top-right corner (drag maths: hooks/rotateDrag.ts).

import { RotateCw } from "lucide-react";
import { usePalette } from "../theme";

/**
 * The handle itself, positioned on the top-right corner of its (relatively
 * positioned) widget. `size` / `offset` are in the widget's own units;
 * `label` (e.g. the angle while rotating) shows next to it, turned back by
 * `unrotate` degrees so it reads upright.
 */
export function RotateHandle({ size, offset, corner, label, unrotate = 0, onPointerDown }: {
  size: number;
  offset: number;
  /** Placement instead of the top-right corner (e.g. { right: -7, bottom: -7 }). */
  corner?: React.CSSProperties;
  label?: string;
  unrotate?: number;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const p = usePalette();
  return (
    <span onPointerDown={onPointerDown} title="Rotate (close to the widget: big steps, further away: small steps)"
      style={{
        position: "absolute", ...(corner ?? { right: -offset, top: -offset }), width: size, height: size, boxSizing: "border-box",
        display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%",
        background: p.accent, color: "#fff", cursor: "grab", touchAction: "none",
      }}>
      <RotateCw size={size * 0.68} strokeWidth={2.6} style={{ pointerEvents: "none" }} />
      {label && (
        <span style={{
          position: "absolute", left: "100%", bottom: "100%", marginLeft: size * 0.2, padding: `${size * 0.1}px ${size * 0.3}px`,
          borderRadius: size * 0.25, background: p.accent, color: "#fff", fontSize: size * 0.7, lineHeight: 1.2, whiteSpace: "nowrap", pointerEvents: "none",
          transform: unrotate ? `rotate(${-unrotate}deg)` : undefined, transformOrigin: "0 100%",
        }}>{label}</span>
      )}
    </span>
  );
}
