import { GRID, type WidgetKind } from "../../remote/layout";
import { usePalette } from "../theme";
import { DND_TYPE, type Bounds } from "./bounds";

/**
 * Scrollable, zoomable remote canvas. Accepts palette chips dropped from the
 * palette panel (`onDropKind` gets layout coordinates); `children` are the widget cards.
 */
export function RemoteCanvas({ canvasRef, canvasProps, showing, bounds, zoom, panCursor, empty, onDropKind, children }: {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  /** Event handlers of the scroll container (keys, pan / zoom, deselect). */
  canvasProps: React.HTMLAttributes<HTMLDivElement>;
  showing: boolean;
  bounds: Bounds;
  zoom: number;
  panCursor: string | undefined;
  /** No widgets yet: show the how-to hint. */
  empty: boolean;
  onDropKind: (kind: WidgetKind, x: number, y: number) => void;
  children: React.ReactNode;
}) {
  const p = usePalette();
  return (
    <div
      ref={canvasRef}
      tabIndex={0}
      {...canvasProps}
      onDragOver={(e) => { if (!showing && e.dataTransfer.types.includes(DND_TYPE)) e.preventDefault(); }}
      onDrop={(e) => {
        const kind = e.dataTransfer.getData(DND_TYPE) as WidgetKind;
        if (showing || !kind || !canvasRef.current) return;
        e.preventDefault();
        const el = canvasRef.current, r = el.getBoundingClientRect();
        onDropKind(kind, (e.clientX - r.left + el.scrollLeft) / zoom + bounds.left, (e.clientY - r.top + el.scrollTop) / zoom + bounds.top);
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
          {empty && (
            <div style={{ position: "absolute", left: 24, top: 24, color: p.dimText, maxWidth: 360, lineHeight: 1.5 }}>
              Drag controls and indicators here from the bar above (or click one).
              Programs read controls as <code>remote.&lt;name&gt;</code> and send indicator values with <code>remote.send()</code>.
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
