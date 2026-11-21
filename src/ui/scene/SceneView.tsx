// Scene editor: lay out LVGL widgets on the hub's 160x128 screen. The scene
// is stored in the header line of its `.py` file; every edit regenerates the
// Python below it (scene/codegen.ts), so the file is always a ready-to-import
// module.
//
// Modes: Edit (drag / resize / properties) and Preview, where the arrow keys
// and Enter act like the hub buttons (focus order, edit mode, events) on a
// local copy of the scene. Pan / zoom: see ../remote/canvasView.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Maximize2, Monitor, Pencil, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useApp } from "../../state/store";
import type { ProjectFile } from "../../project/format";
import { usePalette, type Palette } from "../theme";
import { buttonStyle } from "../Dialog";
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, useCanvasView } from "../remote/canvasView";
import {
  CHECK_KINDS, DISPLAY_KINDS, EVENT_KINDS, FONT_SIZES, INPUT_KINDS, ITEM_KINDS, KIND_LABEL, LONG_MODES, SCREEN_H, SCREEN_W, SYMBOLS,
  TEXT_KINDS, absolutePos, clampedPos, drawnSize, isOutside, childrenOf, contentOffset, creationOrder, emptyScene, eventArgs, isContainer, makeWidget,
  moduleOfPath, nameProblem, splitSceneHeader, subtree, withSceneHeader,
  type FontSize, type LongMode, type SceneDoc, type SceneKind, type SceneWidget, type TextAlign,
} from "../../scene/model";
import { sceneToPython } from "../../scene/codegen";
import { SceneWidgetBody } from "./widgets";

/** A widget being dragged in from the palette (client coordinates). */
type NewDrag = { kind: SceneKind; startX: number; startY: number; x: number; y: number; moved: boolean };
/** CSS px per LCD px at 100% zoom. */
const BASE = 3;
/** LCD px of canvas around the screen. */
const MARGIN = 16;

type Drag = {
  uid: string; mode: "move" | "resize";
  startX: number; startY: number;
  scrollX: number; scrollY: number;
  orig: SceneWidget; cur: SceneWidget;
};

const KIND_HINT: Record<SceneKind, string> = {
  label: "text", panel: "coloured box / container", line: "line through points", bar: "progress bar",
  arc: "round gauge", led: "on / off light", spinner: "busy indicator", image: "PNG from the SD card",
  qrcode: "QR code of a text", chart: "line or bar chart", scale: "ruler with numbers", table: "grid of text",
  textarea: "multi-line text box", button: "press with center", list: "menu: up/down picks, center selects",
  roller: "option wheel", dropdown: "drop-down option list", slider: "adjustable value", checkbox: "tick box with text",
  switch: "on / off toggle", scrollbox: "container you scroll with up/down", tabview: "tabs holding other widgets",
};

// ── Focus preview (what the hub buttons do) ──────────────────────────────────

type Stop = { uid: string; item?: number };

function focusStops(doc: SceneDoc): Stop[] {
  const out: Stop[] = [];
  const hiddenSet = new Set<string>();
  for (const w of doc.widgets) if (w.hidden) for (const u of subtree(doc, w.uid)) hiddenSet.add(u);
  for (const w of creationOrder(doc)) {
    if (hiddenSet.has(w.uid)) continue;
    // Widgets on inactive tabs can't take focus.
    const parent = w.parent ? doc.widgets.find((o) => o.uid === w.parent) : undefined;
    if (parent?.kind === "tabview" && (w.tab ?? 0) !== (parent.value ?? 0)) continue;
    if (w.kind === "list") (w.items ?? []).forEach((_, i) => out.push({ uid: w.uid, item: i }));
    else if (w.kind === "tabview") (w.items ?? ["Tab"]).forEach((_, i) => out.push({ uid: w.uid, item: i }));
    else if (["button", "roller", "dropdown", "slider", "checkbox", "switch", "scrollbox"].includes(w.kind)) out.push({ uid: w.uid });
  }
  return out;
}

const EDITABLE: SceneKind[] = ["roller", "dropdown", "slider", "scrollbox"];

