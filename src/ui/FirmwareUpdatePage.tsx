import "esp-web-tools/dist/web/install-button.js";
import { useApp } from "../state/store";
import boardVersions from "../device/boardVersions.json";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "esp-web-install-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        manifest: string;
      };
    }
  }
}

interface Props {
  onBack: () => void;
}

export function FirmwareUpdatePage({ onBack }: Props) {
  const dark = useApp((s) => s.project.type === "python");
  const boardName = useApp((s) => s.boardName);
  const boardVersion = useApp((s) => s.boardVersion);

  const entry = (boardVersions as Record<string, Record<string, { latestFwVersion: string; manifestFile: string }>>)[boardName]?.[boardVersion];
  const manifestUrl = entry?.manifestFile ?? null;

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
    padding: 24,
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

  const card: React.CSSProperties = {
    background: dark ? "#0b1216" : "#ffffff",
    border: dark ? "1px solid #164e63" : "1px solid #b6dbe4",
    borderRadius: 12,
    padding: "28px 32px",
    maxWidth: 480,
    width: "100%",
    boxShadow: dark ? "0 10px 30px rgba(0,0,0,0.5)" : "0 10px 30px rgba(0,111,143,0.15)",
  };

  const stepStyle: React.CSSProperties = {
    fontSize: 14,
    margin: "8px 0",
    lineHeight: 1.6,
  };

  const hintStyle: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.55,
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 1.5,
  };

  return (
    <div style={page}>
      <button type="button" style={backBtn} onClick={onBack}>← Back</button>
      <div style={card}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Firmware update</h3>
        {manifestUrl ? (
          <>
            <ol style={{ paddingLeft: 20, margin: "0 0 4px 0" }}>
              <li style={stepStyle}>Turn off the hub.</li>
              <li style={stepStyle}>Connect it to your computer via USB.</li>
              <li style={stepStyle}>
                Click <strong>Install</strong> and select the serial port in the browser dialog.
                <br />
                <span style={{ fontSize: 13, opacity: 0.75 }}>
                  <strong>Linux:</strong> <code>ttyACM0</code> (or <code>ttyACM1</code>…) &nbsp;·&nbsp;
                  <strong>Windows:</strong> <code>COM3</code> (or whichever appears)
                </span>
              </li>
            </ol>
            <p style={hintStyle}>
              If the port doesn't appear or the connection fails: disconnect, turn off the hub, hold the{" "}
              <strong>right button</strong>, then connect via USB again to enter bootloader mode.
            </p>
            <esp-web-install-button manifest={manifestUrl} />
          </>
        ) : (
          <p style={{ opacity: 0.5 }}>No firmware available for {boardName} {boardVersion}.</p>
        )}
      </div>
    </div>
  );
}
