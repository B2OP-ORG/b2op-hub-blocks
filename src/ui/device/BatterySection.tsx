import { useApp } from "../../state/store";
import { usePalette } from "../theme";
import { batteryColor, deviceColors } from "./deviceInfo";
import { PanelSection } from "./PanelSection";

/** Voltage, percentage and a coloured level bar. */
export function BatterySection() {
  const c = deviceColors(usePalette());
  const batteryMv = useApp((s) => s.batteryMv);
  const batteryPct = useApp((s) => s.batteryPct);
  const bColor = batteryColor(batteryPct);
  return (
    <PanelSection title="Battery">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 11 }}>
        <span style={{ color: c.value }}>{(batteryMv / 1000).toFixed(2)} V</span>
        <span style={{ color: bColor, fontWeight: 700 }}>{batteryPct}%</span>
      </div>
      {/* Slider track */}
      <div style={{ position: "relative", height: 8, background: c.sep, borderRadius: 4 }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${batteryPct}%`,
          background: `linear-gradient(to right, hsl(0,85%,40%), ${bColor})`,
          borderRadius: 4,
          transition: "width 0.5s ease, background 0.5s ease",
        }} />
        <div style={{
          position: "absolute", top: "50%",
          left: `calc(${batteryPct}% - 6px)`,
          transform: "translateY(-50%)",
          width: 12, height: 12, borderRadius: "50%",
          background: bColor,
          boxShadow: `0 0 8px ${bColor}`,
          transition: "left 0.5s ease, background 0.5s ease, box-shadow 0.5s ease",
        }} />
      </div>
    </PanelSection>
  );
}
