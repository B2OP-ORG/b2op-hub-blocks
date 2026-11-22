import type { SceneWidget } from "../../scene/model";
import { drawnSize } from "../../scene/geometry";
import { SceneWidgetBody } from "./widgets";

/** Palette drag: the real widget follows the pointer, at the canvas scale. */
export function PaletteDragGhost({ widget, x, y, scale, overTrash, heat = 0 }: {
  widget: SceneWidget; x: number; y: number; scale: number; overTrash: boolean;
  /** 0..1: tint red (dragged towards the toolbox bin). */
  heat?: number;
}) {
  const s = drawnSize(widget);
  return (
    <div style={{
      position: "fixed", left: x - (s.w * scale) / 2, top: y - (s.h * scale) / 2, width: s.w, height: s.h,
      transformOrigin: "0 0", transform: `scale(${scale})`, pointerEvents: "none", zIndex: 1000,
      opacity: overTrash || heat >= 1 ? 0.45 : 0.85, filter: "drop-shadow(0 2px 4px rgba(0,0,0,.4))",
    }}>
      <SceneWidgetBody w={widget} />
      {heat > 0 && <div style={{ position: "absolute", inset: 0, background: "#ef4444", opacity: heat * 0.65, borderRadius: 2 }} />}
    </div>
  );
}
