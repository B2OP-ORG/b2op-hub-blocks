// Pan and zoom for the remote controller canvas (a scrollable element whose
// content is scaled by `zoom`). Panning moves the scroll position only, so it
// stays within the content. The plain wheel does nothing (no wheel scrolling).
// Inputs:
//   pan:  middle-drag, Space + left-drag, two-finger touch drag, scrollbars
//   zoom: Ctrl/⌘ + wheel (also trackpad pinch), two-finger pinch,
//         Ctrl + / Ctrl − / Ctrl 0 (see onKeyDown), and the zoomTo / fit helpers.
// The zoom level is remembered per browser under `storageKey`.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;
/** Toolbar / keyboard zoom step (multiplicative). */
export const ZOOM_STEP = 1.2;
/** A two-finger gesture zooms only once the finger distance changed this much (so plain pans don't drift). */
const PINCH_LOCK = 0.08;

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 1000) / 1000));

function loadZoom(key: string): number {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? clampZoom(n) : 1;
  } catch {
    return 1;
  }
}

/**
 * Keep the content point `lx, ly` (unscaled units from the content's top-left)
 * at viewport offset `vx, vy` after the next zoom render.
 */
type Anchor = { lx: number; ly: number; vx: number; vy: number };

type Touch = { x: number; y: number; onControl: boolean };
type Pan =
  | { kind: "mouse"; pointer: number; x: number; y: number }
  | { kind: "touch"; dist0: number; zoom0: number; lx: number; ly: number; pinching: boolean };

