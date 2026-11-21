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
// sticks out, so it scrolls only when something is outside. Pan / zoom: see
// canvasView.ts.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Eye, Gamepad2, Maximize2, Pencil, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useApp } from "../../state/store";
import type { ProjectFile } from "../../project/format";
import type { RemoteValue } from "../../device/protocol";
import { usePalette, type Palette } from "../theme";
import { buttonStyle } from "../Dialog";
import { WidgetBody } from "./widgets";
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, useCanvasView } from "./canvasView";
import { KIND_HINT } from "./actions";
import {
  CONTROL_KINDS, GRID, INDICATOR_KINDS, KIND_LABEL, emptyLayout, initialValue, isAttrName, previewIndicatorValue, joystickNames, makeWidget, nameProblem,
  parseLayout, projectSymbols, roleOf, serializeLayout, snap, symbolConflicts, widgetSymbols,
  type RemoteLayout, type RemoteSymbol, type ValueType, type Widget, type WidgetKind,
} from "../../remote/layout";
import { messageByName, setControl, useRemoteSession } from "../../remote/session";

const DND_TYPE = "application/x-b2op-remote-widget";
const MIN_W = 64;
const MIN_H = 48;

/** Widgets this close to the home view's right / bottom edge still count as inside (border, shadow, resize handle). */
const MARGIN = GRID * 2;
/** Room added past a widget that sticks out of the home view, so a second drag can take it further. */
const EXTRA = GRID * 30;

type Drag = {
  uid: string; mode: "move" | "resize";
  startX: number; startY: number;
  /** Canvas scroll at drag start (a wheel scroll mid-drag moves the widget along). */
  scrollX: number; scrollY: number;
  orig: Widget; cur: Widget;
};

/** Canvas area in layout units: the home view (0,0 + visible size) grown by EXTRA past any widget that sticks out. */
type Bounds = { left: number; top: number; right: number; bottom: number };

