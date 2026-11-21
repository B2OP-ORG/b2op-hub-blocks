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
