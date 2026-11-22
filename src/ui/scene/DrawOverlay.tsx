// Draw tool layer over the scene screen: the selected tool draws a new shape
// (line / polyline / pen stroke → line widget, rectangle, circle, arc stroke).
// Coordinates are LCD pixels relative to the screen's top-left corner.

import { useEffect, useRef, useState } from "react";
import { SCREEN_H, SCREEN_W, defaultsFor } from "../../scene/model";
import { simplifyPoints } from "../../scene/geometry";
import { usePalette } from "../theme";
import { openContextMenu } from "../components/menuStore";
import { MARGIN, type DrawTool } from "./constants";
import { arcPath } from "./lvStyle";

type Pt = [number, number];

/** A finished drawing, in screen coordinates. */
export type DrawResult =
  | { kind: "line"; points: Pt[]; closed?: boolean }
  | { kind: "rect" | "ellipse" | "arcline"; x: number; y: number; w: number; h: number };

/** Drags shorter than this (LCD px) count as a click: a default-size shape. */
const CLICK = 3;

function snap45(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(dx, dy);
  return [Math.round(a[0] + Math.cos(ang) * len), Math.round(a[1] + Math.sin(ang) * len)];
}

function boxOf(a: Pt, b: Pt, square: boolean): { x: number; y: number; w: number; h: number } {
  let w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
  if (square) w = h = Math.max(w, h);
  return { x: b[0] < a[0] ? a[0] - w : a[0], y: b[1] < a[1] ? a[1] - h : a[1], w: Math.max(1, w), h: Math.max(1, h) };
}

const sameAsLast = (pts: Pt[], p: Pt) => pts.length > 0 && pts[pts.length - 1][0] === p[0] && pts[pts.length - 1][1] === p[1];

