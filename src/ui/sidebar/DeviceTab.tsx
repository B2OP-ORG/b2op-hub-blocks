import { Zap } from "lucide-react";
import { useApp } from "../../state/store";
import { DevicePanel } from "../DevicePanel";
import { usePalette } from "../theme";
import { PanelHeader } from "./common";

export function DeviceTab() {
  const p = usePalette();
  const boardName = useApp((s) => s.boardName);
  const boardVersion = useApp((s) => s.boardVersion);
  const fwVersion = useApp((s) => s.fwVersion);
  const connection = useApp((s) => s.connection);
  const liveMode = useApp((s) => s.mfp.settings.liveMode);
  const updateSettings = useApp((s) => s.updateSettings);
  const subtitle = connection === "connected" && boardName
    ? `${boardName}${boardVersion ? ` ${boardVersion}` : ""}${fwVersion ? ` · fw ${fwVersion}` : ""}`
    : undefined;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <PanelHeader title="Device" subtitle={subtitle}>
        <button
          type="button"
          onClick={() => updateSettings({ liveMode: !liveMode })}
          title="Toggle Pyodide live mode for this project"
          style={{
            display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, padding: "2px 6px",
            borderRadius: 4, cursor: "pointer",
            background: liveMode ? (p.dark ? "#3c2a05" : "#fde68a") : "transparent",
            color: liveMode ? (p.dark ? "#fcd34d" : "#78350f") : p.dimText,
            border: `1px solid ${liveMode ? (p.dark ? "#92400e" : "#f59e0b") : p.border}`,
          }}
        >
          <Zap size={11} /> Live
        </button>
      </PanelHeader>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <DevicePanel />
      </div>
    </div>
  );
}
