import { useApp } from "../../state/store";
import { usePalette } from "../theme";
import { BatterySection } from "./BatterySection";
import { ButtonsSection } from "./ButtonsSection";
import { OrientationSection } from "./OrientationSection";
import { PortsSection } from "./PortsSection";
import { useDevicePolling } from "./useDevicePolling";

/** Live readings from the connected hub (battery, buttons, orientation, ports); needs live mode. */
export function DevicePanel() {
  const device = useApp((s) => s.device);
  const liveMode = useApp((s) => s.project.settings.liveMode);
  const updateSettings = useApp((s) => s.updateSettings);
  const p = usePalette();
  useDevicePolling(device, liveMode);

  return (
    <div style={{
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 12,
      width: "100%", height: "100%",
      background: p.dark ? "#071018" : p.panelBg,
      color: p.text, display: "flex", flexDirection: "column", minHeight: 0,
    }}>
      {!device && (
        <div style={{ padding: 12, color: p.dimText }}>No hub connected.</div>
      )}

      {device && !liveMode && (
        <div style={{ padding: 12, color: p.dimText, lineHeight: 1.5 }}>
          Live device data needs live mode.{" "}
          <button
            type="button"
            onClick={() => updateSettings({ liveMode: true })}
            style={{ background: p.accent, color: "#fff", border: "none", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontWeight: 600 }}
          >
            Enable live mode
          </button>
        </div>
      )}

      {device && liveMode && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <BatterySection />
          <ButtonsSection />
          <OrientationSection />
          <PortsSection />
        </div>
      )}
    </div>
  );
}
