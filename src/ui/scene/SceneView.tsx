// Scene editor: lay out LVGL widgets on the hub's 160x128 screen. The scene
// is stored in the header line of its `.py` file; every edit regenerates the
// Python below it (scene/codegen.ts), so the file is always a ready-to-import
// module.
//
// Modes: Edit (drag / resize / properties) and Preview, where the arrow keys
// and Enter act like the hub buttons (focus order, edit mode, events) on a
// local copy of the scene (preview.ts). Pan / zoom: see hooks/useCanvasView.ts.
// Undo / redo (toolbar, Ctrl Z / Ctrl Shift Z / Ctrl Y): see editHistory.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Monitor, PanelLeft, PanelRight, Pencil } from "lucide-react";
import { useApp } from "../../state/store";
import type { ProjectFile } from "../../project/format";
import type { PanelTool } from "../../settings/panelLayout";
import { KIND_LABEL, SCREEN_H, SCREEN_W, emptyScene, makeWidget, moduleOfPath, splitSceneHeader, subtree, withSceneHeader, type SceneKind, type SceneWidget } from "../../scene/model";
import { ancestorAngle, dragCropEdge, drawnSize, normalizeLine, rotateLine, widgetAngle } from "../../scene/geometry";
import { keepTopLeft, rotateVec } from "../../geometry/rotation";
import { dragAngle, rotatePivot, useRotateSnap } from "../hooks/rotateDrag";
import { resolveSceneSrc } from "../../scene/project";
import { sceneToPython } from "../../scene/codegen";
import { usePalette } from "../theme";
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, useCanvasView } from "../hooks/useCanvasView";
import { boxChanged, useWidgetDrag } from "../hooks/useWidgetDrag";
import { FileLoadError } from "../components/FileLoadError";
import { ModeToggle } from "../components/ModeToggle";
import { PaletteGroup, PaletteHint, PalettePanel } from "../components/PaletteGroup";
import { PanelToggle } from "../components/PanelToggle";
import { ToolColumns, type ToolNodes } from "../components/ToolPanels";
import { useToolPanels } from "../hooks/useToolPanels";
import { useFoldState } from "../hooks/useFoldState";
import { Toolbar } from "../components/Toolbar";
import { ZoomControls } from "../components/ZoomControls";
import { ToolboxBin, TrashTarget } from "../components/TrashTarget";
import { UndoRedoButtons } from "../components/UndoRedoButtons";
import { useBinDrag } from "../hooks/useBinDrag";
import { usePaletteDrag, type NewDrag } from "../hooks/usePaletteDrag";
import { useUndoRedo } from "../hooks/useUndoRedo";
import type { EditSnapshot } from "../editHistory";
import { BASE, DRAW_TOOLS, PROP_FOLDED_BY_DEFAULT, KIND_HINT, KIND_ICON, MARGIN, PALETTE_CATEGORIES, PALETTE_LABEL, type DrawTool } from "./constants";
import { DrawOverlay } from "./DrawOverlay";
import { fitSceneImage } from "./imageUpload";
import { OUTLINE_ROOT, Outline } from "./Outline";
import { PaletteDragGhost } from "./PaletteDragGhost";
import { PREVIEW_KEYS, applyPreviewKey, focusStops, startPreviewState, type PreviewState } from "./preview";
import { SceneCanvas, type SceneNodeContext } from "./SceneCanvas";
import { sceneOps } from "./sceneOps";
import { SceneProperties } from "./SceneProperties";
import { WidgetProperties } from "./WidgetProperties";
import { SceneAssetContext } from "./sceneAssets";

const SCENE_TOOLS: PanelTool[] = ["outline", "properties", "palette"];