export function DrawOverlay({ tool, scale, onCommit, onCancel }: {
  tool: DrawTool;
  scale: number;
  onCommit: (r: DrawResult) => void;
  /** Esc with nothing in progress: leave the tool. */
  onCancel: () => void;
}) {
  const p = usePalette();
  const ref = useRef<HTMLDivElement>(null);
  /** Polyline / pen points so far. */
  const [pts, setPts] = useState<Pt[]>([]);
  /** Drag start (line / box tools). */
  const [start, setStart] = useState<Pt | null>(null);
  const [cur, setCur] = useState<Pt | null>(null);
  const [shift, setShift] = useState(false);
  const [penDown, setPenDown] = useState(false);

  // Latest values for the window key handler.
  const live = useRef({ pts, onCommit, onCancel });
  live.current = { pts, onCommit, onCancel };

  /** End the polyline (closed: joined back to the first point; needs 3 points). */
  const finishPolyline = (list: Pt[], closed = false) => {
    const clean = list.filter((q, i) => i === 0 || !sameAsLast(list.slice(0, i), q));
    setPts([]);
    if (clean.length >= 2) live.current.onCommit({ kind: "line", points: clean, ...(closed && clean.length >= 3 ? { closed: true } : {}) });
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input,select,textarea")) return;
      const { pts: cur } = live.current;
      if (e.key === "Escape") {
        e.preventDefault();
        if (cur.length) setPts([]); else live.current.onCancel();
      } else if (e.key === "Enter" && tool === "polyline" && cur.length) {
        e.preventDefault();
        finishPolyline(cur);
      } else if (e.key === "Backspace" && tool === "polyline" && cur.length) {
        e.preventDefault();
        setPts(cur.slice(0, -1));
      }
      setShift(e.shiftKey);
    };
    const up = (e: KeyboardEvent) => setShift(e.shiftKey);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("keyup", up); };
    // finishPolyline only uses setters and onCommit (read through `live`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // A new tool starts fresh.
  const [shownTool, setShownTool] = useState(tool);
  if (shownTool !== tool) { setShownTool(tool); setPts([]); setStart(null); setCur(null); }

  const at = (e: React.PointerEvent, exact = false): Pt => {
    const r = ref.current!.getBoundingClientRect();
    const x = (e.clientX - r.left) / scale - MARGIN, y = (e.clientY - r.top) / scale - MARGIN;
    return exact ? [x, y] : [Math.round(x), Math.round(y)];
  };

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setShift(e.shiftKey);
    const q = at(e);
    if (tool === "polyline") {
      // Clicking the first point again closes the loop.
      if (pts.length >= 3 && Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]) <= 3 / scale * 3) { finishPolyline(pts, true); return; }
      const last = pts[pts.length - 1];
      const next = last && e.shiftKey ? snap45(last, q) : q;
      if (!sameAsLast(pts, next)) setPts([...pts, next]);
    } else if (tool === "pen") {
      setPts([at(e, true)]);
      setPenDown(true);
    } else {
      setStart(q);
    }
    setCur(q);
  };

  const move = (e: React.PointerEvent) => {
    setShift(e.shiftKey);
    const q = at(e);
    setCur(q);
    if (tool === "pen" && penDown) {
      const f = at(e, true), last = pts[pts.length - 1];
      if (!last || Math.hypot(f[0] - last[0], f[1] - last[1]) >= 0.5) setPts([...pts, f]);
    }
  };

  const up = (e: React.PointerEvent) => {
    if (tool === "pen" && penDown) {
      setPenDown(false);
      const simple = simplifyPoints(pts, 0.8);
      setPts([]);
      if (simple.length >= 2) onCommit({ kind: "line", points: simple });
      return;
    }
    if (!start) return;
    const end = at(e);
    setStart(null);
    const click = Math.hypot(end[0] - start[0], end[1] - start[1]) < CLICK;
    if (tool === "line") {
      onCommit({ kind: "line", points: [start, click ? [start[0] + 40, start[1]] : e.shiftKey ? snap45(start, end) : end] });
    } else if (tool === "rect" || tool === "ellipse" || tool === "arcline") {
      const d = defaultsFor(tool);
      onCommit({ kind: tool, ...(click ? { x: start[0], y: start[1], w: d.w ?? 32, h: d.h ?? 32 } : boxOf(start, end, e.shiftKey)) });
    }
  };

  // ── In-progress shape ──
  const stroke = p.accent;
  const sw = 2;
  let shape: React.ReactNode = null;
  if (tool === "polyline" && pts.length) {
    const last = pts[pts.length - 1];
    const tail = cur ? (shift ? snap45(last, cur) : cur) : last;
    shape = (
      <>
        <polyline points={[...pts, tail].map((q) => q.join(",")).join(" ")} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={3 / scale * 2} fill={stroke} />)}
      </>
    );
  } else if (tool === "pen" && pts.length) {
    shape = <polyline points={pts.map((q) => q.join(",")).join(" ")} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />;
  } else if (start && cur) {
    if (tool === "line") {
      const end = shift ? snap45(start, cur) : cur;
      shape = <line x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />;
    } else {
      const b = boxOf(start, cur, shift);
      const guide = <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke={stroke} strokeWidth={1 / scale} strokeDasharray={`${4 / scale} ${3 / scale}`} />;
      if (tool === "rect") shape = <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={`${stroke}55`} stroke={stroke} strokeWidth={1 / scale} />;
      else if (tool === "ellipse") {
        const r = Math.min(b.w, b.h) / 2;
        shape = <>{guide}<rect x={b.x} y={b.y} width={b.w} height={b.h} rx={r} ry={r} fill={`${stroke}55`} stroke={stroke} strokeWidth={1 / scale} /></>;
      } else {
        const r = Math.max(0, Math.min(b.w, b.h) / 2 - 1.5);
        shape = <>{guide}<path d={arcPath(b.x + b.w / 2, b.y + b.h / 2, r, 180, 360)} fill="none" stroke={stroke} strokeWidth={3} strokeLinecap="round" /></>;
      }
    }
  }

  const W = SCREEN_W + MARGIN * 2, H = SCREEN_H + MARGIN * 2;
  return (
    <div ref={ref}
      onPointerDown={down} onPointerMove={move} onPointerUp={up}
      onPointerCancel={() => { setStart(null); setPenDown(false); if (tool === "pen") setPts([]); }}
      onDoubleClick={(e) => { e.stopPropagation(); if (tool === "polyline") finishPolyline(pts); }}
      // Right-click ends a polyline (no context menu while drawing).
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (tool !== "polyline" || !pts.length) return;
        const list = pts;
        openContextMenu(e, [
          { label: "Finish", hint: "Enter", onSelect: () => finishPolyline(list) },
          list.length >= 3 && { label: "Close loop", hint: "click start", onSelect: () => finishPolyline(list, true) },
          "separator",
          { label: "Undo last point", hint: "Backspace", onSelect: () => setPts(list.slice(0, -1)) },
          { label: "Cancel", hint: "Esc", onSelect: () => setPts([]) },
        ]);
      }}
      style={{ position: "absolute", left: -MARGIN, top: -MARGIN, width: W, height: H, cursor: "crosshair", touchAction: "none", zIndex: 10 }}>
      <svg width={W} height={H} viewBox={`${-MARGIN} ${-MARGIN} ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
        {shape}
      </svg>
    </div>
  );
}
