import type { SceneWidget } from "../../scene/model";
import { drawnSize, widgetAngle } from "../../scene/geometry";
import { DragGhost } from "../components/DragGhost";
import { SceneWidgetBody } from "./widgets";

/** A scene widget following the pointer (palette drag, or dragged out of the canvas), at the canvas scale. */
export function PaletteDragGhost({ widget, x, y, scale, overTrash, heat = 0 }: {
  widget: SceneWidget; x: number; y: number; scale: number; overTrash: boolean;
  /** 0..1: tint red (dragged towards the toolbox bin). */
  heat?: number;
}) {
  const s = drawnSize(widget);
  return (
    <DragGhost x={x} y={y} width={s.w} height={s.h} scale={scale} angle={widgetAngle(widget)} overTrash={overTrash} heat={heat}>
      <SceneWidgetBody w={widget} />
    </DragGhost>
  );
}