export function SceneView({ file }: { file: ProjectFile }) {
  const p = usePalette();
  const module = moduleOfPath(file.name);
  const parsed = useMemo(() => splitSceneHeader(file.content), [file.content]);
  const [selected, setSelected] = useState<string | null>(null);
  /** Folded outline nodes (kept here: the outline remounts when the panels change). */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const toggleCollapsed = (id: string) => setCollapsed((c) => {
    const next = new Set(c);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const [preview, setPreview] = useState<PreviewState | null>(null);
  /** Active draw tool (null = select / move). */
  const [tool, setTool] = useState<DrawTool | null>(null);
  const paletteFolds = useFoldState("b2op.scene.paletteFolds");
  const propFolds = useFoldState("b2op.scene.propFolds", PROP_FOLDED_BY_DEFAULT);
  const files = useApp((s) => s.mfp.files);
  const canvasRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const widgetDrag = useWidgetDrag<SceneWidget>(canvasRef);
  // Refreshed every render below (needs the current scene).
  const dropNew = useRef<(d: NewDrag<SceneKind>) => void>(() => {});
  const paletteRef = useRef<HTMLDivElement>(null);
  const bin = useBinDrag({ paletteRef, canvasRef });
  const { trash } = bin;
  const paletteDrag = usePaletteDrag<SceneKind>(trash, (d) => dropNew.current(d),
    () => paletteRef.current?.getBoundingClientRect());
  const { newDrag } = paletteDrag;
  const projectId = useApp((s) => s.mfp.id);
  const cv = useCanvasView({
    canvasRef,
    storageKey: `b2op.sceneZoom.${projectId}.${file.id}`,
    isControl: () => false,
    onPanStart: () => widgetDrag.cancel(),
  });
  const { zoom } = cv;
  const scale = zoom * BASE;
  const rotateSnap = useRotateSnap();
  const tp = useToolPanels("scene", SCENE_TOOLS);
  const rootRef = useRef<HTMLDivElement>(null);
  const history = useUndoRedo({
    fileId: file.id, rootRef, selected,
    enabled: !!parsed.doc && !preview && !widgetDrag.drag,
    restore: (s: EditSnapshot) => {
      useApp.getState().updateFile(file.id, s.content);
      const restored = splitSceneHeader(s.content).doc;
      setSelected(restored?.widgets.some((w) => w.uid === s.selected) ? s.selected : null);
      // Image PNGs follow their widget's size (a no-op when they already match).
      for (const w of restored?.widgets ?? []) {
        if (w.kind === "image") fitSceneImage(file.name, w.uid).catch((e: Error) => useApp.getState().appendConsole("err", `[image resize failed: ${e.message}]\n`));
      }
    },
  });

  // Keep the generated Python in step (e.g. after a codegen update or a renamed file).
  const doc0 = parsed.doc;
  useEffect(() => {
    if (!doc0) return;
    const want = withSceneHeader(doc0, sceneToPython(doc0, module));
    if (want !== file.content) useApp.getState().updateFile(file.id, want);
  }, [doc0, module, file.id, file.content]);

  // Unfold the outline down to a newly selected widget (e.g. picked on the canvas).
  // Only when the selection changes, so folding the selected widget's parent sticks.
  const [unfoldedFor, setUnfoldedFor] = useState<string | null>(null);
  if (selected !== unfoldedFor) {
    setUnfoldedFor(selected);
    const widgets = parsed.doc?.widgets ?? [];
    const path = [OUTLINE_ROOT];
    for (let w = widgets.find((x) => x.uid === selected); w?.parent; w = widgets.find((x) => x.uid === w!.parent)) path.push(w.parent);
    if (selected && path.some((id) => collapsed.has(id))) setCollapsed(new Set([...collapsed].filter((id) => !path.includes(id))));
  }

  if (!parsed.doc) {
    return (
      <FileLoadError fileName={file.name} error={parsed.error ?? ""} resetLabel="Replace with an empty scene"
        onReset={() => { const d = emptyScene(); useApp.getState().updateFile(file.id, withSceneHeader(d, sceneToPython(d, module))); }} />
    );
  }
  const doc = parsed.doc;
  const shownDoc = preview?.doc ?? doc;
  const ops0 = sceneOps(doc, file.id, module, selected, setSelected);
  // Image widgets: a new size re-renders their PNG at that size (the hub draws it 1:1).
  const ops = {
    ...ops0,
    update: (uid: string, patch: Partial<SceneWidget>, coalesce = false) => {
      ops0.update(uid, patch, coalesce);
      if ((patch.w !== undefined || patch.h !== undefined) && doc.widgets.find((x) => x.uid === uid)?.kind === "image") {
        fitSceneImage(file.name, uid).catch((e: Error) => useApp.getState().appendConsole("err", `[image resize failed: ${e.message}]\n`));
      }
    },
  };

  // ── Palette drag (new widget) ───────────────────────────────────────────────
  /** The widget a palette drag would add (for the ghost and the drop maths). */
  const template = newDrag ? makeWidget(newDrag.kind, 0, 0, doc) : null;
  // A new widget taken back to the toolbox is put back (shown like the bin).
  const newHeat = newDrag?.moved && newDrag.away ? bin.heatAt(newDrag.x, newDrag.y) : 0;
  dropNew.current = (d) => {
    if (!d.moved) { ops.addDefault(d.kind); return; } // a click
    if (trash.overRef.current) return;
    const canvas = canvasRef.current?.getBoundingClientRect(), scr = screenRef.current?.getBoundingClientRect();
    if (!canvas || !scr || d.x < canvas.left || d.x > canvas.right || d.y < canvas.top || d.y > canvas.bottom) return;
    const w = makeWidget(d.kind, 0, 0, doc);
    const size = drawnSize(w);
    // The ghost is centred on the pointer: keep that spot under the pointer
    // (a line's box starts half a stroke before its position, see SceneCanvas).
    const lineOff = w.kind === "line" ? (w.width ?? 2) / 2 : 0;
    ops.addAt(d.kind, (d.x - scr.left) / scale, (d.y - scr.top) / scale, size.w / 2 - lineOff, size.h / 2 - lineOff);
  };

  // ── Widget drag (move / resize) ─────────────────────────────────────────────
  const { drag } = widgetDrag;
  const beginDrag = (e: React.PointerEvent, w: SceneWidget, mode: "move" | "resize" | "point" | "crop" | "rotate", point?: number) => {
    if (preview || tool || e.button !== 0) return;
    setSelected(w.uid);
    if (mode === "move") bin.begin(e);
    widgetDrag.begin(e, w, mode, point, mode === "rotate" ? rotatePivot(e, scale) : undefined);
  };
  const removePoint = (w: SceneWidget, i: number) => {
    const points = (w.points ?? []).filter((_, j) => j !== i);
    if (points.length >= 2) ops.update(w.uid, normalizeLine({ x: w.x, y: w.y, points }));
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.mode === "move") bin.move(e);
    const step = e.shiftKey ? 4 : 1;
    const sn = (v: number) => Math.round(v / step) * step;
    widgetDrag.move(e, scale, (o, mode, sdx, sdy, point) => {
      // Pointer travel (screen-aligned) in the parent's frame and in the widget's own (rotated) frame.
      const frame = ancestorAngle(doc, o), own = frame + widgetAngle(o);
      const [px, py] = rotateVec(sdx, sdy, -frame);
      const [dx, dy] = rotateVec(sdx, sdy, -own);
      if (mode === "rotate") {
        const size = drawnSize(o);
        const a = dragAngle({ a0: widgetAngle(o), pivot: drag?.pivot ?? { x: 1, y: 0 }, dx: sdx, dy: sdy, frame, w: size.w, h: size.h, scale, snap: rotateSnap });
        // Lines turn their points (`angle` only labels the handle while dragging; not committed).
        return o.kind === "line" ? { ...rotateLine(o, a), angle: a > 180 ? a - 360 : a } : { ...o, angle: a || undefined };
      }
      if (mode === "crop") return { ...o, crop: dragCropEdge(o, point ?? 0, sn(dx), sn(dy)) };
      if (mode === "point") return normalizeLine({ ...o, points: (o.points ?? []).map((q, i): [number, number] => i === point ? [sn(q[0] + dx), sn(q[1] + dy)] : q) });
      if (mode === "move") return { ...o, x: sn(o.x + px), y: sn(o.y + py) };
      const n = o.kind === "image" && o.keepAspect !== false && o.w > 0 && o.h > 0
        ? (() => {
            const f = Math.max((o.w + dx) / o.w, (o.h + dy) / o.h);
            return { ...o, w: Math.max(4, Math.round(o.w * f)), h: Math.max(4, Math.round(o.h * f)) };
          })()
        : o.kind === "qrcode"
          ? { ...o, w: Math.max(8, sn(Math.min(o.w, o.h) + Math.max(dx, dy))), h: Math.max(8, sn(Math.min(o.w, o.h) + Math.max(dx, dy))) }
          : { ...o, w: Math.max(4, sn(o.w + dx)), h: Math.max(4, sn(o.h + dy)) };
      // Rotated: the opposite (top-left) corner stays put on screen.
      const s0 = drawnSize(o), s1 = drawnSize(n);
      const tl = keepTopLeft(o.x, o.y, s0.w, s0.h, s1.w, s1.h, widgetAngle(o));
      return { ...n, x: Math.round(tl.x), y: Math.round(tl.y) };
    });
  };
  const endDrag = () => {
    const d = widgetDrag.end();
    if (!d) return;
    if (bin.end() && d.mode === "move") { ops.remove(d.orig.uid); return; }
    const { cur } = d;
    if (d.mode === "crop") {
      if (JSON.stringify(d.orig.crop) !== JSON.stringify(cur.crop)) ops.update(cur.uid, { crop: cur.crop });
      return;
    }
    if (d.mode === "rotate") {
      if (cur.kind === "line") {
        if (JSON.stringify(d.orig.points) !== JSON.stringify(cur.points) || d.orig.x !== cur.x || d.orig.y !== cur.y) ops.update(cur.uid, { x: cur.x, y: cur.y, points: cur.points });
      } else if ((d.orig.angle ?? 0) !== (cur.angle ?? 0)) ops.update(cur.uid, { angle: cur.angle });
      return;
    }
    if (d.mode === "point") {
      const was = doc.widgets.find((w) => w.uid === cur.uid);
      if (was && (JSON.stringify(was.points) !== JSON.stringify(cur.points) || was.x !== cur.x || was.y !== cur.y)) ops.update(cur.uid, { x: cur.x, y: cur.y, points: cur.points });
      return;
    }
    if (boxChanged(d)) ops.update(cur.uid, { x: cur.x, y: cur.y, w: cur.w, h: cur.h });
  };

  // ── Preview (hub buttons on the keyboard) ───────────────────────────────────
  const stop = preview ? focusStops(preview.doc)[preview.focus] : undefined;
  const startPreview = () => {
    setSelected(null);
    setTool(null);
    setPreview(startPreviewState(doc));
    canvasRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (cv.onKeyDown(e)) return;
    if ((e.target as HTMLElement).closest("input,select,textarea")) return;
    if (preview) {
      const k = PREVIEW_KEYS[e.key];
      if (k) { e.preventDefault(); setPreview(applyPreviewKey(preview, k, module)); }
      return;
    }
    const w = doc.widgets.find((x) => x.uid === selected);
    if (!w) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); ops.remove(w.uid); return; }
    const step = e.shiftKey ? 8 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (m) { e.preventDefault(); ops.update(w.uid, { x: w.x + m[0], y: w.y + m[1] }, true); }
  };

  const fitAll = () => cv.fit(0, 0, (SCREEN_W + MARGIN * 2) * BASE, (SCREEN_H + MARGIN * 2) * BASE);
  const panCursor = cv.panning ? "grabbing" : cv.spaceHeld ? "grab" : undefined;
  const sel = preview ? undefined : doc.widgets.find((w) => w.uid === selected);

  const nodeCtx: SceneNodeContext = {
    doc, shownDoc, preview, selected, stop, drag, scale, panCursor, overTrash: bin.over, dragHeat: bin.heat,
    onBeginDrag: beginDrag, onDragMove, onDragEnd: endDrag, onRemovePoint: removePoint,
  };
  /** Image widget src → its project image (resolved next to the scene file). */
  const resolveAsset = (src: string) => {
    const path = resolveSceneSrc(file.name, src);
    return path ? files.find((f) => f.name === path)?.asset : undefined;
  };
  const pickTool = (t: DrawTool) => {
    const next = tool === t ? null : t;
    setTool(next);
    if (next) setSelected(null);
    canvasRef.current?.focus();
  };
  const chipProps = (k: SceneKind) => paletteDrag.chipProps(k, ops.addDefault);
  const paletteGroup = (id: string, title: string, kinds: SceneKind[]) => (
    <PaletteGroup key={id} title={title} kinds={kinds} label={(k) => PALETTE_LABEL[k] ?? KIND_LABEL[k]} hint={(k) => `${KIND_HINT[k]} — drag onto the screen or click to add`}
      chipProps={chipProps} icon={(k) => { const I = KIND_ICON[k]; return <I size={14} />; }}
      folded={paletteFolds.isFolded(id)} onToggle={() => paletteFolds.toggle(id)} />
  );
  const drawTool = (t: DrawTool) => DRAW_TOOLS.find((d) => d.tool === t)!;

  const tools: ToolNodes = {
    outline: <Outline doc={doc} selected={preview ? null : selected} collapsed={collapsed} onToggle={toggleCollapsed}
      editable={!preview} onDropWidget={ops.moveTo} onSelect={(u) => { setPreview(null); setSelected(u); }} onMove={ops.moveZ} />,
    properties: preview ? null : sel
      ? <WidgetProperties key={sel.uid} doc={doc} w={sel} module={module} scenePath={file.name} selPath={subtree(doc, sel.uid)} folds={propFolds}
          onChange={(patch) => ops.update(sel.uid, patch, true)} onDelete={() => ops.remove(sel.uid)} />
      : <SceneProperties doc={doc} module={module} onChange={(patch) => ops.commitDoc({ ...doc, ...patch }, `scene:${Object.keys(patch).sort().join(",")}`)} />,
    palette: (
      <PalettePanel ref={paletteRef}>
        {preview ? (
          <PaletteHint>{preview.log}</PaletteHint>
        ) : (
          <>
            <PaletteGroup title="Draw" kinds={DRAW_TOOLS.map((d) => d.tool)} label={(t) => drawTool(t).label}
              hint={(t) => `${drawTool(t).hint} — click to pick, again (or Esc) to stop`}
              icon={(t) => { const I = drawTool(t).icon; return <I size={14} />; }} active={(t) => tool === t}
              chipProps={(t) => ({ onClick: () => pickTool(t) })}
              folded={paletteFolds.isFolded("draw")} onToggle={() => paletteFolds.toggle("draw")} />
            {PALETTE_CATEGORIES.map((c) => paletteGroup(c.id, c.title, c.kinds))}
          </>
        )}
      </PalettePanel>
    ),
  };

  return (
    <div ref={rootRef} style={{ display: "flex", flexDirection: "column", height: "100%", color: p.text, fontSize: 13 }}>
      {/* Compacts when narrow: 1 hides the import line, 2 the mode labels, 3 the zoom % and icon. */}
      <Toolbar maxCompact={3}>{(c) => <>
        {tp.has("left") && <PanelToggle open={tp.isOpen("left")} onToggle={() => tp.toggle("left")} title={tp.toggleTitle("left")} icon={<PanelLeft size={15} />} />}
        {c < 3 && <Monitor size={15} color={p.accent} />}
        {c < 1 && <code style={{ fontSize: 11, color: p.dimText }}>import {module}</code>}
        <ModeToggle
          iconOnly={c >= 2}
          value={preview ? "preview" : "edit"}
          onChange={(m) => (m === "edit" ? setPreview(null) : startPreview())}
          options={[
            { value: "edit", label: "Edit", title: "Edit the scene", icon: <Pencil size={13} /> },
            { value: "preview", label: "Preview", title: "Try the hub buttons: ↑ ↓ = up / down, Enter = center, ← = left", icon: <Eye size={13} /> },
          ]}
        />
        <UndoRedoButtons history={history} />
        <ZoomControls
          percent={scale * 100}
          canZoomOut={zoom > MIN_ZOOM} canZoomIn={zoom < MAX_ZOOM}
          onZoomOut={() => cv.zoomTo(zoom / ZOOM_STEP)} onZoomIn={() => cv.zoomTo(zoom * ZOOM_STEP)} onReset={() => cv.zoomTo(1)}
          onFit={fitAll} fitTitle="Fit the screen into view" hidePercent={c >= 3}
        />
        {tp.has("right") && <PanelToggle open={tp.isOpen("right")} onToggle={() => tp.toggle("right")} title={tp.toggleTitle("right")} icon={<PanelRight size={15} />} />}
      </>}</Toolbar>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <ToolColumns tp={tp} side="left" nodes={tools} emptyHint="Properties can be edited in edit mode." />

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex" }}>
            <SceneAssetContext value={resolveAsset}>
            <SceneCanvas
              ctx={nodeCtx}
              canvasRef={canvasRef}
              screenRef={screenRef}
              showHint={!preview && !tool && doc.widgets.length === 0 && !newDrag?.moved}
              overlay={!preview && tool && (
                <DrawOverlay tool={tool} scale={scale} onCancel={() => setTool(null)}
                  onCommit={(r) => { ops.addShape(r); setTool(null); }} />
              )}
              canvasProps={{ onKeyDown, ...cv.handlers, onPointerDown: () => { if (!preview) setSelected(null); } }}
            />
            </SceneAssetContext>
            {!preview && <TrashTarget trashRef={trash.ref} over={trash.over} active={drag?.mode === "move" || !!newDrag?.moved} />}
          </div>
        </div>

        {newDrag?.moved && template && <PaletteDragGhost widget={template} x={newDrag.x} y={newDrag.y} scale={scale} overTrash={trash.over} heat={newHeat} />}
        {/* A widget dragged out of the canvas (towards the toolbox) keeps following the pointer. */}
        {drag?.mode === "move" && (() => {
          const g = bin.outsideGhost();
          return g && <PaletteDragGhost widget={drag.cur} x={g.x} y={g.y} scale={scale} overTrash={trash.over} heat={bin.heat} />;
        })()}
        {Math.max(bin.heat, newHeat) > 0 && <ToolboxBin rect={paletteRef.current?.getBoundingClientRect()} heat={Math.max(bin.heat, newHeat)} putBack={newHeat > 0} />}

        <ToolColumns tp={tp} side="right" nodes={tools} emptyHint="Properties can be edited in edit mode." />
      </div>
    </div>
  );
}
