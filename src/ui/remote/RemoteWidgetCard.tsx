import type { RemoteValue } from "../../device/protocol";
import { KIND_LABEL, type Widget } from "../../remote/layout";
import { usePalette } from "../theme";
import { DragGhost, DragHeatTint } from "../components/DragGhost";
import { RotateHandle } from "../components/RotateHandle";
import { WidgetBody } from "./widgets";

const CARD_RADIUS = 8;
const noop = () => {};

/** One widget on the remote canvas: header line, live body, resize handle when selected. */
export function RemoteWidgetCard({ w, showing, selected, conflict, dragging, rotating = false, panCursor, live, values, indicatorValue, overTrash = false, heat = 0, onChange, onBeginDrag, onDragMove, onDragEnd }: {
  w: Widget;
  /** Run / preview: finished look, controls react. */
  showing: boolean;
  selected: boolean;
  /** Name or id clashes with another widget of the project. */
  conflict: boolean;
  dragging: boolean;
  /** Being rotated by its handle (shows the angle). */
  rotating?: boolean;
  panCursor: string | undefined;
  /** Controls send their values (run mode, or preview locally). */
  live: boolean;
  values: Record<string, RemoteValue>;
  indicatorValue: RemoteValue | undefined;
  /** Being moved over a bin: released, it is deleted (faded). */
  overTrash?: boolean;
  /** 0..1: being moved towards the toolbox bin (tinted red). */
  heat?: number;
  onChange: (name: string, value: RemoteValue, merge?: boolean) => void;
  onBeginDrag: (e: React.PointerEvent, w: Widget, mode: "move" | "resize" | "rotate") => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
}) {
  const p = usePalette();
  return (
    <div
      onPointerDown={(e) => onBeginDrag(e, w, "move")}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      style={{
        position: "absolute", left: w.x, top: w.y, width: w.w, height: w.h, boxSizing: "border-box",
        transform: w.angle ? `rotate(${w.angle}deg)` : undefined,
        display: "flex", flexDirection: "column", padding: showing ? "6px 12px 8px" : "6px 10px 8px",
        background: p.surface, borderRadius: CARD_RADIUS, opacity: overTrash ? 0.3 : 1,
        border: `${selected || conflict ? 2 : 1}px solid ${conflict ? p.danger : selected ? p.accent : p.border}`,
        boxShadow: dragging ? p.shadow : "0 1px 2px rgba(0,0,0,.08)",
        cursor: panCursor ?? (showing ? "default" : dragging ? "grabbing" : "grab"),
        touchAction: "none", userSelect: "none",
      }}
    >
      {showing ? (
        // Finished look: just the name (a button carries its name itself).
        w.kind !== "button" && (
          <div style={{ fontSize: 14, lineHeight: 1.25, fontWeight: 600, color: p.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 2 }}>
            {w.name}
          </div>
        )
      ) : (
        <div style={{ fontSize: 11, color: p.dimText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 2 }}>
          {w.kind === "button" ? KIND_LABEL[w.kind] : w.name}
          <span style={{ opacity: 0.7 }}> · {w.kind === "joystick" ? `#${w.id}/${w.idY ?? w.id + 1}` : `#${w.id}`}</span>
        </div>
      )}
      <div data-widget-body style={{ flex: 1, minHeight: 0, pointerEvents: showing && !panCursor ? "auto" : "none" }}>
        <WidgetBody w={w} p={p} live={live} values={values} value={indicatorValue} onChange={onChange} />
      </div>
      <DragHeatTint heat={heat} radius={CARD_RADIUS} />
      {selected && (
        <RotateHandle size={16} offset={7} onPointerDown={(e) => onBeginDrag(e, w, "rotate")}
          label={rotating ? `${w.angle ?? 0}°` : undefined} unrotate={w.angle ?? 0} />
      )}
      {selected && (
        <span
          onPointerDown={(e) => onBeginDrag(e, w, "resize")}
          title="Resize"
          style={{ position: "absolute", right: -5, bottom: -5, width: 12, height: 12, borderRadius: 3, background: p.accent, cursor: "nwse-resize" }}
        />
      )}
    </div>
  );
}

/** A remote widget following the pointer (palette drag, or dragged out of the canvas), centred on client (x, y). */
export function RemoteWidgetGhost({ w, x, y, zoom, overTrash, heat }: {
  w: Widget; x: number; y: number; zoom: number; overTrash: boolean; heat?: number;
}) {
  return (
    <DragGhost x={x} y={y} width={w.w} height={w.h} scale={zoom} angle={w.angle} overTrash={overTrash} heat={heat} radius={CARD_RADIUS}>
      <RemoteWidgetCard w={{ ...w, x: 0, y: 0, angle: undefined }} showing={false} selected={false} conflict={false} dragging panCursor={undefined}
        live={false} values={{}} indicatorValue={undefined} onChange={noop} onBeginDrag={noop} onDragMove={noop} onDragEnd={noop} />
    </DragGhost>
  );
}
