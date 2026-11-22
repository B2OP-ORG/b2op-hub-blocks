// Remote controller tab: edit mode (drag widgets onto a canvas, set names /
// ids / options), preview mode (looks and reacts like run mode, but nothing is
// sent and indicators show sample values) and run mode (a program runs,
// controls stream to the hub, indicators show program messages). Run mode is
// automatic: it follows the hub's program state (remote/session.ts), so the
// view switches to it whenever a program runs and back to edit mode when it
// ends. Preview is local to the view.
//
// Canvas: widgets may sit anywhere, also at negative positions. The scroll
// area is the home view (0,0 + visible size) and grows past any widget that
// sticks out, so it scrolls only when something is outside (bounds.ts,
// useCanvasBounds.ts). Pan / zoom: see hooks/useCanvasView.ts.
//
// Shared with the scene editor: pointer drag from the toolbox (with the widget
// following the pointer), deleting by dragging onto the bin or back onto the
// toolbox (hooks/useBinDrag.ts), undo / redo (hooks/useUndoRedo.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Gamepad2, PanelLeft, PanelRight, Pencil } from "lucide-react";
import { useApp } from "../../state/store";
import type { ProjectFile } from "../../project/format";
import type { RemoteValue } from "../../device/protocol";
import type { PanelTool } from "../../settings/panelLayout";
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
import { ToolboxBin, TrashTarget } from "../components/TrashTarget";
import { UndoRedoButtons } from "../components/UndoRedoButtons";
import { useBinDrag } from "../hooks/useBinDrag";
import { useFoldState } from "../hooks/useFoldState";
import { usePaletteDrag, type NewDrag } from "../hooks/usePaletteDrag";
import { commitEdit, useUndoRedo } from "../hooks/useUndoRedo";
import { KIND_HINT, KIND_ICON, PALETTE_CATEGORIES } from "./actions";
import { MARGIN, MIN_H, MIN_W } from "./bounds";
import { LayoutProperties } from "./LayoutProperties";
import { RemoteCanvas } from "./RemoteCanvas";
import { RemoteProperties } from "./RemoteProperties";
import { RemoteWidgetCard, RemoteWidgetGhost } from "./RemoteWidgetCard";
import { useCanvasBounds } from "./useCanvasBounds";
import {
  GRID, KIND_LABEL, emptyLayout, initialValue, previewIndicatorValue, makeWidget,
  parseLayout, projectSymbols, roleOf, serializeLayout, snap, symbolConflicted, symbolConflicts, tryParseLayout, widgetSymbols,
  type RemoteLayout, type Widget, type WidgetKind,
} from "../../remote/layout";
import { messageByName, setControl, useRemoteSession } from "../../remote/session";

const NO_WIDGETS: Widget[] = [];
/** The remote editor has no outline. */
const REMOTE_TOOLS: PanelTool[] = ["properties", "palette"];

