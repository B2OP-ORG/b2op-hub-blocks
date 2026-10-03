import { useState } from "react";
import { useApp } from "../state/store";

interface Props {
  boardName: string;
  boardVersion: string;
  currentFw: string;
  latestFw: string;
  onUpdate: () => void;
  onDismiss: (doNotShowAgain: boolean) => void;
}

export function FirmwareUpdatePrompt({ boardName, boardVersion, currentFw, latestFw, onUpdate, onDismiss }: Props) {
  const [suppress, setSuppress] = useState(false);
  const dark = useApp((s) => s.project.type === "python");

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
    padding: 24,
    borderRadius: 12,
    minWidth: 360,
    maxWidth: 480,
    border: dark ? "1px solid #164e63" : "1px solid #b6dbe4",
    boxShadow: dark ? "0 10px 30px rgba(0,0,0,0.5)" : "0 10px 30px rgba(0,111,143,0.25)",
  };

  const versionRow: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13,
    margin: "4px 0",
    opacity: 0.85,
  };

  const btnBase: React.CSSProperties = {
    padding: "6px 18px",
    borderRadius: 6,
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Firmware update available</h3>
        <p style={{ marginTop: 0, fontSize: 13, opacity: 0.75 }}>
          {boardName} {boardVersion}
        </p>
        <div style={{ background: dark ? "#0e1f26" : "#f0f9fc", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
          <div style={versionRow}>
            <span>Current</span>
            <code>{currentFw || "unknown"}</code>
          </div>
          <div style={versionRow}>
            <span>Latest</span>
            <code style={{ color: dark ? "#6ee7b7" : "#0e7490", fontWeight: 700 }}>{latestFw}</code>
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 20, cursor: "pointer" }}>
          <input type="checkbox" checked={suppress} onChange={(e) => setSuppress(e.target.checked)} />
          Don&apos;t show firmware update notifications
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={() => onDismiss(suppress)}
            style={{ ...btnBase, background: "transparent", border: dark ? "1px solid #164e63" : "1px solid #b6dbe4", color: dark ? "#dff5fb" : "#0b3b48" }}
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onUpdate}
            style={{ ...btnBase, background: "#0e7490", color: "#fff", border: "1px solid #155e75" }}
          >
            Update
          </button>
        </div>
      </div>
    </div>
  );
}
