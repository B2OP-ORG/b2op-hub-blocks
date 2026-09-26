import { useApp } from "../state/store";
import type { LspMode } from "../project/format";

interface Props {
  onClose: () => void;
}

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  margin: "8px 0",
};

export function SettingsModal({ onClose }: Props) {
  const settings = useApp((s) => s.project.settings);
  const project = useApp((s) => s.project);
  const update = useApp((s) => s.updateSettings);
  const dark = project.type === "python";

  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: dark ? "rgba(0,0,0,0.6)" : "rgba(11, 59, 72, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };

  const modal: React.CSSProperties = {
    background: dark ? "#0b1216" : "#ffffff",
    color: dark ? "#dff5fb" : "#0b3b48",
    padding: 20,
    borderRadius: 12,
    minWidth: 380,
    border: dark ? "1px solid #164e63" : "1px solid #b6dbe4",
    boxShadow: dark ? "0 10px 30px rgba(0, 0, 0, 0.5)" : "0 10px 30px rgba(0, 111, 143, 0.25)",
  };

  const inputBg = dark ? "#111a20" : "#f6fbfd";
  const inputBorder = dark ? "#164e63" : "#b6dbe4";
  const inputColor = dark ? "#dff5fb" : "#0b3b48";

  const toggle = (key: keyof typeof settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    update({ [key]: e.target.checked });

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Settings</h3>
        <label style={row}>
          <input type="checkbox" checked={settings.showAdvanced} onChange={toggle("showAdvanced")} />
          Show advanced blocks
        </label>
        <label style={row}>
          <input type="checkbox" checked={settings.autoRunAfterUpload} onChange={toggle("autoRunAfterUpload")} />
          Auto-run after upload
        </label>
        <label style={row}>
          <input type="checkbox" checked={settings.allowRoot} onChange={toggle("allowRoot")} />
          Allow uploads to root filesystem (advanced)
        </label>
        <label style={row}>
          Toolbox block size:
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.05}
            value={settings.toolboxBlockScale}
            onChange={(e) => update({ toolboxBlockScale: Number(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ width: 40, textAlign: "right" }}>{settings.toolboxBlockScale.toFixed(2)}x</span>
        </label>
        <p style={{ fontSize: 12, opacity: 0.7 }}>
          Uploads default to <code>/sd/</code>. With this enabled, uploads may target <code>/</code>.<br />
          Uploads to <code>/main.py</code>, <code>/boot.py</code>, <code>/boot.mpy</code> are always rejected.
        </p>

        <h4 style={{ marginTop: 18, marginBottom: 4 }}>Python LSP</h4>
        <label style={row}>
          Mode:
          <select
            value={settings.lspMode}
            onChange={(e) => update({ lspMode: e.target.value as LspMode })}
            style={{ background: inputBg, color: inputColor, border: `1px solid ${inputBorder}`, borderRadius: 4, padding: "2px 4px" }}
          >
            <option value="off">Off</option>
            <option value="worker">In-browser (Pyright worker)</option>
            <option value="remote">Remote (WebSocket)</option>
          </select>
        </label>
        {settings.lspMode === "remote" && (
          <label style={row}>
            URL:
            <input
              type="text"
              value={settings.lspRemoteUrl}
              onChange={(e) => update({ lspRemoteUrl: e.target.value })}
              style={{ flex: 1, background: inputBg, color: inputColor, border: `1px solid ${inputBorder}`, borderRadius: 4, padding: 4 }}
            />
          </label>
        )}
        <p style={{ fontSize: 12, opacity: 0.7 }}>
          Provides completion, hover, signature help, and diagnostics for the
          built-in Python editor. Remote mode needs the server in <code>docs/lsp-server/</code>.
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "6px 16px", background: "#0e7490", color: "#fff", border: "1px solid #155e75", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
