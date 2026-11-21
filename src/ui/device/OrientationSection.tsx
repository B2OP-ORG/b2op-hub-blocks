import { useApp } from "../../state/store";
import { PanelSection } from "./PanelSection";

/** Pitch / yaw / roll in degrees (bold past ±45°). */
export function OrientationSection() {
  const orientation = useApp((s) => s.orientation);
  return (
    <PanelSection title="Orientation">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <AxisVal label="P" value={orientation.pitch} color="#f97316" />
        <AxisVal label="Y" value={orientation.yaw}   color="#a855f7" />
        <AxisVal label="R" value={orientation.roll}  color="#22c55e" />
      </div>
    </PanelSection>
  );
}

function AxisVal({ label, value, color }: { label: string; value: number; color: string }) {
  const bold = Math.abs(value) > 45;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span style={{ color, fontSize: 10, fontWeight: 700 }}>{label}</span>
      <span style={{ color, fontWeight: bold ? 700 : 400, fontSize: 13 }}>{value.toFixed(1)}°</span>
    </div>
  );
}