export function SceneView({ file }: { file: ProjectFile }) {
  const p = usePalette();
  const module = moduleOfPath(file.name);
  const parsed = useMemo(() => splitSceneHeader(file.content), [file.content]);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // Preview: local copy of the scene, the focus stop, edit mode and the last event.
  const [preview, setPreview] = useState<{ doc: SceneDoc; focus: number; editing: boolean; log: string } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  /** The LCD screen element: drop positions are measured from it. */
  const screenRef = useRef<HTMLDivElement>(null);
  const trashRef = useRef<HTMLDivElement>(null);
  const [overTrash, setOverTrash] = useState(false);
  const overTrashRef = useRef(false);
  const setTrash = (v: boolean) => { overTrashRef.current = v; setOverTrash(v); };
  const hitTrash = (x: number, y: number) => {
    const r = trashRef.current?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  // Palette drag: pointer events on the window (the chip stays put), the
  // widget itself follows the pointer. The drop handler is refreshed every
  // render (it needs the current scene), the listeners only per drag.
  const [newDrag, setNewDragState] = useState<NewDrag | null>(null);
  const newDragRef = useRef<NewDrag | null>(null);
  const setNewDrag = (d: NewDrag | null) => { newDragRef.current = d; setNewDragState(d); };
  const dropNewRef = useRef<(d: NewDrag) => void>(() => {});
  const dragging = newDrag !== null;
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const d = newDragRef.current;
      if (!d) return;
      const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4;
      setNewDrag({ ...d, x: e.clientX, y: e.clientY, moved });
      setTrash(moved && hitTrash(e.clientX, e.clientY));
    };
    const up = () => {
      const d = newDragRef.current;
      setNewDrag(null);
      if (d) dropNewRef.current(d);
      setTrash(false);
    };
    const cancel = () => { setNewDrag(null); setTrash(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") cancel(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [dragging]);
  const projectId = useApp((s) => s.mfp.id);
  const cv = useCanvasView({
    canvasRef,
    storageKey: `b2op.sceneZoom.${projectId}.${file.id}`,
    isControl: () => false,
    onPanStart: () => setDrag(null),
  });
  const { zoom } = cv;
  const scale = zoom * BASE;

  // Keep the generated Python in step (e.g. after a codegen update or a renamed file).
  const doc0 = parsed.doc;
  useEffect(() => {
    if (!doc0) return;
    const want = withSceneHeader(doc0, sceneToPython(doc0, module));
    if (want !== file.content) useApp.getState().updateFile(file.id, want);
  }, [doc0, module, file.id, file.content]);

  if (!parsed.doc) {
    return (
      <div style={{ padding: 24, color: p.text, fontSize: 13 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Can't open {file.name}</div>
        <div style={{ color: p.danger, marginBottom: 12 }}>{parsed.error}</div>
        <button type="button" style={buttonStyle(p, "danger")}
          onClick={() => { const d = emptyScene(); useApp.getState().updateFile(file.id, withSceneHeader(d, sceneToPython(d, module))); }}>
          Replace with an empty scene
        </button>
      </div>
    );
  }
  const doc = parsed.doc;
  const shownDoc = preview?.doc ?? doc;

  const commitDoc = (next: SceneDoc) => useApp.getState().updateFile(file.id, withSceneHeader(next, sceneToPython(next, module)));
  const commit = (widgets: SceneWidget[]) => commitDoc({ ...doc, widgets });
  const update = (uid: string, patch: Partial<SceneWidget>) =>
    commit(doc.widgets.map((w) => {
      if (w.uid !== uid) return w;
      const n = { ...w, ...patch };
      for (const k of Object.keys(patch) as (keyof SceneWidget)[]) if (patch[k] === undefined) delete n[k];
      return n;
    }));
  const remove = (uid: string) => {
    const gone = subtree(doc, uid);
    commit(doc.widgets.filter((w) => !gone.has(w.uid)));
    setSelected(null);
  };
  const add = (kind: SceneKind, x: number, y: number, parent?: string, tab?: number) => {
    const w = makeWidget(kind, x, y, doc, parent, tab);
    // Always land (as far as it fits) inside the parent / screen.
    Object.assign(w, clampedPos(doc, w));
    commit([...doc.widgets, w]);
    setSelected(w.uid);
  };
  /** Deepest container whose content area contains the screen point (x, y). */
  const containerAt = (x: number, y: number): { parent?: string; tab?: number; x: number; y: number } => {
    let best: { parent?: string; tab?: number; x: number; y: number; depth: number } = { x, y, depth: -1 };
    for (const w of doc.widgets) {
      if (!isContainer(w.kind)) continue;
      const a = absolutePos(doc, w), off = contentOffset(w);
      const cx = a.x + off.x, cy = a.y + off.y;
      if (x < cx || y < cy || x > a.x + w.w || y > a.y + w.h) continue;
      let depth = 0;
      for (let q = w; q.parent; depth++) q = doc.widgets.find((o) => o.uid === q.parent) ?? ({} as SceneWidget);
      if (depth > best.depth) best = { parent: w.uid, tab: w.kind === "tabview" ? w.value ?? 0 : undefined, x: x - cx, y: y - cy, depth };
    }
    return best;
  };
  /** Add a widget whose top-left is (offX, offY) up-left of screen point (px, py), in the container under that point. */
  const addAt = (kind: SceneKind, px: number, py: number, offX = 0, offY = 0) => {
    const c = containerAt(px, py);
    add(kind, Math.round(c.x - offX), Math.round(c.y - offY), c.parent, c.tab);
  };
  const addDefault = (kind: SceneKind) => {
    const sel = doc.widgets.find((w) => w.uid === selected);
    const parent = sel && isContainer(sel.kind) ? sel : undefined;
    const tab = parent?.kind === "tabview" ? parent.value ?? 0 : undefined;
    // Below the lowest sibling when it still fits, else cascade from the top-left.
    const sibs = childrenOf(doc, parent?.uid, tab);
    const bottom = sibs.reduce((m, w) => Math.max(m, w.y + drawnSize(w).h), 0);
    const h = (parent ? parent.h - contentOffset(parent).y : SCREEN_H);
    const fits = bottom + 4 + (makeWidget(kind, 0, 0, doc).h || 0) <= h;
    const n = sibs.length;
    add(kind, fits ? 4 : 4 + (n % 8) * 6, fits ? (sibs.length ? bottom + 4 : 4) : 4 + (n % 8) * 6, parent?.uid, tab);
  };
  const moveZ = (uid: string, dir: -1 | 1) => {
    const w = doc.widgets.find((x) => x.uid === uid);
    if (!w) return;
    const sibs = doc.widgets.filter((x) => x.parent === w.parent);
    const i = sibs.indexOf(w), j = i + dir;
    if (j < 0 || j >= sibs.length) return;
    const other = sibs[j];
    const list = [...doc.widgets];
    const a = list.indexOf(w), b = list.indexOf(other);
    [list[a], list[b]] = [list[b], list[a]];
    commit(list);
  };

  // ── Palette drag (new widget) ───────────────────────────────────────────────
  /** The widget a palette drag would add (for the ghost and the drop maths). */
  const template = newDrag ? makeWidget(newDrag.kind, 0, 0, doc) : null;
  dropNewRef.current = (d) => {
    if (!d.moved) { addDefault(d.kind); return; } // a click
    if (overTrashRef.current) return;
    const canvas = canvasRef.current?.getBoundingClientRect(), scr = screenRef.current?.getBoundingClientRect();
    if (!canvas || !scr || d.x < canvas.left || d.x > canvas.right || d.y < canvas.top || d.y > canvas.bottom) return;
    const size = drawnSize(makeWidget(d.kind, 0, 0, doc));
    // The ghost is centred on the pointer: keep that spot under the pointer.
    addAt(d.kind, (d.x - scr.left) / scale, (d.y - scr.top) / scale, size.w / 2, size.h / 2);
  };

  // ── Drag ────────────────────────────────────────────────────────────────────
  const beginDrag = (e: React.PointerEvent, w: SceneWidget, mode: Drag["mode"]) => {
    if (preview || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelected(w.uid);
    const el = canvasRef.current;
    setDrag({ uid: w.uid, mode, startX: e.clientX, startY: e.clientY, scrollX: el?.scrollLeft ?? 0, scrollY: el?.scrollTop ?? 0, orig: w, cur: w });
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const el = canvasRef.current;
    const step = e.shiftKey ? 4 : 1;
    const sn = (v: number) => Math.round(v / step) * step;
    const dx = (e.clientX - drag.startX + (el ? el.scrollLeft - drag.scrollX : 0)) / scale;
    const dy = (e.clientY - drag.startY + (el ? el.scrollTop - drag.scrollY : 0)) / scale;
    const o = drag.orig;
    if (drag.mode === "move") setTrash(hitTrash(e.clientX, e.clientY));
    const cur = drag.mode === "move"
      ? { ...o, x: sn(o.x + dx), y: sn(o.y + dy) }
      : o.kind === "qrcode"
        ? { ...o, w: Math.max(8, sn(Math.min(o.w, o.h) + Math.max(dx, dy))), h: Math.max(8, sn(Math.min(o.w, o.h) + Math.max(dx, dy))) }
        : { ...o, w: Math.max(4, sn(o.w + dx)), h: Math.max(4, sn(o.h + dy)) };
    setDrag({ ...drag, cur });
  };
  const endDrag = () => {
    if (!drag) return;
    const { cur, orig } = drag;
    setDrag(null);
    if (drag.mode === "move" && overTrashRef.current) { setTrash(false); remove(orig.uid); return; }
    if (cur.x !== orig.x || cur.y !== orig.y || cur.w !== orig.w || cur.h !== orig.h) update(cur.uid, { x: cur.x, y: cur.y, w: cur.w, h: cur.h });
  };

  // ── Preview (hub buttons on the keyboard) ───────────────────────────────────
  const stops = preview ? focusStops(preview.doc) : [];
  const stop = preview ? stops[preview.focus] : undefined;
  const startPreview = () => {
    setSelected(null);
    setPreview({ doc: structuredClone(doc), focus: 0, editing: false, log: "↑ ↓ move focus · Enter = center · ← / Esc leaves edit mode" });
    canvasRef.current?.focus();
  };
  const previewKey = (key: "up" | "down" | "enter" | "left") => {
    if (!preview) return;
    const pd = preview.doc;
    const st = stops[preview.focus];
    const w = st ? pd.widgets.find((x) => x.uid === st.uid) : undefined;
    const set = (patch: Partial<SceneWidget>, log?: string, extra: Partial<typeof preview> = {}) =>
      setPreview({ ...preview, ...extra, doc: w ? { ...pd, widgets: pd.widgets.map((x) => (x.uid === w.uid ? { ...x, ...patch } : x)) } : pd, log: log ?? preview.log });
    const ev = (args: string) => `${module}.on("${w?.name}") → cb(${args})`;
    if (key === "left") { if (preview.editing) setPreview({ ...preview, editing: false, log: "left: leave edit mode" }); return; }
    if (preview.editing && w) {
      const d = key === "up" ? -1 : key === "down" ? 1 : 0;
      if (key === "enter") { setPreview({ ...preview, editing: false, log: w.kind === "roller" || w.kind === "dropdown" ? ev(`${w.value ?? 0}, "${w.items?.[w.value ?? 0] ?? ""}"`) : "leave edit mode" }); return; }
      if (w.kind === "roller" || w.kind === "dropdown") {
        const v = Math.min(Math.max(0, (w.value ?? 0) + d), Math.max(0, (w.items?.length ?? 1) - 1));
        set({ value: v }, ev(`${v}, "${w.items?.[v] ?? ""}"`));
      } else if (w.kind === "slider") {
        const step = Math.max(1, Math.round(((w.max ?? 100) - (w.min ?? 0)) / 20));
        const v = Math.min(w.max ?? 100, Math.max(w.min ?? 0, (w.value ?? 0) + d * step));
        set({ value: v }, ev(String(v)));
      }
      return;
    }
    if (key === "up" || key === "down") {
      if (!stops.length) return;
      const n = (preview.focus + (key === "down" ? 1 : -1) + stops.length) % stops.length;
      setPreview({ ...preview, focus: n });
      return;
    }
    if (!w || !st) return;
    if (EDITABLE.includes(w.kind)) { setPreview({ ...preview, editing: true, log: `${w.name}: edit mode (↑ ↓ change, Enter / ← done)` }); return; }
    switch (w.kind) {
      case "button": setPreview({ ...preview, log: ev("") }); break;
      case "checkbox": case "switch": set({ checked: !w.checked }, ev(w.checked ? "False" : "True")); break;
      case "list": setPreview({ ...preview, log: ev(`${st.item}, "${w.items?.[st.item ?? 0] ?? ""}"`) }); break;
      case "tabview": set({ value: st.item }, ev(`${st.item}, "${w.items?.[st.item ?? 0] ?? ""}"`)); break;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (cv.onKeyDown(e)) return;
    if ((e.target as HTMLElement).closest("input,select,textarea")) return;
    if (preview) {
      const map: Record<string, "up" | "down" | "enter" | "left"> = { ArrowUp: "up", ArrowDown: "down", Enter: "enter", " ": "enter", ArrowRight: "enter", ArrowLeft: "left", Escape: "left" };
      const k = map[e.key];
      if (k) { e.preventDefault(); previewKey(k); }
      return;
    }
    const w = doc.widgets.find((x) => x.uid === selected);
    if (!w) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(w.uid); return; }
    const step = e.shiftKey ? 8 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (m) { e.preventDefault(); update(w.uid, { x: w.x + m[0], y: w.y + m[1] }); }
  };

  const fitAll = () => cv.fit(0, 0, (SCREEN_W + MARGIN * 2) * BASE, (SCREEN_H + MARGIN * 2) * BASE);
  const panCursor = cv.panning ? "grabbing" : cv.spaceHeld ? "grab" : undefined;
  const sel = preview ? undefined : doc.widgets.find((w) => w.uid === selected);
  const selPath = sel ? subtree(doc, sel.uid) : new Set<string>();
  // Which tab of each tab view to draw: the one holding the selection, else its value.
  const tabShown = (tv: SceneWidget): number => {
    if (!preview && sel) {
      let q: SceneWidget | undefined = sel;
      while (q?.parent) {
        if (q.parent === tv.uid) return q.tab ?? 0;
        q = doc.widgets.find((o) => o.uid === q!.parent);
      }
    }
    return tv.value ?? 0;
  };

  const renderLevel = (parent: string | undefined, tab?: number): React.ReactNode =>
    childrenOf(shownDoc, parent, tab).map((w0) => {
      const w = drag?.uid === w0.uid ? drag.cur : w0;
      if (preview && w.hidden) return null;
      const size = drawnSize(w);
      const isSel = !preview && w.uid === selected;
      const focused = !!stop && stop.uid === w.uid;
      const off = contentOffset(w);
      const outside = !preview && isOutside(shownDoc, w);
      return (
        <div key={w.uid}
          onPointerDown={(e) => beginDrag(e, w0, "move")}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            position: "absolute", left: w.x, top: w.y, width: size.w, height: size.h,
            outline: isSel ? `${1 / scale * 2}px solid ${p.accent}` : undefined, outlineOffset: 1 / scale,
            opacity: drag?.uid === w.uid && overTrash ? 0.3 : outside ? 0.4 : !preview && w.hidden ? 0.45 : 1,
            ...(outside && !isSel ? { outline: `${2 / scale}px dashed ${p.danger}` } : {}),
            cursor: panCursor ?? (preview ? "default" : drag?.uid === w.uid ? "grabbing" : "grab"),
            touchAction: "none", userSelect: "none",
          }}>
          <SceneWidgetBody w={w} focused={focused} focusItem={focused ? stop?.item : undefined} editing={focused && preview?.editing} />
          {isContainer(w.kind) && (
            <div style={{ position: "absolute", left: off.x, top: off.y, width: w.w - off.x, height: w.h - off.y, overflow: "hidden" }}>
              {renderLevel(w.uid, w.kind === "tabview" ? tabShown(w) : undefined)}
            </div>
          )}
          {isSel && w.kind !== "line" && (
            <span onPointerDown={(e) => beginDrag(e, w0, "resize")} title="Resize (Shift: 4 px steps)"
              style={{ position: "absolute", right: -6 / scale * 2, bottom: -6 / scale * 2, width: 10 / scale * 2, height: 10 / scale * 2, borderRadius: 2 / scale, background: p.accent, cursor: "nwse-resize" }} />
          )}
        </div>
      );
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", color: p.text, fontSize: 13 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: `1px solid ${p.border}`, background: p.panelBg, flexWrap: "wrap" }}>
        <Monitor size={16} color={p.accent} />
        <span style={{ fontWeight: 600 }}>{file.name}</span>
        <code style={{ fontSize: 11, color: p.dimText }}>import {module}</code>
        <div style={{ display: "inline-flex", border: `1px solid ${p.border}`, borderRadius: 6, overflow: "hidden" }}>
          <ModeButton p={p} active={!preview} onClick={() => setPreview(null)} icon={<Pencil size={13} />} label="Edit" title="Edit the scene" />
          <ModeButton p={p} active={!!preview} onClick={startPreview} icon={<Eye size={13} />} label="Preview"
            title="Try the hub buttons: ↑ ↓ = up / down, Enter = center, ← = left" />
        </div>
        <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 2 }}>
          <IconButton p={p} title="Zoom out (Ctrl −)" onClick={() => cv.zoomTo(zoom / ZOOM_STEP)} disabled={zoom <= MIN_ZOOM}><ZoomOut size={14} /></IconButton>
          <button type="button" title="Reset zoom (Ctrl 0)" onClick={() => cv.zoomTo(1)}
            style={{ minWidth: 48, padding: "3px 4px", border: "none", background: "transparent", color: p.text, fontSize: 12, fontVariantNumeric: "tabular-nums", cursor: "pointer", borderRadius: 4 }}>
            {Math.round(scale * 100)}%
          </button>
          <IconButton p={p} title="Zoom in (Ctrl +)" onClick={() => cv.zoomTo(zoom * ZOOM_STEP)} disabled={zoom >= MAX_ZOOM}><ZoomIn size={14} /></IconButton>
          <IconButton p={p} title="Fit the screen into view" onClick={fitAll}><Maximize2 size={14} /></IconButton>
        </div>
      </div>

      {/* Palette */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", minHeight: 40, boxSizing: "border-box", borderBottom: `1px solid ${p.border}`, background: p.panelAltBg, flexWrap: "wrap" }}>
        {preview ? (
          <span style={{ fontSize: 12, color: p.dimText }}>{preview.log}</span>
        ) : (
          <>
            <PaletteGroup p={p} title="Display" kinds={DISPLAY_KINDS} onAdd={addDefault} onStart={(kind, x, y) => setNewDrag({ kind, startX: x, startY: y, x, y, moved: false })} />
            <span style={{ width: 1, alignSelf: "stretch", background: p.border, margin: "0 4px" }} />
            <PaletteGroup p={p} title="Buttons" kinds={INPUT_KINDS} onAdd={addDefault} onStart={(kind, x, y) => setNewDrag({ kind, startX: x, startY: y, x, y, moved: false })} />
          </>
        )}
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Outline */}
        <Outline p={p} doc={doc} selected={preview ? null : selected} onSelect={(u) => { setPreview(null); setSelected(u); }} onMove={moveZ} />

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex" }}>
          {/* Canvas */}
          <div
            ref={canvasRef}
            tabIndex={0}
            onKeyDown={onKeyDown}
            {...cv.handlers}
            onPointerDown={() => { if (!preview) setSelected(null); }}
            className="remote-canvas"
            style={{
              flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", position: "relative", outline: "none",
              background: p.panelAltBg, touchAction: "none", cursor: panCursor,
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
                <div ref={screenRef} style={{ position: "absolute", left: MARGIN, top: MARGIN, width: SCREEN_W, height: SCREEN_H, background: shownDoc.bg, overflow: preview ? "hidden" : "visible" }}>
                  {renderLevel(undefined)}
                </div>
                {!preview && doc.widgets.length === 0 && !newDrag?.moved && (
                  <div style={{ position: "absolute", left: MARGIN + 8, top: MARGIN + 40, width: SCREEN_W - 16, color: "#9ca3af", fontSize: 7, lineHeight: 1.4, textAlign: "center", pointerEvents: "none" }}>
                    Drag widgets here from the bar above (or click one). Drop one on the bin to delete it.
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Trash: drop a widget here to delete it (or to cancel a palette drag). */}
          {!preview && (
            <div ref={trashRef} title="Drag a widget here to delete it"
              style={{
                position: "absolute", right: 14, bottom: 14, width: 52, height: 52, borderRadius: 12, pointerEvents: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `2px ${overTrash ? "solid" : "dashed"} ${overTrash ? p.danger : p.border}`,
                background: overTrash ? p.dangerBg : "transparent",
                color: overTrash ? p.danger : p.dimText,
                opacity: overTrash ? 1 : drag?.mode === "move" || newDrag?.moved ? 0.9 : 0.45,
                transform: overTrash ? "scale(1.15)" : "none", transition: "transform .12s, opacity .12s",
              }}>
              <Trash2 size={24} />
            </div>
          )}
          </div>
        </div>

        {/* Palette drag: the real widget follows the pointer, at the canvas scale. */}
        {newDrag?.moved && template && (() => {
          const s = drawnSize(template);
          return (
            <div style={{
              position: "fixed", left: newDrag.x - (s.w * scale) / 2, top: newDrag.y - (s.h * scale) / 2, width: s.w, height: s.h,
              transformOrigin: "0 0", transform: `scale(${scale})`, pointerEvents: "none", zIndex: 1000,
              opacity: overTrash ? 0.3 : 0.85, filter: "drop-shadow(0 2px 4px rgba(0,0,0,.4))",
            }}>
              <SceneWidgetBody w={template} />
            </div>
          );
        })()}

        {/* Properties */}
        {!preview && (sel
          ? <Properties key={sel.uid} p={p} doc={doc} w={sel} module={module} selPath={selPath}
              onChange={(patch) => update(sel.uid, patch)} onDelete={() => remove(sel.uid)} />
          : <SceneProperties p={p} doc={doc} module={module} onChange={(patch) => commitDoc({ ...doc, ...patch })} />)}
      </div>
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function ModeButton({ p, active, onClick, icon, label, title }: { p: Palette; active: boolean; onClick: () => void; icon: React.ReactNode; label: string; title: string }) {
  return (
    <button type="button" disabled={active} onClick={onClick} title={title} aria-pressed={active}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", fontSize: 12, fontWeight: 600,
        border: "none", borderRadius: 0,
        background: active ? p.accent : "transparent", color: active ? p.accentText : p.text,
        cursor: active ? "default" : "pointer",
      }}>
      {icon}{label}
    </button>
  );
}

function IconButton({ p, title, onClick, disabled, children }: { p: Palette; title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 24, padding: 0, border: "none", borderRadius: 4,
        background: "transparent", color: p.text, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1 }}>
      {children}
    </button>
  );
}

function PaletteGroup({ p, title, kinds, onAdd, onStart }: {
  p: Palette; title: string; kinds: SceneKind[]; onAdd: (k: SceneKind) => void;
  /** Pointer pressed on a chip: start a drag (a release without moving counts as a click). */
  onStart: (k: SceneKind, clientX: number, clientY: number) => void;
}) {
  return (
    <>
      <span style={{ fontSize: 11, color: p.dimText, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</span>
      {kinds.map((k) => (
        <button key={k} type="button" title={`${KIND_HINT[k]} — drag onto the screen or click to add`}
          onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); onStart(k, e.clientX, e.clientY); }}
          // Keyboard activation only (detail 0): pointer clicks are handled by the drag.
          onClick={(e) => { if (e.detail === 0) onAdd(k); }}
          style={{ touchAction: "none", userSelect: "none", padding: "3px 10px", borderRadius: 12, border: `1px solid ${p.border}`, background: p.surface, color: p.text, fontSize: 12, cursor: "grab" }}>
          {KIND_LABEL[k]}
        </button>
      ))}
    </>
  );
}

function Outline({ p, doc, selected, onSelect, onMove }: { p: Palette; doc: SceneDoc; selected: string | null; onSelect: (uid: string | null) => void; onMove: (uid: string, dir: -1 | 1) => void }) {
  const rows: React.ReactNode[] = [];
  const visit = (parent: string | undefined, depth: number) => {
    for (const w of doc.widgets.filter((x) => x.parent === parent)) {
      const isSel = w.uid === selected;
      const off = isOutside(doc, w);
      rows.push(
        <div key={w.uid} onClick={() => onSelect(w.uid)}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: `2px 6px 2px ${6 + depth * 12}px`, cursor: "pointer",
            background: isSel ? p.activeBg : undefined, opacity: w.hidden ? 0.6 : 1 }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {w.name}
            {off && <span style={{ color: p.danger, fontSize: 11 }} title="Outside its parent / the screen: it won't be visible"> off screen</span>}
            <span style={{ color: p.dimText, fontSize: 11 }}> {KIND_LABEL[w.kind]}{w.tab !== undefined && doc.widgets.find((o) => o.uid === w.parent)?.kind === "tabview" ? ` · tab ${w.tab + 1}` : ""}</span>
          </span>
          {isSel && (
            <>
              <IconButton p={p} title="Move back (drawn earlier, earlier in focus order)" onClick={() => onMove(w.uid, -1)}><ArrowUp size={12} /></IconButton>
              <IconButton p={p} title="Move forward (drawn later, later in focus order)" onClick={() => onMove(w.uid, 1)}><ArrowDown size={12} /></IconButton>
            </>
          )}
        </div>,
      );
      if (isContainer(w.kind)) visit(w.uid, depth + 1);
    }
  };
  visit(undefined, 0);
  return (
    <div style={{ width: 190, flexShrink: 0, borderRight: `1px solid ${p.border}`, background: p.panelBg, overflowY: "auto", fontSize: 12 }}>
      <div onClick={() => onSelect(null)} style={{ padding: "6px 8px", fontWeight: 600, cursor: "pointer", background: selected === null ? p.activeBg : undefined }}>Scene</div>
      {rows.length ? rows : <div style={{ padding: "4px 8px", color: p.dimText }}>No widgets yet.</div>}
    </div>
  );
}

// ── Properties ───────────────────────────────────────────────────────────────

const panelStyle = (p: Palette): React.CSSProperties => ({
  width: 260, flexShrink: 0, borderLeft: `1px solid ${p.border}`, background: p.panelBg, padding: 12, overflowY: "auto",
  display: "flex", flexDirection: "column", gap: 10,
});

function SceneProperties({ p, doc, module, onChange }: { p: Palette; doc: SceneDoc; module: string; onChange: (patch: Partial<SceneDoc>) => void }) {
  const events = doc.widgets.filter((w) => EVENT_KINDS.includes(w.kind));
  const nested = module.includes(".");
  return (
    <div style={panelStyle(p)}>
      <div style={{ fontWeight: 600 }}>Scene <span style={{ color: p.dimText, fontWeight: 400 }}>· {module}</span></div>
      <ColorField p={p} label="Background" value={doc.bg} onChange={(v) => onChange({ bg: v ?? "#000000" })} required />
      <Usage p={p} code={[`import ${module}`, `${module}.show()`, ...(events[0] ? [`${module}.on("${events[0].name}", my_function)`] : [])].join("\n")} />
      {nested && <div style={{ color: p.warnText, fontSize: 12 }}>This scene is in a folder. If <code>import {module}</code> fails on the hub, move it to the project's top level.</div>}
      <div style={{ fontSize: 12, color: p.dimText, lineHeight: 1.5 }}>
        Keep calling <code>lv.timer_handler()</code> (loops in blocks do it for you) so the screen updates and button events arrive.
        On the hub: ↑ ↓ move the focus, center presses / starts editing, left stops editing.
      </div>
    </div>
  );
}

function usageFor(w: SceneWidget, module: string): string {
  const v = `${module}.${w.name}`;
  const ev = EVENT_KINDS.includes(w.kind) ? [`${module}.on("${w.name}", lambda ${eventArgs(w.kind).join(", ")}: ...)`] : [];
  switch (w.kind) {
    case "label": case "checkbox": case "textarea": return [`${v}.set_text("Hello")`, ...ev].join("\n");
    case "button": return [`${v}_label.set_text("Go")`, ...ev].join("\n");
    case "bar": case "slider": return [`${v}.set_value(42, False)`, `${v}.get_value()`, ...ev].join("\n");
    case "arc": return `${v}.set_value(42)`;
    case "qrcode": return `${module}.set_qr("${w.name}", "https://example.com")`;
    case "led": return `${v}.on()\n${v}.off()`;
    case "list": case "roller": case "dropdown": return [`${module}.set_items("${w.name}", ["A", "B"])`, `${module}.selected_text("${w.name}")`, ...ev].join("\n");
    case "chart": return `${v}.set_next_value(${v}_series, 42)`;
    case "tabview": return [`${v}.set_active(1, False)`, ...ev].join("\n");
    case "switch": return [`${v}.add_state(lv.STATE.CHECKED)`, ...ev].join("\n");
    default: return `${v}.add_flag(lv.obj.FLAG.HIDDEN)`;
  }
}

function Properties({ p, doc, w, module, selPath, onChange, onDelete }: {
  p: Palette; doc: SceneDoc; w: SceneWidget; module: string; selPath: Set<string>;
  onChange: (patch: Partial<SceneWidget>) => void; onDelete: () => void;
}) {
  const k = w.kind;
  const containers = doc.widgets.filter((o) => isContainer(o.kind) && !selPath.has(o.uid));
  const parent = doc.widgets.find((o) => o.uid === w.parent);
  const has = (...kinds: SceneKind[]) => kinds.includes(k);
  const colorLabel = has("line") ? "Line colour" : has("led") ? "LED colour" : has("qrcode") ? "Dark colour" : has("bar", "slider", "arc", "spinner", "chart") ? "Indicator colour"
    : has("roller") ? "Selection colour" : has("switch") ? "On colour" : has("tabview") ? "Active tab colour" : "Text colour";
  const textish = has("label", "button", "checkbox", "textarea", "list", "roller", "dropdown", "table", "tabview", "panel", "scrollbox", "scale", "arc");

  return (
    <div style={panelStyle(p)}>
      <div style={{ fontWeight: 600 }}>{KIND_LABEL[k]}</div>
      <TextField p={p} label="Name (Python variable)" value={w.name} validate={(v) => nameProblem(v.trim(), doc, w.uid, k)} onCommit={(v) => onChange({ name: v.trim() })} />
      <div style={{ display: "flex", gap: 8 }}>
        <NumField p={p} label="X" value={w.x} int onCommit={(v) => onChange({ x: v })} />
        <NumField p={p} label="Y" value={w.y} int onCommit={(v) => onChange({ y: v })} />
      </div>
      {k === "qrcode"
        ? <NumField p={p} label={`Max size (drawn ${drawnSize(w).w} px)`} value={Math.min(w.w, w.h)} min={8} int onCommit={(v) => onChange({ w: v, h: v })} />
        : k !== "line" && (
          <div style={{ display: "flex", gap: 8 }}>
            <NumField p={p} label="Width" value={w.w} min={1} int onCommit={(v) => onChange({ w: v })} />
            <NumField p={p} label="Height" value={w.h} min={1} int onCommit={(v) => onChange({ h: v })} />
          </div>
        )}
      <SelectField p={p} label="Inside" value={w.parent ?? ""} options={[["", "Screen"], ...containers.map((c): [string, string] => [c.uid, `${c.name} (${KIND_LABEL[c.kind]})`])]}
        onChange={(v) => onChange({ parent: v || undefined, tab: doc.widgets.find((o) => o.uid === v)?.kind === "tabview" ? 0 : undefined, x: 0, y: 0 })} />
      {parent?.kind === "tabview" && (
        <SelectField p={p} label="Tab" value={String(w.tab ?? 0)} options={(parent.items ?? ["Tab"]).map((t, i): [string, string] => [String(i), t])} onChange={(v) => onChange({ tab: Number(v) })} />
      )}
      {isOutside(doc, w) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: p.danger, fontSize: 12 }}>
          <span style={{ flex: 1 }}>Outside {parent ? parent.name : "the screen"}: it won't be visible.</span>
          <button type="button" style={buttonStyle(p)} onClick={() => onChange(clampedPos(doc, w))}>Move into view</button>
        </div>
      )}
      <Check p={p} label="Hidden at start (show from code)" value={!!w.hidden} onChange={(v) => onChange({ hidden: v || undefined })} />

      {has(...TEXT_KINDS) && (has("label", "textarea")
        ? <AreaField p={p} label="Text" value={w.text ?? ""} onCommit={(v) => onChange({ text: v })} />
        : <TextField p={p} label={k === "qrcode" ? "Data (text / URL)" : "Text"} value={w.text ?? ""} onCommit={(v) => onChange({ text: v })} />)}
      {k === "label" && (
        <SelectField p={p} label="Long text" value={w.longMode ?? "wrap"} options={LONG_MODES.map((m): [string, string] => [m, { wrap: "Wrap lines", dots: "Cut with …", scroll: "Scroll back and forth", circular: "Scroll round", clip: "Cut off" }[m]])}
          onChange={(v) => onChange({ longMode: v === "wrap" ? undefined : v as LongMode })} />
      )}
      {has(...ITEM_KINDS, "tabview") && (
        <ItemsField p={p} label={k === "tabview" ? "Tabs" : "Items"} items={w.items ?? []} icons={k === "list" ? w.icons ?? [] : undefined}
          onChange={(items, icons) => onChange({ items, ...(k === "list" ? { icons } : {}), value: Math.min(w.value ?? 0, Math.max(0, items.length - 1)) })} />
      )}
      {has("roller", "dropdown", "tabview") && (
        <SelectField p={p} label={k === "tabview" ? "Active tab" : "Selected"} value={String(w.value ?? 0)}
          options={(w.items?.length ? w.items : ["Tab"]).map((t, i): [string, string] => [String(i), t])} onChange={(v) => onChange({ value: Number(v) })} />
      )}
      {has("bar", "slider", "arc", "scale", "chart") && (
        <div style={{ display: "flex", gap: 8 }}>
          <NumField p={p} label="Min" value={w.min ?? 0} int onCommit={(v) => onChange({ min: v })} />
          <NumField p={p} label="Max" value={w.max ?? 100} int onCommit={(v) => onChange({ max: v })} />
          {has("bar", "slider", "arc") && <NumField p={p} label="Value" value={w.value ?? 0} int onCommit={(v) => onChange({ value: v })} />}
        </div>
      )}
      {has(...CHECK_KINDS) && <Check p={p} label={k === "led" ? "On" : "Checked"} value={!!(k === "led" ? w.checked !== false : w.checked)} onChange={(v) => onChange({ checked: v })} />}
      {k === "line" && (
        <AreaField p={p} label="Points (x, y per line, relative)" value={(w.points ?? []).map(([x, y]) => `${x}, ${y}`).join("\n")}
          onCommit={(v) => onChange({ points: v.split("\n").map((l) => l.split(/[,\s]+/).map(Number)).filter((a) => a.length >= 2 && a.every(Number.isFinite)).map((a) => [Math.round(a[0]), Math.round(a[1])] as [number, number]) })} />
      )}
      {has("line", "arc") && <NumField p={p} label={k === "arc" ? "Arc width" : "Line width"} value={w.width ?? (k === "arc" ? 6 : 2)} min={1} int onCommit={(v) => onChange({ width: v })} />}
      {k === "image" && <TextField p={p} label="PNG file (relative to this file, or /sd/…)" value={w.src ?? ""} onCommit={(v) => onChange({ src: v.trim() })} />}
      {k === "chart" && (
        <>
          <SelectField p={p} label="Type" value={w.chartType ?? "line"} options={[["line", "Line"], ["bar", "Bars"]]} onChange={(v) => onChange({ chartType: v as "line" | "bar" })} />
          <TextField p={p} label="Start values (comma separated)" value={(w.values ?? []).join(", ")}
            onCommit={(v) => onChange({ values: v.split(/[,\s]+/).filter(Boolean).map(Number).filter(Number.isFinite).map(Math.round) })} />
        </>
      )}
      {k === "scale" && (
        <div style={{ display: "flex", gap: 8 }}>
          <NumField p={p} label="Ticks" value={w.ticks ?? 11} min={2} int onCommit={(v) => onChange({ ticks: v })} />
          <NumField p={p} label="Number every" value={w.majorEvery ?? 5} min={1} int onCommit={(v) => onChange({ majorEvery: v })} />
        </div>
      )}
      {k === "table" && (
        <AreaField p={p} label="Cells (one row per line, cells split by |)" value={(w.cells ?? []).map((r) => r.join(" | ")).join("\n")}
          onCommit={(v) => onChange({ cells: v.split("\n").filter((l) => l.trim()).map((l) => l.split("|").map((c) => c.trim())) })} />
      )}
      {k === "tabview" && <NumField p={p} label="Tab bar height" value={w.barSize ?? 20} min={8} int onCommit={(v) => onChange({ barSize: v })} />}

      {k !== "image" && <ColorField p={p} label={colorLabel} value={w.color} onChange={(v) => onChange({ color: v })} />}
      {!has("line", "led", "spinner", "switch", "checkbox") && <ColorField p={p} label={k === "qrcode" ? "Light colour" : "Background"} value={w.bg} onChange={(v) => onChange({ bg: v })} />}
      {!has("line", "led", "spinner", "qrcode", "arc", "scale", "switch", "checkbox") && (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <NumField p={p} label="Border" value={w.border ?? 0} min={0} int onCommit={(v) => onChange({ border: v })} />
            <NumField p={p} label="Corner radius" value={w.radius ?? 0} min={0} int onCommit={(v) => onChange({ radius: v })} />
          </div>
          {(w.border ?? 0) > 0 && <ColorField p={p} label="Border colour" value={w.borderColor} onChange={(v) => onChange({ borderColor: v })} />}
        </>
      )}
      {textish && (
        <div style={{ display: "flex", gap: 8 }}>
          <SelectField p={p} label="Font size" value={String(w.font ?? 14)} options={FONT_SIZES.map((s): [string, string] => [String(s), `${s}`])} onChange={(v) => onChange({ font: Number(v) === 14 ? undefined : Number(v) as FontSize })} />
          {has("label", "textarea", "table") && (
            <SelectField p={p} label="Align" value={w.align ?? "left"} options={[["left", "Left"], ["center", "Center"], ["right", "Right"]]} onChange={(v) => onChange({ align: v === "left" ? undefined : v as TextAlign })} />
          )}
        </div>
      )}

      <Usage p={p} code={usageFor(w, module)} />
      <button type="button" onClick={onDelete} style={{ ...buttonStyle(p, "danger"), display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
        <Trash2 size={13} /> Delete{isContainer(k) && doc.widgets.some((o) => o.parent === w.uid) ? " (with contents)" : ""}
      </button>
    </div>
  );
}

function Usage({ p, code }: { p: Palette; code: string }) {
  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ color: p.dimText, marginBottom: 3 }}>In Python</div>
      <pre style={{ margin: 0, padding: 8, borderRadius: 6, background: p.inputBg, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{code}</pre>
    </div>
  );
}

