import { Trash2 } from "lucide-react";
import { usePalette } from "../theme";

/** Bin in the canvas corner: drop a widget here to delete it (or to cancel a palette drag). */
export function TrashTarget({ trashRef, over, active }: {
  trashRef: React.Ref<HTMLDivElement>;
  /** A dragged widget is over the bin. */
  over: boolean;
  /** Something is being dragged (bin more visible). */
  active: boolean;
}) {
  const p = usePalette();
  return (
    <div ref={trashRef} title="Drag a widget here to delete it"
      style={{
        position: "absolute", right: 14, bottom: 14, width: 52, height: 52, borderRadius: 12, pointerEvents: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `2px ${over ? "solid" : "dashed"} ${over ? p.danger : p.border}`,
        background: over ? p.dangerBg : "transparent",
        color: over ? p.danger : p.dimText,
        opacity: over ? 1 : active ? 0.9 : 0.45,
        transform: over ? "scale(1.15)" : "none", transition: "transform .12s, opacity .12s",
      }}>
      <Trash2 size={24} />
    </div>
  );
}

/** The toolbox as a bin while a widget is dragged towards it: tints red with `heat` (0..1), deletes at 1. */
export function ToolboxBin({ rect, heat, putBack }: { rect: DOMRect | undefined; heat: number; /** A new, unplaced widget: dropping just cancels. */ putBack?: boolean }) {
  const p = usePalette();
  if (!rect) return null;
  const over = heat >= 1;
  return (
    <div style={{
      position: "fixed", left: rect.left, top: rect.top, width: rect.width, height: rect.height, pointerEvents: "none", zIndex: 900,
      background: `color-mix(in srgb, ${p.danger} ${Math.round(heat * (over ? 30 : 15))}%, transparent)`,
      border: `2px ${over ? "solid" : "dashed"} color-mix(in srgb, ${p.danger} ${Math.round(heat * 100)}%, transparent)`,
      boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
      color: p.danger, opacity: Math.max(0.2, heat), transition: "background .1s",
    }}>
      <Trash2 size={over ? 52 : 40} style={{ transition: "width .12s, height .12s" }} />
      <span style={{ fontSize: 12, fontWeight: 600 }}>{putBack ? (over ? "Release to put it back" : "Drop here to put it back") : over ? "Release to delete" : "Drop here to delete"}</span>
    </div>
  );
}
