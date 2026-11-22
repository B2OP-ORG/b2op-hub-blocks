// Scene editor: lay out LVGL widgets on the hub's 160x128 screen. The scene
// is stored in the header line of its `.py` file; every edit regenerates the
// Python below it (scene/codegen.ts), so the file is always a ready-to-import
// module.
//
// Modes: Edit (drag / resize / properties) and Preview, where the arrow keys
// and Enter act like the hub buttons (focus order, edit mode, events) on a
// local copy of the scene (preview.ts). Pan / zoom: see hooks/useCanvasView.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Monitor, PanelLeft, PanelRight, Pencil } from "lucide-react";
import { useApp } from "../../state/store";
import type { ProjectFile } from "../../project/format";
import type { PanelTool } from "../../settings/panelLayout";
import { DISPLAY_KINDS, INPUT_KINDS, KIND_LABEL, SCREEN_H, SCREEN_W, emptyScene, makeWidget, moduleOfPath, splitSceneHeader, subtree, withSceneHeader, type SceneKind, type SceneWidget } from "../../scene/model";
import { drawnSize } from "../../scene/geometry";
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
import { Toolbar } from "../components/Toolbar";
import { ZoomControls } from "../components/ZoomControls";
import { BASE, KIND_HINT, MARGIN } from "./constants";
import { OUTLINE_ROOT, Outline } from "./Outline";
import { PaletteDragGhost } from "./PaletteDragGhost";
import { PREVIEW_KEYS, applyPreviewKey, focusStops, startPreviewState, type PreviewState } from "./preview";
import { SceneCanvas, type SceneNodeContext } from "./SceneCanvas";
import { sceneOps } from "./sceneOps";
import { SceneProperties } from "./SceneProperties";
import { TrashTarget } from "./TrashTarget";
import { usePaletteDrag, useTrash, type NewDrag } from "./usePaletteDrag";
import { WidgetProperties } from "./WidgetProperties";

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
  const canvasRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const trash = useTrash();
  const widgetDrag = useWidgetDrag<SceneWidget>(canvasRef);
  // Refreshed every render below (needs the current scene).
  const dropNew = useRef<(d: NewDrag) => void>(() => {});
  const paletteDrag = usePaletteDrag(trash, (d) => dropNew.current(d));
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
  const tp = useToolPanels("scene", SCENE_TOOLS);

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
  const ops = sceneOps(doc, file.id, module, selected, setSelected);

  // ── Palette drag (new widget) ───────────────────────────────────────────────
  /** The widget a palette drag would add (for the ghost and the drop maths). */
  const template = newDrag ? makeWidget(newDrag.kind, 0, 0, doc) : null;
  dropNew.current = (d) => {
    if (!d.moved) { ops.addDefault(d.kind); return; } // a click
    if (trash.overRef.current) return;
    const canvas = canvasRef.current?.getBoundingClientRect(), scr = screenRef.current?.getBoundingClientRect();
    if (!canvas || !scr || d.x < canvas.left || d.x > canvas.right || d.y < canvas.top || d.y > canvas.bottom) return;
    const size = drawnSize(makeWidget(d.kind, 0, 0, doc));
    // The ghost is centred on the pointer: keep that spot under the pointer.
    ops.addAt(d.kind, (d.x - scr.left) / scale, (d.y - scr.top) / scale, size.w / 2, size.h / 2);
  };

  // ── Widget drag (move / resize) ─────────────────────────────────────────────
  const { drag } = widgetDrag;
  const beginDrag = (e: React.PointerEvent, w: SceneWidget, mode: "move" | "resize") => {
    if (preview || e.button !== 0) return;
    setSelected(w.uid);
    widgetDrag.begin(e, w, mode);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.mode === "move") trash.set(trash.hit(e.clientX, e.clientY));
    const step = e.shiftKey ? 4 : 1;
    const sn = (v: number) => Math.round(v / step) * step;
    widgetDrag.move(e, scale, (o, mode, dx, dy) => mode === "move"
      ? { ...o, x: sn(o.x + dx), y: sn(o.y + dy) }
      : o.kind === "qrcode"
        ? { ...o, w: Math.max(8, sn(Math.min(o.w, o.h) + Math.max(dx, dy))), h: Math.max(8, sn(Math.min(o.w, o.h) + Math.max(dx, dy))) }
        : { ...o, w: Math.max(4, sn(o.w + dx)), h: Math.max(4, sn(o.h + dy)) });
  };
  const endDrag = () => {
    const d = widgetDrag.end();
    if (!d) return;
    if (d.mode === "move" && trash.overRef.current) { trash.set(false); ops.remove(d.orig.uid); return; }
    const { cur } = d;
    if (boxChanged(d)) ops.update(cur.uid, { x: cur.x, y: cur.y, w: cur.w, h: cur.h });
  };

  // ── Preview (hub buttons on the keyboard) ───────────────────────────────────
  const stop = preview ? focusStops(preview.doc)[preview.focus] : undefined;
  const startPreview = () => {
    setSelected(null);
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
    if (m) { e.preventDefault(); ops.update(w.uid, { x: w.x + m[0], y: w.y + m[1] }); }
  };

  const fitAll = () => cv.fit(0, 0, (SCREEN_W + MARGIN * 2) * BASE, (SCREEN_H + MARGIN * 2) * BASE);
  const panCursor = cv.panning ? "grabbing" : cv.spaceHeld ? "grab" : undefined;
  const sel = preview ? undefined : doc.widgets.find((w) => w.uid === selected);

  const nodeCtx: SceneNodeContext = {
    doc, shownDoc, preview, selected, stop, drag, scale, panCursor, overTrash: trash.over,
    onBeginDrag: beginDrag, onDragMove, onDragEnd: endDrag,
  };
  const chipProps = (k: SceneKind): React.ButtonHTMLAttributes<HTMLButtonElement> => ({
    onPointerDown: (e) => { if (e.button !== 0) return; e.preventDefault(); paletteDrag.start(k, e.clientX, e.clientY); },
    // Keyboard activation only (detail 0): pointer clicks are handled by the drag.
    onClick: (e) => { if (e.detail === 0) ops.addDefault(k); },
    style: { touchAction: "none", userSelect: "none" },
  });
  const paletteGroup = (title: string, kinds: SceneKind[]) => (
    <PaletteGroup title={title} kinds={kinds} label={(k) => KIND_LABEL[k]} hint={(k) => `${KIND_HINT[k]} — drag onto the screen or click to add`} chipProps={chipProps} />
  );

  const tools: ToolNodes = {
    outline: <Outline doc={doc} selected={preview ? null : selected} collapsed={collapsed} onToggle={toggleCollapsed}
      editable={!preview} onDropWidget={ops.moveTo} onSelect={(u) => { setPreview(null); setSelected(u); }} onMove={ops.moveZ} />,
    properties: preview ? null : sel
      ? <WidgetProperties key={sel.uid} doc={doc} w={sel} module={module} selPath={subtree(doc, sel.uid)}
          onChange={(patch) => ops.update(sel.uid, patch)} onDelete={() => ops.remove(sel.uid)} />
      : <SceneProperties doc={doc} module={module} onChange={(patch) => ops.commitDoc({ ...doc, ...patch })} />,
    palette: (
      <PalettePanel>
        {preview ? (
          <PaletteHint>{preview.log}</PaletteHint>
        ) : (
          <>
            {paletteGroup("Display", DISPLAY_KINDS)}
            {paletteGroup("Buttons", INPUT_KINDS)}
          </>
        )}
      </PalettePanel>
    ),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", color: p.text, fontSize: 13 }}>
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
            <SceneCanvas
              ctx={nodeCtx}
              canvasRef={canvasRef}
              screenRef={screenRef}
              showHint={!preview && doc.widgets.length === 0 && !newDrag?.moved}
              canvasProps={{ onKeyDown, ...cv.handlers, onPointerDown: () => { if (!preview) setSelected(null); } }}
            />
            {!preview && <TrashTarget trashRef={trash.ref} over={trash.over} active={drag?.mode === "move" || !!newDrag?.moved} />}
          </div>
        </div>

        {newDrag?.moved && template && <PaletteDragGhost widget={template} x={newDrag.x} y={newDrag.y} scale={scale} overTrash={trash.over} />}

        <ToolColumns tp={tp} side="right" nodes={tools} emptyHint="Properties can be edited in edit mode." />
      </div>
    </div>
  );
}