const fieldStyle = (p: Palette, bad = false): React.CSSProperties => ({
  width: "100%", boxSizing: "border-box", padding: "4px 7px", borderRadius: 5, fontSize: 13,
  border: `1px solid ${bad ? p.danger : p.border}`, background: p.inputBg, color: p.text,
});

function TextField({ p, label, value, validate, onCommit }: { p: Palette; label: string; value: string; validate?: (v: string) => string | null; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const error = validate && draft !== value ? validate(draft) : null;
  const commit = () => { if (draft !== value && !error) onCommit(draft); };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
      {label}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setDraft(value); }} style={fieldStyle(p, !!error)} />
      {error && <span style={{ color: p.danger }}>{error}</span>}
    </label>
  );
}

function AreaField({ p, label, value, onCommit }: { p: Palette; label: string; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
      {label}
      <textarea value={draft} rows={3} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft !== value) onCommit(draft); }}
        style={{ ...fieldStyle(p), resize: "vertical", fontFamily: "inherit" }} />
    </label>
  );
}

function NumField({ p, label, value, min, max, int, onCommit }: { p: Palette; label: string; value: number; min?: number; max?: number; int?: boolean; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    let n = Number(draft);
    if (!Number.isFinite(n) || draft.trim() === "") { setDraft(String(value)); return; }
    if (int) n = Math.round(n);
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    setDraft(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, flex: 1, minWidth: 0 }}>
      {label}
      <input inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} style={fieldStyle(p)} />
    </label>
  );
}

