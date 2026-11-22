import { SCREEN_H, SCREEN_W, childrenOf, isContainer, type SceneDoc, type SceneWidget } from "../../scene/model";
import { ancestorAngle, contentOffset, drawnSize, effectiveCrop, isOutside, widgetAngle } from "../../scene/geometry";
import { RotateHandle } from "../components/RotateHandle";
import { usePalette } from "../theme";
import type { WidgetDrag } from "../hooks/useWidgetDrag";
import { MARGIN } from "./constants";
import type { PreviewState, Stop } from "./preview";
import { SceneWidgetBody } from "./widgets";
import { DragHeatTint } from "../components/DragGhost";

/** What every widget node needs to draw itself and start drags. */
export interface SceneNodeContext {
  /** Committed scene (selection / tab lookups). */
  doc: SceneDoc;
  /** What is drawn: the preview copy in preview mode, else `doc`. */
  shownDoc: SceneDoc;
  preview: PreviewState | null;
  selected: string | null;
  /** Focus stop in preview mode. */
  stop: Stop | undefined;
  drag: WidgetDrag<SceneWidget> | null;
  scale: number;
  panCursor: string | undefined;
  overTrash: boolean;
  /** 0..1 while the dragged widget nears the toolbox bin (tints it red). */
  dragHeat: number;
  /** Start a drag; mode "point" drags point `point` of a line (`w` may already hold a newly inserted point). */
  onBeginDrag: (e: React.PointerEvent, w: SceneWidget, mode: "move" | "resize" | "point" | "crop" | "rotate", point?: number) => void;
  /** Remove point `i` of a line. */
  onRemovePoint: (w: SceneWidget, i: number) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
}

/** Which tab of a tab view to draw: the one holding the selection, else its value. */
function tabShown(ctx: SceneNodeContext, tv: SceneWidget): number {
  const sel = ctx.preview ? undefined : ctx.doc.widgets.find((w) => w.uid === ctx.selected);
  if (sel) {
    let q: SceneWidget | undefined = sel;
    while (q?.parent) {
      if (q.parent === tv.uid) return q.tab ?? 0;
      q = ctx.doc.widgets.find((o) => o.uid === q!.parent);
    }
  }
  return tv.value ?? 0;
}

