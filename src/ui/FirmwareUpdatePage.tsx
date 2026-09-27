import { useApp } from "../state/store";

interface Props {
  onBack: () => void;
}

export function FirmwareUpdatePage({ onBack }: Props) {
  const dark = useApp((s) => s.project.type === "python");

  const page: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: dark ? "#06090b" : "#eaf4f7",
    color: dark ? "#dff5fb" : "#0b3b48",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 900,
  };

  const backBtn: React.CSSProperties = {
    position: "absolute",
    top: 16,
    left: 16,
    padding: "6px 14px",
    background: "transparent",
    border: dark ? "1px solid #164e63" : "1px solid #b6dbe4",
    color: dark ? "#dff5fb" : "#0b3b48",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
  };

  return (
    <div style={page}>
      <button type="button" style={backBtn} onClick={onBack}>← Back</button>
      <p style={{ opacity: 0.5 }}>Firmware update — coming soon.</p>
    </div>
  );
}
