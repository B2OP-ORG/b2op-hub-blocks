import type { SceneWidget } from "../../scene/model";
import { drawnSize } from "../../scene/geometry";
import { SceneWidgetBody } from "./widgets";

/** Palette drag: the real widget follows the pointer, at the canvas scale. */
export function PaletteDragGhost({ widget, x, y, scale, overTrash }: { widget: SceneWidget; x: number; y: number; scale: number; overTrash: boolean }) {
  const s = drawnSize(widget);
  return (
    <div style={{
      position: "fixed", left: x - (s.w * scale) / 2, top: y - (s.h * scale) / 2, width: s.w, height: s.h,
      transformOrigin: "0 0", transform: `scale(${scale})`, pointerEvents: "none", zIndex: 1000,
      opacity: overTrash ? 0.3 : 0.85, filter: "drop-shadow(0 2px 4px rgba(0,0,0,.4))",
    }}>
      <SceneWidgetBody w={widget} />
    </div>
  );
}
