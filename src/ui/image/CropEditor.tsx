// Crop mode of the image view: the full original with a crop rectangle to
// draw, move and resize. Applying re-renders the project PNG from the original.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CropRect, ImageSource } from "../../project/format";
import { useAssetUrl } from "../hooks/useAssetUrl";
import { usePalette } from "../theme";

type Handle = "nw" | "ne" | "sw" | "se";
type Drag =
  | { kind: "new"; x0: number; y0: number }
  | { kind: "move"; px: number; py: number; orig: CropRect }
  | { kind: Handle; orig: CropRect };

const PAD = 24;

export function CropEditor({ source, crop, onChange }: {
  source: ImageSource;
  crop: CropRect;
  onChange: (c: CropRect) => void;
}) {
  const p = usePalette();
  const url = useAssetUrl({ hash: source.hash, type: source.type, size: source.size });
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Display scale: fit the whole original (small images up to 8×, drawn sharp).
  const ds = view.w && view.h ? Math.min(8, (view.w - PAD * 2) / source.width, (view.h - PAD * 2) / source.height) : 0;
  const W = source.width, H = source.height;

  const at = (e: React.PointerEvent): [number, number] => {
    const r = imgRef.current!.getBoundingClientRect();
    return [Math.min(W, Math.max(0, Math.round((e.clientX - r.left) / ds))), Math.min(H, Math.max(0, Math.round((e.clientY - r.top) / ds)))];
  };

  const begin = (e: React.PointerEvent, d: Drag) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    imgRef.current?.setPointerCapture(e.pointerId);
    setDrag(d);
  };

  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const [x, y] = at(e);
    if (drag.kind === "new") {
      const c = { x: Math.min(x, drag.x0), y: Math.min(y, drag.y0), w: Math.abs(x - drag.x0), h: Math.abs(y - drag.y0) };
      if (e.shiftKey) c.w = c.h = Math.min(Math.max(c.w, c.h), x < drag.x0 ? drag.x0 : W - drag.x0, y < drag.y0 ? drag.y0 : H - drag.y0);
      if (x < drag.x0) c.x = drag.x0 - c.w;
      if (y < drag.y0) c.y = drag.y0 - c.h;
      if (c.w >= 1 && c.h >= 1) onChange(c);
    } else if (drag.kind === "move") {
      const o = drag.orig;
      onChange({ ...o, x: Math.min(W - o.w, Math.max(0, o.x + x - drag.px)), y: Math.min(H - o.h, Math.max(0, o.y + y - drag.py)) });
    } else {
      const o = drag.orig;
      // The corner opposite the handle stays put.
      const fx = drag.kind.includes("w") ? o.x + o.w : o.x, fy = drag.kind.includes("n") ? o.y + o.h : o.y;
      const c = { x: Math.min(x, fx), y: Math.min(y, fy), w: Math.max(1, Math.abs(x - fx)), h: Math.max(1, Math.abs(y - fy)) };
      onChange(c);
    }
  };

  // Esc while dragging restores the rectangle from before the drag.
  useEffect(() => {
    if (!drag || drag.kind === "new") return;
    const orig = drag.orig;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { onChange(orig); setDrag(null); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [drag, onChange]);

  const hs = 10;
  const handle = (h: Handle, cx: number, cy: number) => (
    <span key={h} onPointerDown={(e) => begin(e, { kind: h, orig: crop })}
      style={{ position: "absolute", left: cx - hs / 2, top: cy - hs / 2, width: hs, height: hs, background: p.accent, border: "1.5px solid #fff", boxSizing: "border-box", cursor: h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize" }} />
  );
  const whole = crop.x === 0 && crop.y === 0 && crop.w === W && crop.h === H;
  const r = { left: crop.x * ds, top: crop.y * ds, width: crop.w * ds, height: crop.h * ds };

  return (
    <div ref={boxRef} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", userSelect: "none" }}>
      {url && ds > 0 && (
        <div ref={imgRef}
          onPointerDown={(e) => { const [x, y] = at(e); begin(e, { kind: "new", x0: x, y0: y }); }}
          onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}
          style={{ position: "relative", width: W * ds, height: H * ds, cursor: "crosshair", touchAction: "none", overflow: "hidden" }}>
          <img src={url} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%", imageRendering: ds >= 2 ? "pixelated" : "auto", pointerEvents: "none" }} />
          <div onPointerDown={(e) => {
            const [x, y] = at(e);
            // Covering the whole image, a drag draws a new rectangle; otherwise it moves this one.
            begin(e, whole ? { kind: "new", x0: x, y0: y } : { kind: "move", px: x, py: y, orig: crop });
          }}
            style={{ position: "absolute", ...r, outline: `1.5px solid ${p.accent}`, boxShadow: "0 0 0 100000px rgba(0,0,0,.55)", cursor: whole ? "crosshair" : "move" }}>
            {handle("nw", 0, 0)}
            {handle("ne", r.width, 0)}
            {handle("sw", 0, r.height)}
            {handle("se", r.width, r.height)}
          </div>
        </div>
      )}
      {url === null && <div style={{ color: p.dimText }}>The original image isn't stored in this browser.</div>}
    </div>
  );
}
