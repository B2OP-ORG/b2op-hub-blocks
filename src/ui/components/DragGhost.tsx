/** Colour of a widget dragged towards a bin. */
const HEAT_COLOR = "#ef4444";

/**
 * A widget following the pointer outside its canvas (dragged in from the
 * palette, or out towards the toolbox): `children` drawn at the canvas
 * `scale`, centred on client point (x, y). `width` / `height` in canvas units.
 */
export function DragGhost({ x, y, width, height, scale, angle = 0, overTrash, heat = 0, radius = 2, children }: {
  x: number; y: number; width: number; height: number; scale: number;
  /** Rotation around the centre (degrees). */
  angle?: number;
  /** Over the bin: released, it is deleted (faded). */
  overTrash: boolean;
  /** 0..1: tint red (dragged towards the toolbox bin). */
  heat?: number;
  /** Corner radius of the heat tint (canvas units). */
  radius?: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      position: "fixed", left: x - (width * scale) / 2, top: y - (height * scale) / 2, width, height,
      transformOrigin: "0 0",
      transform: `scale(${scale})${angle ? ` translate(${width / 2}px, ${height / 2}px) rotate(${angle}deg) translate(${-width / 2}px, ${-height / 2}px)` : ""}`, pointerEvents: "none", zIndex: 1000,
      opacity: overTrash || heat >= 1 ? 0.45 : 0.85, filter: "drop-shadow(0 2px 4px rgba(0,0,0,.4))",
    }}>
      {children}
      <DragHeatTint heat={heat} radius={radius} />
    </div>
  );
}

/** Red overlay over a widget dragged towards the toolbox bin (`heat` 0..1); nothing at 0. */
export function DragHeatTint({ heat, radius = 0 }: { heat: number; radius?: number }) {
  if (heat <= 0) return null;
  return <div style={{ position: "absolute", inset: 0, background: HEAT_COLOR, opacity: heat * 0.65, borderRadius: radius, pointerEvents: "none" }} />;
}