/** The widgets of one container level (recursing into containers). */
function SceneLevel({ ctx, parent, tab }: { ctx: SceneNodeContext; parent?: string; tab?: number }) {
  const p = usePalette();
  const { preview, drag, scale, stop } = ctx;
  return (
    <>
      {childrenOf(ctx.shownDoc, parent, tab).map((w0) => {
        const w = drag?.uid === w0.uid ? drag.cur : w0;
        if (preview && w.hidden) return null;
        const size = drawnSize(w);
        const isSel = !preview && w.uid === ctx.selected;
        const focused = !!stop && stop.uid === w.uid;
        const off = contentOffset(w);
        const lineOff = w.kind === "line" ? (w.width ?? 2) / 2 : 0;
        const outside = !preview && isOutside(ctx.shownDoc, w);
        const angle = widgetAngle(w);
        const rotating = drag?.uid === w.uid && drag.mode === "rotate";
        return (
          <div key={w.uid}
            onPointerDown={(e) => ctx.onBeginDrag(e, w0, "move")}
            onPointerMove={ctx.onDragMove}
            onPointerUp={ctx.onDragEnd}
            onPointerCancel={ctx.onDragEnd}
            style={{
              // Lines: the box starts half a stroke up-left so the stroke (centred on the points, as in LVGL) is inside it.
              position: "absolute", left: w.x - lineOff, top: w.y - lineOff, width: size.w, height: size.h,
              transform: angle ? `rotate(${angle}deg)` : undefined,
              outline: isSel ? `${1 / scale * 2}px solid ${p.accent}` : undefined, outlineOffset: 1 / scale,
              opacity: (w.opacity ?? 100) / 100 * (drag?.uid === w.uid && ctx.overTrash ? 0.3 : outside ? 0.4 : !preview && w.hidden ? 0.45 : 1),
              ...(outside && !isSel ? { outline: `${2 / scale}px dashed ${p.danger}` } : {}),
              cursor: ctx.panCursor ?? (preview ? "default" : drag?.uid === w.uid ? "grabbing" : "grab"),
              touchAction: "none", userSelect: "none",
            }}>
            {(() => {
              const body = <SceneWidgetBody w={w} focused={focused} focusItem={focused ? stop?.item : undefined} editing={focused && preview?.editing} />;
              const c = effectiveCrop(w);
              // Cropped arcs: only the window shows (the hub clips them with a container).
              return c ? <div style={{ position: "absolute", inset: 0, clipPath: `inset(${c.y}px ${w.w - c.x - c.w}px ${w.h - c.y - c.h}px ${c.x}px)` }}>{body}</div> : body;
            })()}
            {isContainer(w.kind) && (
              <div style={{ position: "absolute", left: off.x, top: off.y, width: w.w - off.x, height: w.h - off.y, overflow: "hidden" }}>
                <SceneLevel ctx={ctx} parent={w.uid} tab={w.kind === "tabview" ? tabShown(ctx, w) : undefined} />
              </div>
            )}
            {drag?.uid === w.uid && drag.mode === "move" && <DragHeatTint heat={ctx.dragHeat} />}
            {isSel && w.kind === "line" && <LineHandles ctx={ctx} w={w} w0={w0} />}
            {isSel && w.crop && (w.kind === "arc" || w.kind === "arcline") && <CropHandles ctx={ctx} w={w} w0={w0} />}
            {isSel && (
              <RotateHandle size={10 / scale * 2} offset={(w.kind === "line" ? 14 : 6) / scale * 2} onPointerDown={(e) => ctx.onBeginDrag(e, w0, "rotate")}
                label={rotating ? `${w.kind === "line" ? (w.angle ?? 0) : angle}°` : undefined} unrotate={ancestorAngle(ctx.shownDoc, w) + angle} />
            )}
            {isSel && w.kind !== "line" && (
              <span onPointerDown={(e) => ctx.onBeginDrag(e, w0, "resize")} title="Resize (Shift: 4 px steps)"
                style={{ position: "absolute", right: -6 / scale * 2, bottom: -6 / scale * 2, width: 10 / scale * 2, height: 10 / scale * 2, borderRadius: 2 / scale, background: p.accent, cursor: "nwse-resize" }} />
            )}
          </div>
        );
      })}
    </>
  );
}

/** Crop window of the selected arc: dashed frame with a handle on each edge (index 0..3 = left, top, right, bottom). */
function CropHandles({ ctx, w, w0 }: { ctx: SceneNodeContext; w: SceneWidget; w0: SceneWidget }) {
  const p = usePalette();
  const c = effectiveCrop(w) ?? { x: 0, y: 0, w: w.w, h: w.h };
  const hs = 8 / ctx.scale, hl = 16 / ctx.scale;
  const edges: [number, number, number, number, string][] = [
    [c.x - hs / 2, c.y + c.h / 2 - hl / 2, hs, hl, "ew-resize"],
    [c.x + c.w / 2 - hl / 2, c.y - hs / 2, hl, hs, "ns-resize"],
    [c.x + c.w - hs / 2, c.y + c.h / 2 - hl / 2, hs, hl, "ew-resize"],
    [c.x + c.w / 2 - hl / 2, c.y + c.h - hs / 2, hl, hs, "ns-resize"],
  ];
  return (
    <>
      <span style={{ position: "absolute", left: c.x, top: c.y, width: c.w, height: c.h, boxSizing: "border-box", border: `${1 / ctx.scale}px dashed ${p.accent}`, pointerEvents: "none" }} />
      {edges.map(([x, y, ew, eh, cursor], i) => (
        <span key={i} title="Drag to crop the arc"
          onPointerDown={(e) => { if (e.button === 0) ctx.onBeginDrag(e, w0, "crop", i); }}
          style={{ position: "absolute", left: x, top: y, width: ew, height: eh, borderRadius: 2 / ctx.scale, background: p.accent, border: `${1 / ctx.scale}px solid #fff`, boxSizing: "border-box", cursor, touchAction: "none" }} />
      ))}
    </>
  );
}