function SelectField({ p, label, value, options, onChange }: { p: Palette; label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, flex: 1, minWidth: 0 }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={fieldStyle(p)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Check({ p, label, value, onChange }: { p: Palette; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: p.text }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function ColorField({ p, label, value, onChange, required }: { p: Palette; label: string; value: string | undefined; onChange: (v: string | undefined) => void; required?: boolean }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span style={{ flex: 1 }}>{label}</span>
      {value !== undefined ? (
        <>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 44, height: 24, border: "none", padding: 0, background: "transparent" }} />
          {!required && <button type="button" onClick={(e) => { e.preventDefault(); onChange(undefined); }} title="Use the theme default"
            style={{ border: `1px solid ${p.border}`, background: "transparent", color: p.dimText, borderRadius: 4, fontSize: 11, padding: "1px 6px", cursor: "pointer" }}>default</button>}
        </>
      ) : (
        <button type="button" onClick={(e) => { e.preventDefault(); onChange("#ffffff"); }}
          style={{ border: `1px solid ${p.border}`, background: "transparent", color: p.text, borderRadius: 4, fontSize: 11, padding: "2px 8px", cursor: "pointer" }}>theme default · set</button>
      )}
    </label>
  );
}

function ItemsField({ p, label, items, icons, onChange }: { p: Palette; label: string; items: string[]; icons?: string[]; onChange: (items: string[], icons: string[]) => void }) {
  const ic = icons ?? [];
  const set = (i: number, text: string | null, icon?: string) => {
    const nItems = [...items], nIcons = items.map((_, j) => ic[j] ?? "");
    if (text === null) { nItems.splice(i, 1); nIcons.splice(i, 1); }
    else { nItems[i] = text; if (icon !== undefined) nIcons[i] = icon; }
    onChange(nItems, nIcons);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
      {label}
      {items.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 4 }}>
          {icons && (
            <select value={ic[i] ?? ""} onChange={(e) => set(i, t, e.target.value)} title="Icon" style={{ ...fieldStyle(p), width: 74, flexShrink: 0, padding: "4px 2px" }}>
              {SYMBOLS.map((s) => <option key={s} value={s}>{s ? s.toLowerCase() : "—"}</option>)}
            </select>
          )}
          <ItemInput p={p} value={t} onCommit={(v) => set(i, v)} />
          <button type="button" title="Remove" onClick={() => set(i, null)} style={{ border: "none", background: "transparent", color: p.dimText, cursor: "pointer", padding: "0 4px" }}>×</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, `Item ${items.length + 1}`], [...items.map((_, j) => ic[j] ?? ""), ""])}
        style={{ alignSelf: "flex-start", border: `1px solid ${p.border}`, background: "transparent", color: p.text, borderRadius: 4, fontSize: 11, padding: "2px 8px", cursor: "pointer" }}>+ Add</button>
    </div>
  );
}

function ItemInput({ p, value, onCommit }: { p: Palette; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft !== value) onCommit(draft); }}
    onKeyDown={(e) => { if (e.key === "Enter" && draft !== value) onCommit(draft); }} style={{ ...fieldStyle(p), flex: 1, minWidth: 0 }} />;
}