function canvasBounds(widgets: Widget[], viewW: number, viewH: number): Bounds {
  if (widgets.length === 0) return { left: 0, top: 0, right: viewW, bottom: viewH };
  const minX = Math.min(...widgets.map((w) => w.x)), minY = Math.min(...widgets.map((w) => w.y));
  const maxX = Math.max(...widgets.map((w) => w.x + w.w)), maxY = Math.max(...widgets.map((w) => w.y + w.h));
  return {
    left: minX < 0 ? minX - EXTRA : 0,
    top: minY < 0 ? minY - EXTRA : 0,
    right: maxX + MARGIN > viewW ? maxX + EXTRA : viewW,
    bottom: maxY + MARGIN > viewH ? maxY + EXTRA : viewH,
  };
}

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
  const [drag, setDrag] = useState<Drag | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const projectId = useApp((s) => s.mfp.id);
  const cv = useCanvasView({
    canvasRef,
    storageKey: `b2op.remoteZoom.${projectId}.${file.id}`,
    isControl: (t) => showing && !!t.closest("[data-widget-body]"),
    onPanStart: () => setDrag(null),
  });
  const { zoom, zoomRef } = cv;

  // Visible canvas size (layout units come from it: the home view is this size / zoom).
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  const hasLayout = parsed.layout !== null;
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasLayout]);
  // Committed widgets only: the area grows after a drop, not while dragging.
  const bounds = useMemo(
    () => canvasBounds(parsed.layout?.widgets ?? [], viewSize.w / zoom, viewSize.h / zoom),
    [parsed.layout, viewSize, zoom],
  );
  // When the area grows / shrinks on the left or top, scroll by the same amount
  // so nothing on screen moves.
  const origin = useRef({ left: bounds.left, top: bounds.top });
  useLayoutEffect(() => {
    const el = canvasRef.current, o = origin.current;
    origin.current = { left: bounds.left, top: bounds.top };
    if (!el) return;
    // Zoom is read, not a trigger: zoom changes keep their own anchor (canvasView).
    el.scrollLeft += (o.left - bounds.left) * zoomRef.current;
    el.scrollTop += (o.top - bounds.top) * zoomRef.current;
  }, [bounds.left, bounds.top, zoomRef]);

  // Symbols of the whole project (names / ids must be unique across layouts).
  const allSymbols = useMemo(() => projectSymbols(files), [files]);
  const conflicts = useMemo(() => symbolConflicts(allSymbols), [allSymbols]);

  if (!parsed.layout) {
    return (
      <div style={{ padding: 24, color: p.text, fontSize: 13 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Can't open {file.name}</div>
        <div style={{ color: p.danger, marginBottom: 12 }}>{parsed.error}</div>
        <button type="button" style={buttonStyle(p, "danger")}
          onClick={() => useApp.getState().updateFile(file.id, serializeLayout(emptyLayout()))}>
          Replace with an empty layout
        </button>
      </div>
    );
  }
  const layout = parsed.layout;

  const commit = (widgets: Widget[]) => useApp.getState().updateFile(file.id, serializeLayout({ ...layout, widgets }));
  const update = (uid: string, patch: Partial<Widget>) => commit(layout.widgets.map((w) => (w.uid === uid ? { ...w, ...patch } : w)));
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
    widgetSymbols(w, file.name).some((s) => conflicts.names.has(`${s.role}:${s.name}`) || conflicts.ids.has(`${s.role}#${s.id}`));

  // ── Pointer drag (move / resize), committed on release ──────────────────────
  const beginDrag = (e: React.PointerEvent, w: Widget, mode: Drag["mode"]) => {
    if (showing || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelected(w.uid);
    const el = canvasRef.current;
    setDrag({ uid: w.uid, mode, startX: e.clientX, startY: e.clientY, scrollX: el?.scrollLeft ?? 0, scrollY: el?.scrollTop ?? 0, orig: w, cur: w });
  };
  /** Where the dragged widget is for a pointer position (pointer travel + canvas scroll since the start). */
  function dragged(d: Drag, clientX: number, clientY: number): Widget {
    const el = canvasRef.current;
    const dx = (clientX - d.startX + (el ? el.scrollLeft - d.scrollX : 0)) / zoom;
    const dy = (clientY - d.startY + (el ? el.scrollTop - d.scrollY : 0)) / zoom;
    const o = d.orig;
    return d.mode === "move"
      ? { ...o, x: snap(o.x + dx), y: snap(o.y + dy) }
      : { ...o, w: Math.max(MIN_W, snap(o.w + dx)), h: Math.max(MIN_H, snap(o.h + dy)) };
  }
  const onDragMove = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, cur: dragged(drag, e.clientX, e.clientY) });
  };
  const endDrag = () => {
    if (!drag) return;
    const { cur, orig } = drag;
    setDrag(null);
    if (cur.x !== orig.x || cur.y !== orig.y || cur.w !== orig.w || cur.h !== orig.h) {
      update(cur.uid, { x: cur.x, y: cur.y, w: cur.w, h: cur.h });
    }
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
    if (m) { e.preventDefault(); update(w.uid, { x: snap(w.x + m[0]), y: snap(w.y + m[1]) }); }
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", color: p.text, fontSize: 13 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: `1px solid ${p.border}`, background: p.panelBg, flexWrap: "wrap" }}>
        <Gamepad2 size={16} color={p.accent} />
        <span style={{ fontWeight: 600 }}>{file.name}</span>
        <div style={{ display: "inline-flex", border: `1px solid ${p.border}`, borderRadius: 6, overflow: "hidden" }}>
          <ModeButton p={p} active={!showing} disabled={live}
            onClick={() => setPreviewValues(null)}
            icon={<Pencil size={13} />} label="Edit" title={live ? "A program is running: stop it to edit" : "Edit mode"} />
          <ModeButton p={p} active={preview} disabled={live} onClick={startPreview}
            icon={<Eye size={13} />} label="Preview" title="Preview: try the controller without a hub; nothing is sent" />
        </div>
        <span style={{ color: live ? p.okText : p.dimText, fontSize: 12 }}>{status}</span>
        <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 2 }}>
          <IconButton p={p} title="Zoom out (Ctrl −)" onClick={() => cv.zoomTo(zoom / ZOOM_STEP)} disabled={zoom <= MIN_ZOOM}><ZoomOut size={14} /></IconButton>
          <button type="button" title="Reset zoom to 100% (Ctrl 0)" onClick={() => cv.zoomTo(1)}
            style={{ minWidth: 48, padding: "3px 4px", border: "none", background: "transparent", color: p.text, fontSize: 12, fontVariantNumeric: "tabular-nums", cursor: "pointer", borderRadius: 4 }}>
            {Math.round(zoom * 100)}%
          </button>
          <IconButton p={p} title="Zoom in (Ctrl +)" onClick={() => cv.zoomTo(zoom * ZOOM_STEP)} disabled={zoom >= MAX_ZOOM}><ZoomIn size={14} /></IconButton>
          <IconButton p={p} title="Fit: move the widgets to the top-left and zoom to show them all" onClick={fitAll}><Maximize2 size={14} /></IconButton>
        </div>
      </div>

      {/* Palette (edit mode); same bar in run / preview so the canvas doesn't jump */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", minHeight: 40, boxSizing: "border-box", borderBottom: `1px solid ${p.border}`, background: p.panelAltBg, flexWrap: "wrap" }}>
        {live ? (
          <span style={{ fontSize: 12, color: p.dimText }}>
            Controls are live while the program runs, also from other tabs. <b>Stop</b> the program to edit.
          </span>
        ) : preview ? (
          <span style={{ fontSize: 12, color: p.dimText }}>
            Preview: the controls react, but nothing is sent. Indicators show sample values.
          </span>
        ) : (
          <>
            <PaletteGroup p={p} title="Controls" kinds={CONTROL_KINDS} onAdd={addAtFreeSpot} />
            <span style={{ width: 1, alignSelf: "stretch", background: p.border, margin: "0 4px" }} />
            <PaletteGroup p={p} title="Indicators" kinds={INDICATOR_KINDS} onAdd={addAtFreeSpot} />
          </>
        )}
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Canvas */}
        <div
          ref={canvasRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          {...cv.handlers}
          onPointerDown={() => setSelected(null)}
          onDragOver={(e) => { if (!showing && e.dataTransfer.types.includes(DND_TYPE)) e.preventDefault(); }}
          onDrop={(e) => {
            const kind = e.dataTransfer.getData(DND_TYPE) as WidgetKind;
            if (showing || !kind || !canvasRef.current) return;
            e.preventDefault();
            const el = canvasRef.current, r = el.getBoundingClientRect();
            add(kind, (e.clientX - r.left + el.scrollLeft) / zoom + bounds.left - 16, (e.clientY - r.top + el.scrollTop) / zoom + bounds.top - 16);
          }}
          className="remote-canvas"
          style={{
            flex: 1, minWidth: 0, overflow: "auto", position: "relative", outline: "none",
            background: p.panelAltBg, touchAction: "none", cursor: panCursor,
            ["--sb-track" as string]: p.panelAltBg,
            ["--sb-thumb" as string]: `color-mix(in srgb, ${p.accent} 55%, transparent)`,
            ["--sb-thumb-hover" as string]: p.accent,
          }}
        >
          {/* Sized to the scaled area; the stage inside maps layout units (origin bounds.left / top) onto it. */}
          <div style={{
            position: "relative", overflow: "hidden", minWidth: "100%", minHeight: "100%",
            width: (bounds.right - bounds.left) * zoom, height: (bounds.bottom - bounds.top) * zoom,
            backgroundImage: showing ? undefined : `radial-gradient(${p.border} ${Math.max(0.6, zoom)}px, transparent ${Math.max(0.6, zoom)}px)`,
            backgroundSize: `${GRID * 2 * zoom}px ${GRID * 2 * zoom}px`,
            backgroundPosition: `${-bounds.left * zoom}px ${-bounds.top * zoom}px`,
          }}>
          <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `scale(${zoom}) translate(${-bounds.left}px, ${-bounds.top}px)` }}>
            {shown.length === 0 && (
              <div style={{ position: "absolute", left: 24, top: 24, color: p.dimText, maxWidth: 360, lineHeight: 1.5 }}>
                Drag controls and indicators here from the bar above (or click one).
                Programs read controls as <code>remote.&lt;name&gt;</code> and send indicator values with <code>remote.send()</code>.
              </div>
            )}
            {shown.map((w) => {
              const isSel = !showing && w.uid === selected;
              const bad = !showing && hasConflict(w);
              const indicatorValue = roleOf(w.kind) !== "indicator" ? undefined
                : preview ? previewIndicatorValue(w) : messageByName(session.messages, w.name)?.value;
              return (
                <div
                  key={w.uid}
                  onPointerDown={(e) => beginDrag(e, w, "move")}
                  onPointerMove={onDragMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  style={{
                    position: "absolute", left: w.x, top: w.y, width: w.w, height: w.h, boxSizing: "border-box",
                    display: "flex", flexDirection: "column", padding: showing ? "6px 12px 8px" : "6px 10px 8px",
                    background: p.surface, borderRadius: 8,
                    border: `${isSel || bad ? 2 : 1}px solid ${bad ? p.danger : isSel ? p.accent : p.border}`,
                    boxShadow: drag?.uid === w.uid ? p.shadow : "0 1px 2px rgba(0,0,0,.08)",
                    cursor: panCursor ?? (showing ? "default" : drag?.uid === w.uid ? "grabbing" : "grab"),
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
                    <WidgetBody w={w} p={p} live={preview || (live && session.phase === "running")}
                      values={preview ? (previewValues ?? {}) : session.values} value={indicatorValue}
                      onChange={(name, value, merge) => {
                        if (preview) setPreviewValues((v) => (v ? { ...v, [name]: value } : v));
                        else setControl(name, value, merge);
                      }} />
                  </div>
                  {isSel && (
                    <span
                      onPointerDown={(e) => beginDrag(e, w, "resize")}
                      title="Resize"
                      style={{ position: "absolute", right: -5, bottom: -5, width: 12, height: 12, borderRadius: 3, background: p.accent, cursor: "nwse-resize" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          </div>
        </div>

        {/* Properties (edit mode) */}
        {sel && (
          <Properties
            key={sel.uid} p={p} w={sel} fileName={file.name}
            others={allSymbols.filter((s) => s.role === roleOf(sel.kind) && !(s.uid === sel.uid && s.file === file.name))}
            onChange={(patch) => update(sel.uid, patch)}
            onDelete={() => remove(sel.uid)}
          />
        )}
      </div>
    </div>
  );
}

function ModeButton({ p, active, disabled, onClick, icon, label, title }: { p: Palette; active: boolean; disabled: boolean; onClick: () => void; icon: React.ReactNode; label: string; title: string }) {
  return (
    <button type="button" disabled={disabled || active} onClick={onClick} title={title} aria-pressed={active}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", border: "none", fontSize: 12, fontWeight: 600,
        background: active ? p.accent : "transparent", color: active ? p.accentText : p.text,
        cursor: disabled || active ? "default" : "pointer", opacity: disabled && !active ? 0.5 : 1,
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

function PaletteGroup({ p, title, kinds, onAdd }: { p: Palette; title: string; kinds: WidgetKind[]; onAdd: (k: WidgetKind) => void }) {
  return (
    <>
      <span style={{ fontSize: 11, color: p.dimText, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</span>
      {kinds.map((k) => (
        <button
          key={k} type="button" draggable title={`${KIND_HINT[k]} — drag onto the canvas or click to add`}
          onDragStart={(e) => { e.dataTransfer.setData(DND_TYPE, k); e.dataTransfer.effectAllowed = "copy"; }}
          onClick={() => onAdd(k)}
          style={{ padding: "3px 10px", borderRadius: 12, border: `1px solid ${p.border}`, background: p.surface, color: p.text, fontSize: 12, cursor: "grab" }}
        >
          {KIND_LABEL[k]}
        </button>
      ))}
    </>
  );
}

// ── Properties panel ─────────────────────────────────────────────────────────

function Properties({ p, w, fileName, others, onChange, onDelete }: {
  p: Palette;
  w: Widget;
  fileName: string;
  /** Symbols of the other widgets with the same role (whole project). */
  others: RemoteSymbol[];
  onChange: (patch: Partial<Widget>) => void;
  onDelete: () => void;
}) {
  const role = roleOf(w.kind);
  const otherNames = new Set(others.map((s) => s.name));
  const otherIds = new Set(others.map((s) => s.id));
  const names = w.kind === "joystick" ? joystickNames(w.name) : [w.name];
  const nameErr = nameProblem(w.name, w.kind) ?? (names.some((n) => otherNames.has(n)) ? `Another ${role} is called that.` : null);
  const ids = w.kind === "joystick" ? [w.id, w.idY ?? w.id + 1] : [w.id];
  const idErr = ids.some((i) => otherIds.has(i)) ? `Another ${role} uses this id.` : w.kind === "joystick" && ids[0] === ids[1] ? "X and Y need different ids." : null;
  const sym = widgetSymbols(w, fileName)[0];
  const typeConst = sym ? ["remote.INT", "remote.FLOAT", "remote.BOOL", "remote.STR"][sym.type] : "";
  const usage = role === "control"
    ? names.map((n) => (isAttrName(n) ? `remote.${n}` : `remote.get("${n}")`)).join("\n")
    : `remote.create_message(${w.id}, "${w.name}", ${typeConst})\nremote.send(${w.id}, value)`;

  return (
    <div style={{ width: 250, flexShrink: 0, borderLeft: `1px solid ${p.border}`, background: p.panelBg, padding: 12, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 600 }}>{KIND_LABEL[w.kind]} <span style={{ color: p.dimText, fontWeight: 400 }}>· {role}</span></div>
      <TextField p={p} label={w.kind === "joystick" ? "Name (sends name_x, name_y)" : "Name"} value={w.name} error={nameErr} onCommit={(v) => onChange({ name: v.trim() })} />
      <div style={{ display: "flex", gap: 8 }}>
        <NumField p={p} label={w.kind === "joystick" ? "X id" : "Id"} value={w.id} min={0} max={255} int onCommit={(v) => onChange({ id: v })} />
        {w.kind === "joystick" && <NumField p={p} label="Y id" value={w.idY ?? w.id + 1} min={0} max={255} int onCommit={(v) => onChange({ idY: v })} />}
      </div>
      {idErr && <div style={{ color: p.danger, fontSize: 12, marginTop: -6 }}>{idErr}</div>}

      {(w.kind === "slider" || w.kind === "gauge") && (
        <SelectField p={p} label="Type" value={w.valueType ?? "int"} options={[["int", "Whole number (int)"], ["float", "Decimal (float)"]]} onChange={(v) => onChange({ valueType: v as ValueType })} />
      )}
      {w.kind === "display" && (
        <SelectField p={p} label="Type" value={w.valueType ?? "float"} options={[["int", "int"], ["float", "float"], ["bool", "bool"], ["str", "text (str)"]]} onChange={(v) => onChange({ valueType: v as ValueType })} />
      )}
      {(w.kind === "slider" || w.kind === "gauge") && (
        <div style={{ display: "flex", gap: 8 }}>
          <NumField p={p} label="Min" value={w.min ?? 0} int={w.valueType === "int"} onCommit={(v) => onChange({ min: v })} />
          <NumField p={p} label="Max" value={w.max ?? 100} int={w.valueType === "int"} onCommit={(v) => onChange({ max: v })} />
        </div>
      )}
      {w.kind === "slider" && (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <NumField p={p} label="Step" value={w.step ?? 1} min={0} int={w.valueType === "int"} onCommit={(v) => onChange({ step: v || (w.valueType === "int" ? 1 : 0.1) })} />
            <NumField p={p} label="Start" value={w.initial ?? 0} int={w.valueType === "int"} onCommit={(v) => onChange({ initial: v })} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={!!w.springBack} onChange={(e) => onChange({ springBack: e.target.checked })} />
            Return to start when released
          </label>
        </>
      )}
      {w.kind === "joystick" && <NumField p={p} label="Range (±)" value={w.max ?? 100} min={1} int onCommit={(v) => onChange({ max: v })} />}
      {w.kind === "gauge" && (
        <SelectField p={p} label="Style" value={w.style ?? "bar"} options={[["bar", "Bar"], ["dial", "Dial"]]} onChange={(v) => onChange({ style: v as "bar" | "dial" })} />
      )}
      {w.kind === "led" && (
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
          Colour
          <input type="color" value={w.color ?? "#22c55e"} onChange={(e) => onChange({ color: e.target.value })} style={{ width: 60, height: 28, border: "none", background: "transparent" }} />
        </label>
      )}

      <div style={{ fontSize: 12 }}>
        <div style={{ color: p.dimText, marginBottom: 3 }}>In Python</div>
        <pre style={{ margin: 0, padding: 8, borderRadius: 6, background: p.inputBg, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{usage}</pre>
      </div>
      <button type="button" onClick={onDelete} style={{ ...buttonStyle(p, "danger"), display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
        <Trash2 size={13} /> Delete
      </button>
    </div>
  );
}

const fieldStyle = (p: Palette, bad = false): React.CSSProperties => ({
  width: "100%", boxSizing: "border-box", padding: "4px 7px", borderRadius: 5, fontSize: 13,
  border: `1px solid ${bad ? p.danger : p.border}`, background: p.inputBg, color: p.text,
});

function TextField({ p, label, value, error, onCommit }: { p: Palette; label: string; value: string; error: string | null; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { if (draft !== value) onCommit(draft); };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
      {label}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} style={fieldStyle(p, !!error)} />
      {error && <span style={{ color: p.danger }}>{error}</span>}
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
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={fieldStyle(p)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