/** Draggable point handles of the selected line, plus mid-point handles that insert a point. */
function LineHandles({ ctx, w, w0 }: { ctx: SceneNodeContext; w: SceneWidget; w0: SceneWidget }) {
  const p = usePalette();
  const pts = w.points ?? [];
  const off = (w.width ?? 2) / 2;
  const big = 10 / ctx.scale, small = 7 / ctx.scale;
  const dot = (x: number, y: number, size: number): React.CSSProperties => ({
    position: "absolute", left: x + off - size / 2, top: y + off - size / 2, width: size, height: size, boxSizing: "border-box",
    borderRadius: "50%", cursor: "move", touchAction: "none",
  });
  return (
    <>
      {pts.slice(1).map((b, i) => {
        const a = pts[i];
        const mid: [number, number] = [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];
        return (
          <span key={`m${i}`} title="Drag to add a point"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              const points = [...(w0.points ?? [])];
              points.splice(i + 1, 0, mid);
              ctx.onBeginDrag(e, { ...w0, points }, "point", i + 1);
            }}
            style={{ ...dot(mid[0], mid[1], small), background: p.panelBg, border: `${1 / ctx.scale}px solid ${p.accent}`, opacity: 0.85 }} />
        );
      })}
      {pts.map(([x, y], i) => (
        <span key={`p${i}`} title={pts.length > 2 ? "Drag to move, double-click to remove (Shift: 4 px steps)" : "Drag to move (Shift: 4 px steps)"}
          onPointerDown={(e) => { if (e.button === 0) ctx.onBeginDrag(e, w0, "point", i); }}
          onDoubleClick={(e) => { e.stopPropagation(); if (pts.length > 2) ctx.onRemovePoint(w0, i); }}
          style={{ ...dot(x, y, big), background: p.accent, border: `${1.5 / ctx.scale}px solid #fff` }} />
      ))}
    </>
  );
}

/** Scrollable, zoomable canvas with the hub's bezel and screen. */
export function SceneCanvas({ ctx, canvasRef, screenRef, canvasProps, showHint, overlay }: {
  ctx: SceneNodeContext;
  canvasRef: React.Ref<HTMLDivElement>;
  /** The LCD screen element: drop positions are measured from it. */
  screenRef: React.Ref<HTMLDivElement>;
  /** Event handlers of the scroll container (keys, pan / zoom, deselect). */
  canvasProps: React.HTMLAttributes<HTMLDivElement>;
  showHint: boolean;
  /** Drawn above the widgets, in screen (LCD) coordinates (e.g. the draw tool layer). */
  overlay?: React.ReactNode;
}) {
  const p = usePalette();
  const { scale, preview } = ctx;
  return (
    <div
      ref={canvasRef}
      tabIndex={0}
      {...canvasProps}
      className="remote-canvas pan-canvas"
      style={{
        flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", position: "relative", outline: "none",
        background: p.panelAltBg, cursor: ctx.panCursor,
        ["--sb-track" as string]: p.panelAltBg,
        ["--sb-thumb" as string]: `color-mix(in srgb, ${p.accent} 55%, transparent)`,
        ["--sb-thumb-hover" as string]: p.accent,
      }}
    >
      <div style={{ position: "relative", width: (SCREEN_W + MARGIN * 2) * scale, height: (SCREEN_H + MARGIN * 2) * scale, margin: "0 auto" }}>
        <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `scale(${scale})` }}>
          {/* Bezel + screen */}
          <div style={{ position: "absolute", left: MARGIN - 6, top: MARGIN - 6, width: SCREEN_W + 12, height: SCREEN_H + 12, borderRadius: 6, background: "#1f2933", boxShadow: "0 2px 8px rgba(0,0,0,.35)" }} />
          {/* Edit mode doesn't clip the screen, so widgets outside it can still be seen and dragged back. */}
          <div ref={screenRef} style={{ position: "absolute", left: MARGIN, top: MARGIN, width: SCREEN_W, height: SCREEN_H, background: ctx.shownDoc.bg, overflow: preview ? "hidden" : "visible" }}>
            <SceneLevel ctx={ctx} />
            {overlay}
          </div>
          {showHint && (
            <div style={{ position: "absolute", left: MARGIN + 8, top: MARGIN + 40, width: SCREEN_W - 16, color: "#9ca3af", fontSize: 7, lineHeight: 1.4, textAlign: "center", pointerEvents: "none" }}>
              Drag widgets here from the bar above (or click one). Drop one on the bin to delete it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
