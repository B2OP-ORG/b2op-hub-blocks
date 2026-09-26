import { useRef, useState } from "react";

function fmtSpeed(bps: number): string {
  if (bps >= 1_048_576) return `${(bps / 1_048_576).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${Math.round(bps)} B/s`;
}

function fmtEta(sec: number): string {
  if (sec < 60) return `~${Math.ceil(sec)}s`;
  return `~${Math.floor(sec / 60)}m ${Math.ceil(sec % 60)}s`;
}
import { BleTransport, bleSupported } from "../transport/ble";
import { SerialTransport, serialSupported } from "../transport/serial";
import { MockTransport } from "../transport/mock";
import { DeviceClient } from "../device/deviceClient";
import { useApp } from "../state/store";
import { sanitizeFilename } from "../utils/sanitize";
import { saveLastDeviceName } from "../project/storage";
import { FileBrowserModal } from "./FileBrowserModal";

export function DeviceBar() {
  const { device, connection, connectionError, running, setDevice, setConnection, setRunning, appendConsole, project, pythonPreview } = useApp();
  const [busy, setBusy] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ label: string; sent: number; total: number } | null>(null);
  const cancelRef = useRef(false);
  const transferStartRef = useRef(0);
  const dark = project.type === "python";

  const connect = async (kind: "ble" | "serial" | "mock") => {
    setBusy(true);
    setConnection("connecting");
    let client: DeviceClient | null = null;
    try {
      const transport =
        kind === "ble" ? new BleTransport() : kind === "serial" ? new SerialTransport() : new MockTransport();
      client = new DeviceClient(transport);
      transport.onData(() => {
        // Chunks are consumed by RawRepl; do not double-log.
      });
      transport.onDisconnect(() => {
        setConnection("disconnected");
        setDevice(null);
        setRunning(false);
        appendConsole("info", "[device disconnected]\n");
      });
      await client.connect();
      client.setProgramEndSink((info) => {
        setRunning(false);
        appendConsole(info.ok ? "info" : "err", `[program ${info.ok ? "ended" : "error"}${info.message ? ": " + info.message : ""}]\n`);
      });
      setDevice(client);
      setConnection("connected");
      setRunning(false);
      saveLastDeviceName(transport.info.name);
      appendConsole("info", `[connected: ${transport.info.name}]\n`);
    } catch (e) {
      setConnection("error", (e as Error).message);
      appendConsole("err", `[connect failed: ${(e as Error).message}]\n`);
      if (client) {
        try { await client.disconnect(); } catch { /* noop */ }
      }
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!device) return;
    setBusy(true);
    try {
      await device.disconnect();
      setDevice(null);
      setConnection("disconnected");
      setRunning(false);
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!device) return;
    const code = project.type === "python" ? project.source : pythonPreview;
    if (!code.trim()) return;
    const base = sanitizeFilename(project.title);
    const path = (project.settings.allowRoot ? "/" : "/sd/") + base + ".py";
    cancelRef.current = false;
    transferStartRef.current = Date.now();
    setBusy(true);
    appendConsole("info", `[run → ${path}]\n`);
    try {
      const bytes = new TextEncoder().encode(code);
      setUploadProgress({ label: `Uploading ${base}.py…`, sent: 0, total: bytes.length });
      await device.upload(path, bytes, {
        policy: { allowRoot: project.settings.allowRoot },
        autoRun: true,
        onStdout: (t) => appendConsole("out", t),
        onProgress: (sent, total) => {
          if (cancelRef.current) throw new Error("Cancelled");
          setUploadProgress({ label: `Uploading ${base}.py…`, sent, total });
        },
      });
      setRunning(true);
    } catch (e) {
      if ((e as Error).message === "Cancelled") {
        device.stop().catch(() => {});
      } else {
        appendConsole("err", `[run failed: ${(e as Error).message}]\n`);
      }
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };

  const stop = async () => {
    if (!device) return;
    setBusy(true);
    try {
      await device.stop();
      setRunning(false);
      appendConsole("info", "[stop]\n");
    } catch (e) {
      appendConsole("err", `[stop failed: ${(e as Error).message}]\n`);
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    if (!device) return;
    const code = project.type === "python" ? project.source : pythonPreview;
    if (!code.trim()) return;
    const base = sanitizeFilename(project.title);
    const path = (project.settings.allowRoot ? "/" : "/sd/") + base + ".py";
    cancelRef.current = false;
    transferStartRef.current = Date.now();
    setBusy(true);
    appendConsole("info", `[upload → ${path}]\n`);
    try {
      const bytes = new TextEncoder().encode(code);
      setUploadProgress({ label: `Uploading ${base}.py…`, sent: 0, total: bytes.length });
      await device.upload(path, bytes, {
        policy: { allowRoot: project.settings.allowRoot },
        autoRun: project.settings.autoRunAfterUpload,
        onStdout: (t) => appendConsole("out", t),
        onProgress: (sent, total) => {
          if (cancelRef.current) throw new Error("Cancelled");
          setUploadProgress({ label: `Uploading ${base}.py…`, sent, total });
        },
      });
      if (project.settings.autoRunAfterUpload) setRunning(true);
      appendConsole("info", `[upload OK: ${path} (${bytes.length}B)]\n`);
    } catch (e) {
      if ((e as Error).message === "Cancelled") {
        device.stop().catch(() => {});
      } else {
        appendConsole("err", `[upload failed: ${(e as Error).message}]\n`);
      }
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };

  const status = connection === "connected"
    ? (running ? "Connected · Running" : "Connected · Idle")
    : connection === "connecting" ? "Connecting…"
    : connection === "error" ? `Error: ${connectionError}`
    : "Disconnected";

  const barBg = dark ? "#0b1216" : "#e0eff4";
  const barBorder = dark ? "#164e63" : "#b6dbe4";
  const barText = dark ? "#dff5fb" : "#0b3b48";

  const btnStyle: React.CSSProperties = {
    padding: "6px 12px",
    border: dark ? "1px solid #164e63" : "1px solid #b6dbe4",
    background: dark ? "#111a20" : "#ffffff",
    color: dark ? "#dff5fb" : "#0b3b48",
    cursor: "pointer",
    borderRadius: 6,
    fontWeight: 600,
  };

  const disabledStyle = (base: React.CSSProperties, disabled: boolean): React.CSSProperties =>
    disabled ? { ...base, opacity: 0.45, cursor: "not-allowed" } : base;

  const primaryBtn: React.CSSProperties = {
    ...btnStyle,
    background: "#0e7490",
    color: "#ffffff",
    border: "1px solid #155e75",
  };

  const dangerBtn: React.CSSProperties = {
    ...btnStyle,
    background: dark ? "#4a1414" : "#ffe4e4",
    color: dark ? "#ffb0b0" : "#8a1c1c",
    border: dark ? "1px solid #6a1c1c" : "1px solid #f0b4b4",
  };

  const successBtn: React.CSSProperties = {
    ...btnStyle,
    background: dark ? "#0f3e21" : "#e6f8ee",
    color: dark ? "#a9dcbc" : "#0f5e2f",
    border: dark ? "1px solid #1a5a30" : "1px solid #a9dcbc",
  };

  const badgeBg = (kind: "ok" | "err" | "idle" | "run") =>
    dark
      ? kind === "ok" ? "#0f3e21" : kind === "err" ? "#4a1414" : kind === "run" ? "#3a2a05" : "#111a20"
      : kind === "ok" ? "#d7f2e0" : kind === "err" ? "#f9d7d7" : kind === "run" ? "#fff2c4" : "#dff2f8";
  const badgeFg = (kind: "ok" | "err" | "idle" | "run") =>
    dark
      ? kind === "ok" ? "#a9dcbc" : kind === "err" ? "#ffb0b0" : kind === "run" ? "#ffd166" : "#dff5fb"
      : kind === "ok" ? "#0f5e2f" : kind === "err" ? "#8a1c1c" : kind === "run" ? "#8a5a00" : "#0b3b48";
  const kind: "ok" | "err" | "idle" | "run" =
    connection === "connected"
      ? (running ? "run" : "ok")
      : connection === "error" ? "err" : "idle";

  return (
    <div style={{ display: "flex", gap: 8, padding: "6px 14px", background: barBg, color: barText, alignItems: "center", borderBottom: `1px solid ${barBorder}` }}>
      {!device ? (
        <>
          <button type="button" style={primaryBtn} disabled={busy || !bleSupported()} onClick={() => connect("ble")} title={bleSupported() ? "" : "Web Bluetooth unsupported"}>
            Connect (BLE)
          </button>
          <button type="button" style={primaryBtn} disabled={busy || !serialSupported()} onClick={() => connect("serial")} title={serialSupported() ? "" : "Web Serial unsupported"}>
            Connect (USB)
          </button>
          {/* <button type="button" style={btnStyle} onClick={() => connect("mock")}>
            Connect (Mock)
          </button> */}
        </>
      ) : (
        <>
          <button
            type="button"
            style={disabledStyle(btnStyle, busy)}
            disabled={busy}
            onClick={disconnect}
          >
            Disconnect
          </button>
          <button
            type="button"
            style={disabledStyle(successBtn, busy || running)}
            disabled={busy || running}
            onClick={run}
            title={running ? "A program is already running — stop it first" : ""}
          >
            Run
          </button>
          <button
            type="button"
            style={disabledStyle(dangerBtn, busy || !running)}
            disabled={busy || !running}
            onClick={stop}
            title={!running ? "No program running" : ""}
          >
            Stop
          </button>
          {!running && (
            <>
              <button
                type="button"
                style={disabledStyle(primaryBtn, busy)}
                disabled={busy}
                onClick={upload}
              >
                Upload
              </button>
              <button
                type="button"
                style={disabledStyle(btnStyle, busy)}
                disabled={busy}
                onClick={() => setShowBrowser(true)}
                title="Browse and manage files on the device"
              >
                File Browser
              </button>
            </>
          )}
        </>
      )}
      <span
        style={{
          marginLeft: "auto",
          fontWeight: 600,
          padding: "3px 10px",
          borderRadius: 999,
          background: badgeBg(kind),
          color: badgeFg(kind),
          border: dark ? "1px solid #164e63" : "1px solid rgba(0,0,0,0.05)",
        }}
      >
        {status}
      </span>
      {showBrowser && <FileBrowserModal onClose={() => setShowBrowser(false)} />}
      {uploadProgress && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 2000,
          background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: dark ? "#0b1216" : "#ffffff",
            border: dark ? "1px solid #164e63" : "1px solid #b6dbe4",
            borderRadius: 10,
            padding: "24px 32px",
            minWidth: 320,
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
            color: dark ? "#dff5fb" : "#0b3b48",
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
              {uploadProgress.label}
            </div>
            <div style={{
              height: 8, borderRadius: 4,
              background: dark ? "#1a2a35" : "#e0f0f5",
              overflow: "hidden", marginBottom: 8,
            }}>
              <div style={{
                height: "100%",
                width: uploadProgress.total > 0
                  ? `${Math.min(100, Math.round(uploadProgress.sent / uploadProgress.total * 100))}%`
                  : "0%",
                background: "#0e7490",
                borderRadius: 4,
                transition: "width 0.1s linear",
              }} />
            </div>
            {uploadProgress.total > 0 && (() => {
              const elapsed = (Date.now() - transferStartRef.current) / 1000;
              const speed = elapsed > 0.5 && uploadProgress.sent > 0 ? uploadProgress.sent / elapsed : 0;
              const eta = speed > 0 && uploadProgress.total > uploadProgress.sent ? (uploadProgress.total - uploadProgress.sent) / speed : 0;
              return (
                <div style={{ fontSize: 12, color: dark ? "#8ab4c0" : "#5a8a9a", marginBottom: 16 }}>
                  {uploadProgress.sent.toLocaleString()} / {uploadProgress.total.toLocaleString()} B
                  {" "}({Math.min(100, Math.round(uploadProgress.sent / uploadProgress.total * 100))}%)
                  {speed > 0 && <> · {fmtSpeed(speed)}</>}
                  {eta > 0 && <> · {fmtEta(eta)}</>}
                </div>
              );
            })()}
            <button
              type="button"
              style={{
                padding: "6px 18px",
                border: dark ? "1px solid #6a1c1c" : "1px solid #f0b4b4",
                background: dark ? "#4a1414" : "#ffe4e4",
                color: dark ? "#ffb0b0" : "#8a1c1c",
                borderRadius: 6, cursor: "pointer", fontWeight: 600,
              }}
              onClick={() => { cancelRef.current = true; }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
