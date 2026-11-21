import { useApp } from "../../state/store";
import { usePalette } from "../theme";
import { PORTS, deviceColors, deviceName, portColor } from "./deviceInfo";
import { PanelSection } from "./PanelSection";

/** Each port: attached device and its current value(s). */
export function PortsSection() {
  const c = deviceColors(usePalette());
  const sensorValues = useApp((s) => s.sensorValues);
  const deviceType = useApp((s) => s.deviceType);
  return (
    <PanelSection title="Ports" titleGap={8} last>
      {PORTS.map(({ name }) => {
        const vals = sensorValues[name];
        const type = deviceType[name];
        const connected = type !== undefined && type !== 0;
        return (
          <div key={name} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "baseline" }}>
            <span style={{ color: c.heading, minWidth: 38, fontWeight: 600 }}>{name}</span>
            <span style={{ color: portColor(type ?? 0), flex: 1, marginLeft: 6, fontSize: 11 }}>{connected ? deviceName(type) : "(—)"}</span>
            <span style={{ color: c.value, textAlign: "right", fontSize: 11 }}>
              {vals && vals.length > 0
                ? vals.length === 1
                  ? vals[0].toFixed(1)
                  : `[${vals.map((v) => v.toFixed(1)).join(", ")}]`
                : ""}
            </span>
          </div>
        );
      })}
    </PanelSection>
  );
}