export function RemoteView({ file }: { file: ProjectFile }) {
  const p = usePalette();
  const files = useApp((s) => s.mfp.files);
  const connected = useApp((s) => s.connection === "connected");
  const session = useRemoteSession();
  const live = session.phase !== "idle";
  // Preview: local control values, nothing sent. Run mode takes precedence.
  const [previewValues, setPreviewValues] = useState<Record<string, RemoteValue> | null>(null);
  const preview = previewValues !== null && !live;
  // A program started: leave preview, so the view returns to edit mode when it ends.
  useEffect(() => { if (live) setPreviewValues(null); }, [live]);
  /** Run or preview: the canvas shows the finished controller, not the editor. */
  const showing = live || preview;

  const parsed = useMemo((): { layout: RemoteLayout | null; error: string | null } => {
    try { return { layout: parseLayout(file.content), error: null }; } catch (e) { return { layout: null, error: (e as Error).message }; }
  }, [file.content]);

  const [selected, setSelected] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const widgetDrag = useWidgetDrag<Widget>(canvasRef);
  const projectId = useApp((s) => s.mfp.id);
  const cv = useCanvasView({
    canvasRef,
    storageKey: `b2op.remoteZoom.${projectId}.${file.id}`,
    isControl: (t) => showing && !!t.closest("[data-widget-body]"),
    onPanStart: () => widgetDrag.cancel(),
  });
  const { zoom, zoomRef } = cv;
  const tp = useToolPanels("remote", REMOTE_TOOLS);
  const rootRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const bin = useBinDrag({ paletteRef, canvasRef });
  const { trash } = bin;
  // Refreshed every render below (needs the current layout).
  const dropNew = useRef<(d: NewDrag<WidgetKind>) => void>(() => {});
  const paletteDrag = usePaletteDrag<WidgetKind>(trash, (d) => dropNew.current(d),
    () => paletteRef.current?.getBoundingClientRect());
  const { newDrag } = paletteDrag;
  const paletteFolds = useFoldState("b2op.remote.paletteFolds");
  const propFolds = useFoldState("b2op.remote.propFolds");
  const history = useUndoRedo({
    fileId: file.id, rootRef, selected,
    enabled: parsed.layout !== null && !showing && !widgetDrag.drag,
    restore: (s) => {
      useApp.getState().updateFile(file.id, s.content);
      setSelected(tryParseLayout(s.content)?.widgets.some((w) => w.uid === s.selected) ? s.selected : null);
    },
  });
  const { bounds, origin } = useCanvasBounds({ canvasRef, widgets: parsed.layout?.widgets ?? NO_WIDGETS, hasLayout: parsed.layout !== null, zoom, zoomRef });

  // Symbols of the whole project (names / ids must be unique across layouts).
  const allSymbols = useMemo(() => projectSymbols(files), [files]);
  const conflicts = useMemo(() => symbolConflicts(allSymbols), [allSymbols]);

  if (!parsed.layout) {
    return (
      <FileLoadError fileName={file.name} error={parsed.error ?? ""} resetLabel="Replace with an empty layout"
        onReset={() => useApp.getState().updateFile(file.id, serializeLayout(emptyLayout()))} />
    );
  }
  const layout = parsed.layout;

  /** Write the widgets back as one undo step (`coalesceKey`: merge quick repeats, see editHistory.ts). */
  const commit = (widgets: Widget[], coalesceKey?: string) => commitEdit(file.id, serializeLayout({ ...layout, widgets }), selected, coalesceKey);
  const update = (uid: string, patch: Partial<Widget>, coalesce = false) =>
    commit(layout.widgets.map((w) => (w.uid === uid ? { ...w, ...patch } : w)), coalesce ? `${uid}:${Object.keys(patch).sort().join(",")}` : undefined);
  const remove = (uid: string) => { commit(layout.widgets.filter((w) => w.uid !== uid)); setSelected(null); };
  const add = (kind: WidgetKind, x: number, y: number) => {
    const w = makeWidget(kind, x, y, allSymbols);
    commit([...layout.widgets, w]);
    setSelected(w.uid);
  };
  const addAtFreeSpot = (kind: WidgetKind) => {
    const bottom = layout.widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
    add(kind, 16, bottom + 16);
  };

  const hasConflict = (w: Widget) =>
    widgetSymbols(w, file.name).some((s) => symbolConflicted(conflicts, s));

  // ── Palette drag (new widget) ───────────────────────────────────────────────
  /** The widget a palette drag would add (for the ghost and the drop maths). */
  const template = newDrag ? makeWidget(newDrag.kind, 0, 0, allSymbols) : null;
  // A new widget taken back to the toolbox is put back (shown like the bin).
  const newHeat = newDrag?.moved && newDrag.away ? bin.heatAt(newDrag.x, newDrag.y) : 0;
  dropNew.current = (d) => {
    if (!d.moved) { addAtFreeSpot(d.kind); return; } // a click
    const el = canvasRef.current;
    if (trash.overRef.current || !el) return;
    const r = el.getBoundingClientRect();
    if (d.x < r.left || d.x > r.right || d.y < r.top || d.y > r.bottom) return;
    // The ghost is centred on the pointer: keep that spot under the pointer.
    const t = makeWidget(d.kind, 0, 0, allSymbols);
    add(d.kind, (d.x - r.left + el.scrollLeft) / zoom + bounds.left - t.w / 2, (d.y - r.top + el.scrollTop) / zoom + bounds.top - t.h / 2);
  };

  // ── Pointer drag (move / resize), committed on release ──────────────────────
  const { drag } = widgetDrag;
  const beginDrag = (e: React.PointerEvent, w: Widget, mode: "move" | "resize") => {
    if (showing || e.button !== 0) return;
    setSelected(w.uid);
    if (mode === "move") bin.begin(e);
    widgetDrag.begin(e, w, mode);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (drag?.mode === "move") bin.move(e);
    widgetDrag.move(e, zoom, (o, mode, dx, dy) => mode === "move"
      ? { ...o, x: snap(o.x + dx), y: snap(o.y + dy) }
      : { ...o, w: Math.max(MIN_W, snap(o.w + dx)), h: Math.max(MIN_H, snap(o.h + dy)) });
  };
  const endDrag = () => {
    const d = widgetDrag.end();
    if (!d) return;
    if (bin.end() && d.mode === "move") { remove(d.orig.uid); return; }
    if (boxChanged(d)) update(d.cur.uid, { x: d.cur.x, y: d.cur.y, w: d.cur.w, h: d.cur.h });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (cv.onKeyDown(e)) return;
    if (showing || !selected || (e.target as HTMLElement).closest("input,select,textarea")) return;
    const w = layout.widgets.find((x) => x.uid === selected);
    if (!w) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(w.uid); return; }
    const step = e.shiftKey ? GRID * 4 : GRID;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (m) { e.preventDefault(); update(w.uid, { x: snap(w.x + m[0]), y: snap(w.y + m[1]) }, true); }
  };

  const shown = layout.widgets.map((w) => (drag?.uid === w.uid ? drag.cur : w));
  /**
   * Fit: trim the canvas to the smallest size — move every widget so the group
   * starts MARGIN from the top-left (saved to the layout), then zoom so it all
   * fits the visible area. Nothing sticks out afterwards, so no scrollbars.
   */
  const fitAll = () => {
    if (layout.widgets.length === 0) { cv.zoomTo(1); return; }
    const minX = Math.min(...layout.widgets.map((w) => w.x)), minY = Math.min(...layout.widgets.map((w) => w.y));
    const maxX = Math.max(...layout.widgets.map((w) => w.x + w.w)), maxY = Math.max(...layout.widgets.map((w) => w.y + w.h));
    const dx = MARGIN - minX, dy = MARGIN - minY;
    if (dx || dy) {
      // The area's origin returns to 0,0; fit sets the scroll itself, so skip the origin compensation.
      origin.current = { left: 0, top: 0 };
      commit(layout.widgets.map((w) => ({ ...w, x: w.x + dx, y: w.y + dy })));
    }
    cv.fit(0, 0, maxX + dx + MARGIN, maxY + dy + MARGIN);
  };
  const panCursor = cv.panning ? "grabbing" : cv.spaceHeld ? "grab" : undefined;
  const sel = showing ? undefined : layout.widgets.find((w) => w.uid === selected);

  const status = live
    ? session.phase === "starting" ? "Starting…" : "Running · stop the program to edit"
    : preview ? "Preview · nothing is sent to the hub"
    : connected ? "Edit mode · run a program to use the controller" : "Edit mode · connect a hub to run";

  const startPreview = () => {
    const values: Record<string, RemoteValue> = {};
    for (const w of layout.widgets) for (const s of widgetSymbols(w, file.name)) if (s.role === "control") values[s.name] = initialValue(s, w);
    setSelected(null);
    setPreviewValues(values);
  };

  const paletteGroup = (id: string, title: string, kinds: WidgetKind[]) => (
    <PaletteGroup key={id} title={title} kinds={kinds} label={(k) => KIND_LABEL[k]} hint={(k) => `${KIND_HINT[k]} — drag onto the canvas or click to add`}
      chipProps={(k) => paletteDrag.chipProps(k, addAtFreeSpot)} icon={(k) => { const I = KIND_ICON[k]; return <I size={14} />; }}
      folded={paletteFolds.isFolded(id)} onToggle={() => paletteFolds.toggle(id)} />
  );

  const tools: ToolNodes = {
    properties: showing ? null : sel ? (
      <RemoteProperties
        key={sel.uid} w={sel} fileName={file.name} folds={propFolds}
        others={allSymbols.filter((s) => !(s.uid === sel.uid && s.file === file.name))}
        onChange={(patch) => update(sel.uid, patch, true)}
        onDelete={() => remove(sel.uid)}
      />
    ) : (
      <LayoutProperties layout={layout} fileName={file.name} conflicts={layout.widgets.filter(hasConflict).length} />
    ),
    palette: (
      <PalettePanel ref={paletteRef}>
        {live ? (
          <PaletteHint>Controls are live while the program runs. <b>Stop</b> the program to edit.</PaletteHint>
        ) : preview ? (
          <PaletteHint>Preview: the controls react, but nothing is sent. Indicators show sample values.</PaletteHint>
        ) : (
          PALETTE_CATEGORIES.map((c) => paletteGroup(c.id, c.title, c.kinds))
        )}
      </PalettePanel>
    ),
  };

  return (
    <div ref={rootRef} style={{ display: "flex", flexDirection: "column", height: "100%", color: p.text, fontSize: 13 }}>
      {/* Compacts when narrow: 1 hides the status text (still the icon's tooltip), 2 the mode labels, 3 the zoom % and icon. */}
      <Toolbar maxCompact={3}>{(c) => <>
        {tp.has("left") && <PanelToggle open={tp.isOpen("left")} onToggle={() => tp.toggle("left")} title={tp.toggleTitle("left")} icon={<PanelLeft size={15} />} />}
        {c < 3 && <span title={status} style={{ display: "flex" }}><Gamepad2 size={15} color={p.accent} /></span>}
        <ModeToggle
          iconOnly={c >= 2}
          value={live ? null : preview ? "preview" : "edit"}
          disabled={live}
          onChange={(m) => (m === "edit" ? setPreviewValues(null) : startPreview())}
          options={[
            { value: "edit", label: "Edit", title: live ? "A program is running: stop it to edit" : "Edit mode", icon: <Pencil size={13} /> },
            { value: "preview", label: "Preview", title: "Preview: try the controller without a hub; nothing is sent", icon: <Eye size={13} /> },
          ]}
        />
        <UndoRedoButtons history={history} />
        {c < 1 && <span style={{ color: live ? p.okText : p.dimText, fontSize: 12 }}>{status}</span>}
        <ZoomControls
          percent={zoom * 100}
          canZoomOut={zoom > MIN_ZOOM} canZoomIn={zoom < MAX_ZOOM}
          onZoomOut={() => cv.zoomTo(zoom / ZOOM_STEP)} onZoomIn={() => cv.zoomTo(zoom * ZOOM_STEP)} onReset={() => cv.zoomTo(1)}
          resetTitle="Reset zoom to 100% (Ctrl 0)"
          onFit={fitAll} fitTitle="Fit: move the widgets to the top-left and zoom to show them all" hidePercent={c >= 3}
        />
        {tp.has("right") && <PanelToggle open={tp.isOpen("right")} onToggle={() => tp.toggle("right")} title={tp.toggleTitle("right")} icon={<PanelRight size={15} />} />}
      </>}</Toolbar>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <ToolColumns tp={tp} side="left" nodes={tools} emptyHint="Properties can be edited in edit mode." />

        <div style={{ flex: 1, minWidth: 0, position: "relative", display: "flex" }}>
          <RemoteCanvas
            canvasRef={canvasRef}
            canvasProps={{ onKeyDown, ...cv.handlers, onPointerDown: () => setSelected(null) }}
            showing={showing} bounds={bounds} zoom={zoom} panCursor={panCursor} empty={shown.length === 0 && !newDrag?.moved}
          >
            {shown.map((w) => (
              <RemoteWidgetCard
                key={w.uid} w={w} showing={showing} selected={!showing && w.uid === selected} conflict={!showing && hasConflict(w)}
                dragging={drag?.uid === w.uid} panCursor={panCursor}
                overTrash={drag?.uid === w.uid && drag.mode === "move" && bin.over}
                heat={drag?.uid === w.uid && drag.mode === "move" ? bin.heat : 0}
                live={preview || (live && session.phase === "running")}
                values={preview ? (previewValues ?? {}) : session.values}
                indicatorValue={roleOf(w.kind) !== "indicator" ? undefined : preview ? previewIndicatorValue(w) : messageByName(session.messages, w.name)?.value}
                onChange={(name, value, merge) => {
                  if (preview) setPreviewValues((v) => (v ? { ...v, [name]: value } : v));
                  else setControl(name, value, merge);
                }}
                onBeginDrag={beginDrag} onDragMove={onDragMove} onDragEnd={endDrag}
              />
            ))}
          </RemoteCanvas>
          {!showing && <TrashTarget trashRef={trash.ref} over={trash.over} active={drag?.mode === "move" || !!newDrag?.moved} />}
        </div>

        {newDrag?.moved && template && <RemoteWidgetGhost w={template} x={newDrag.x} y={newDrag.y} zoom={zoom} overTrash={trash.over} heat={newHeat} />}
        {/* A widget dragged out of the canvas (towards the toolbox) keeps following the pointer. */}
        {drag?.mode === "move" && (() => {
          const g = bin.outsideGhost();
          return g && <RemoteWidgetGhost w={drag.cur} x={g.x} y={g.y} zoom={zoom} overTrash={trash.over} heat={bin.heat} />;
        })()}
        {Math.max(bin.heat, newHeat) > 0 && <ToolboxBin rect={paletteRef.current?.getBoundingClientRect()} heat={Math.max(bin.heat, newHeat)} putBack={newHeat > 0} />}

        <ToolColumns tp={tp} side="right" nodes={tools} emptyHint="Properties can be edited in edit mode." />
      </div>
    </div>
  );
}