export function useCanvasView(opts: {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  storageKey: string;
  /** Whether a touch on this element is using a live control (two-finger pan / pinch must not start then). */
  isControl: (target: HTMLElement) => boolean;
  /** Called when a pan / pinch takes over the pointers (e.g. cancel a widget drag). */
  onPanStart?: () => void;
}) {
  const { canvasRef, storageKey } = opts;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [zoom, setZoomState] = useState(() => loadZoom(storageKey));
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => { setZoomState(loadZoom(storageKey)); }, [storageKey]);
  useEffect(() => {
    try { localStorage.setItem(storageKey, String(zoom)); } catch { /* storage unavailable: zoom just isn't remembered */ }
  }, [storageKey, zoom]);

  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const pan = useRef<Pan | null>(null);
  const touches = useRef(new Map<number, Touch>());
  const hover = useRef(false);
  const pending = useRef<Anchor | null>(null);
  /** The zoom the content is currently drawn at (set after each zoom render). */
  const shownZoom = useRef(zoom);

  // After a zoom change has re-rendered the content at its new size, scroll so
  // the anchor point stays put.
  useLayoutEffect(() => {
    shownZoom.current = zoom;
    const a = pending.current, el = canvasRef.current;
    pending.current = null;
    if (!a || !el) return;
    el.scrollLeft = a.lx * zoom - a.vx;
    el.scrollTop = a.ly * zoom - a.vy;
  }, [zoom, canvasRef]);

  /** Set zoom `z` keeping the content point under viewport offset (vx, vy) — or (vx, vy) of `anchor` — in place. */
  const view = useCallback((z: number, anchor: Anchor) => {
    const el = canvasRef.current;
    const nz = clampZoom(z);
    zoomRef.current = nz;
    // Always set (overrides a queued different zoom). If the content is already
    // drawn at this zoom React won't re-render, so scroll now.
    setZoomState(nz);
    if (nz === shownZoom.current) {
      pending.current = null;
      if (el) { el.scrollLeft = anchor.lx * nz - anchor.vx; el.scrollTop = anchor.ly * nz - anchor.vy; }
    } else {
      pending.current = anchor;
    }
  }, [canvasRef]);

  /** Anchor at a client point (default: the canvas centre). */
  const anchorAt = useCallback((clientX?: number, clientY?: number): Anchor | null => {
    const el = canvasRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const vx = (clientX ?? r.left + r.width / 2) - r.left;
    const vy = (clientY ?? r.top + r.height / 2) - r.top;
    const z = zoomRef.current;
    return { lx: (el.scrollLeft + vx) / z, ly: (el.scrollTop + vy) / z, vx, vy };
  }, [canvasRef]);

  const zoomTo = useCallback((z: number, clientX?: number, clientY?: number) => {
    const a = anchorAt(clientX, clientY);
    if (a) view(z, a);
  }, [anchorAt, view]);

  /** Zoom so the content box (x, y, w × h, unscaled content units) fits the canvas, and scroll to its top-left. */
  const fit = useCallback((x: number, y: number, w: number, h: number) => {
    const el = canvasRef.current;
    if (!el || w <= 0 || h <= 0) { zoomTo(1); return; }
    // Rounded down, so the box never ends up a fraction too big for the view.
    const z = Math.floor(Math.min(MAX_ZOOM, el.clientWidth / w, el.clientHeight / h) * 1000) / 1000;
    view(z, { lx: x, ly: y, vx: 0, vy: 0 });
  }, [canvasRef, view, zoomTo]);

  // The wheel only zooms: Ctrl/⌘ + wheel (trackpad pinch arrives as ctrl + wheel).
  // Plain and Shift + wheel are swallowed — the canvas moves only by panning or
  // its scrollbars. Native listener: React's wheel is passive.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!e.ctrlKey && !e.metaKey) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomTo(zoomRef.current * Math.exp(-Math.max(-50, Math.min(50, dy)) * 0.004), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  // Space held over the canvas (not typing / using a control) turns left-drag into pan.
  useEffect(() => {
    // Space keeps its normal job in text fields and on the canvas's own controls
    // (a run-mode button); anywhere else, while over the canvas, it means pan.
    const busy = (t: EventTarget | null) =>
      t instanceof HTMLElement && (
        !!t.closest("input,textarea,select,[contenteditable]") ||
        (!!canvasRef.current?.contains(t) && !!t.closest("button,[role=slider],[role=switch]")));
    let held = false;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !hover.current || busy(e.target)) return;
      e.preventDefault(); // no page scroll, no click on a focused toolbar button
      held = true;
      if (!e.repeat) setSpaceHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (held) e.preventDefault();
      held = false;
      setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [canvasRef]);

  const endPan = () => { pan.current = null; setPanning(false); };

  const twoTouches = () => {
    const [a, b] = [...touches.current.values()];
    return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  };

  // Capture-phase handlers on the canvas: they see pointers before the widgets do.
  const handlers = {
    onPointerEnter: () => { hover.current = true; },
    onPointerLeave: () => { hover.current = false; },
    onMouseDownCapture: (e: React.MouseEvent) => { if (e.button === 1) e.preventDefault(); /* no browser autoscroll */ },
    onAuxClick: (e: React.MouseEvent) => { if (e.button === 1) e.preventDefault(); },
    onPointerDownCapture: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch") {
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY, onControl: optsRef.current.isControl(e.target as HTMLElement) });
        if (pan.current) { e.stopPropagation(); return; }
        if (touches.current.size === 2 && ![...touches.current.values()].some((t) => t.onControl)) {
          e.stopPropagation();
          const { mx, my, dist } = twoTouches();
          const a = anchorAt(mx, my);
          if (!a) return;
          pan.current = { kind: "touch", dist0: dist, zoom0: zoomRef.current, lx: a.lx, ly: a.ly, pinching: false };
          setPanning(true);
          optsRef.current.onPanStart?.();
        }
        return;
      }
      if (e.button === 1 || (e.button === 0 && spaceHeld)) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        pan.current = { kind: "mouse", pointer: e.pointerId, x: e.clientX, y: e.clientY };
        setPanning(true);
        optsRef.current.onPanStart?.();
      }
    },
    onPointerMoveCapture: (e: React.PointerEvent<HTMLDivElement>) => {
      const p = pan.current, el = canvasRef.current;
      if (e.pointerType === "touch") {
        const t = touches.current.get(e.pointerId);
        if (t) { t.x = e.clientX; t.y = e.clientY; }
        if (p?.kind !== "touch" || touches.current.size < 2 || !el) return;
        e.stopPropagation();
        const { mx, my, dist } = twoTouches();
        const ratio = dist / p.dist0;
        if (!p.pinching && Math.abs(ratio - 1) > PINCH_LOCK) p.pinching = true;
        const r = el.getBoundingClientRect();
        view(p.pinching ? p.zoom0 * ratio : p.zoom0, { lx: p.lx, ly: p.ly, vx: mx - r.left, vy: my - r.top });
        return;
      }
      if (p?.kind === "mouse" && p.pointer === e.pointerId && el) {
        e.stopPropagation();
        el.scrollLeft -= e.clientX - p.x;
        el.scrollTop -= e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;
      }
    },
    onPointerUpCapture: (e: React.PointerEvent) => release(e),
    onPointerCancelCapture: (e: React.PointerEvent) => release(e),
  };

  function release(e: React.PointerEvent) {
    const p = pan.current;
    if (e.pointerType === "touch") {
      touches.current.delete(e.pointerId);
      if (p?.kind === "touch") {
        e.stopPropagation();
        if (touches.current.size < 2) endPan();
      }
      return;
    }
    if (p?.kind === "mouse" && p.pointer === e.pointerId) { e.stopPropagation(); endPan(); }
  }

  /** Ctrl/⌘ + = / − / 0 on the canvas. Returns true when handled. */
  const onKeyDown = (e: React.KeyboardEvent): boolean => {
    if (!e.ctrlKey && !e.metaKey) return false;
    if (e.key === "+" || e.key === "=") zoomTo(zoomRef.current * ZOOM_STEP);
    else if (e.key === "-") zoomTo(zoomRef.current / ZOOM_STEP);
    else if (e.key === "0") zoomTo(1);
    else return false;
    e.preventDefault();
    return true;
  };

  return { zoom, zoomRef, panning, spaceHeld, handlers, zoomTo, fit, onKeyDown };
}
