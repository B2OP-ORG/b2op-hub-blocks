import { useState } from "react";
import { usePalette } from "../theme";
import { Button } from "../components/Button";
import { Modal, ModalActions, ModalTitle } from "../components/Modal";

interface Props {
  boardName: string;
  boardVersion: string;
  currentFw: string;
  latestFw: string;
  onUpdate: () => void;
  onDismiss: (doNotShowAgain: boolean) => void;
}

const versionRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 13,
  margin: "4px 0",
  opacity: 0.85,
};

export function FirmwareUpdatePrompt({ boardName, boardVersion, currentFw, latestFw, onUpdate, onDismiss }: Props) {
  const [suppress, setSuppress] = useState(false);
  const p = usePalette();

  return (
    <Modal cardStyle={{ padding: 24, minWidth: 360, maxWidth: 480 }}>
      <ModalTitle style={{ marginBottom: 12 }}>Firmware update available</ModalTitle>
      <p style={{ marginTop: 0, fontSize: 13, opacity: 0.75 }}>
        {boardName} {boardVersion}
      </p>
      <div style={{ background: p.dark ? "#0e1f26" : "#f0f9fc", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
        <div style={versionRow}>
          <span>Current</span>
          <code>{currentFw || "unknown"}</code>
        </div>
        <div style={versionRow}>
          <span>Latest</span>
          <code style={{ color: p.dark ? "#6ee7b7" : "#0e7490", fontWeight: 700 }}>{latestFw}</code>
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 20, cursor: "pointer" }}>
        <input type="checkbox" checked={suppress} onChange={(e) => setSuppress(e.target.checked)} />
        Don&apos;t show firmware update notifications
      </label>
      <ModalActions>
        <Button onClick={() => onDismiss(suppress)}>Skip</Button>
        <Button variant="primary" onClick={onUpdate}>Update</Button>
      </ModalActions>
    </Modal>
  );
}
