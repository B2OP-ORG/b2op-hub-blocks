import { useRef, useState } from "react";
import * as Blockly from "blockly/core";
import { BleTransport, bleSupported } from "../transport/ble";
import { SerialTransport, serialSupported } from "../transport/serial";
import { MockTransport } from "../transport/mock";
import { DeviceClient } from "../device/deviceClient";
import { useApp } from "../state/store";
import type { BlocksProject } from "../project/format";
import { newBlocksProject, newPythonProject } from "../project/format";
import { hasRawBlock, normalizePython, pythonToBlocks } from "../project/pythonToBlocks";
import { workspaceToPython } from "../codegen/pythonGen";
import { sanitizeFilename } from "../utils/sanitize";
import { saveLastDeviceName } from "../project/storage";
import { FileBrowserModal } from "./FileBrowserModal";

function fmtSpeed(bps: number): string {
  if (bps >= 1_048_576) return `${(bps / 1_048_576).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${Math.round(bps)} B/s`;
}

function fmtEta(sec: number): string {
  if (sec < 60) return `~${Math.ceil(sec)}s`;
  return `~${Math.floor(sec / 60)}m ${Math.ceil(sec % 60)}s`;
}

interface Props {
  onOpenSettings: () => void;
}

function blocksProjectFromPython(source: string, title: string, settings: BlocksProject["settings"]): BlocksProject {
  const base = newBlocksProject(title);
  const { main, buttonHats, variables } = pythonToBlocks(source);
  const topBlocks: Record<string, unknown>[] = [];
  const programHat: Record<string, unknown> = { type: "when_program_starts", x: 40, y: 40 };
  if (main) programHat.inputs = { DO: { block: main } };
  topBlocks.push(programHat);
  buttonHats.forEach((h, i) => {
    const b: Record<string, unknown> = {
      type: "on_button_pressed",
      x: 320,
      y: 40 + i * 140,
      fields: { BTN: h.btn },
    };
    if (h.chain) b.inputs = { DO: { block: h.chain } };
    topBlocks.push(b);
  });
  const workspace: Record<string, unknown> = {
    blocks: { languageVersion: 0, blocks: topBlocks },
  };
  if (variables.length) workspace.variables = variables;
  return { ...base, settings, workspace };
}

interface TranslationCheck {
  hasRaw: boolean;
  roundTripOk: boolean;
  regen: string;
  project: BlocksProject;
}

function checkTranslation(source: string, title: string, settings: BlocksProject["settings"]): TranslationCheck {
  const project = blocksProjectFromPython(source, title, settings);
  const { main } = pythonToBlocks(source);
  const hasRaw = hasRawBlock(main);
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(project.workspace as object, ws);
    const regen = workspaceToPython(ws);
    const roundTripOk = normalizePython(regen) === normalizePython(source);
    return { hasRaw, roundTripOk, regen, project };
  } finally {
    ws.dispose();
  }
}

interface PromptState { hasRaw: boolean; roundTripOk: boolean; }
interface ToPythonPromptState { hasRaw: boolean; roundTripOk: boolean; source: string; }

export function Header({ onOpenSettings }: Props) {
  const { project, setProject, device, connection, connectionError, running,
    setDevice, setConnection, setRunning, appendConsole, pythonPreview } = useApp();
  const [switchPrompt, setSwitchPrompt] = useState<PromptState | null>(null);
  const [toPythonPrompt, setToPythonPrompt] = useState<ToPythonPromptState | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ label: string; sent: number; total: number } | null>(null);
  const cancelRef = useRef(false);
  const transferStartRef = useRef(0);
  const dark = project.type === "python";

  // ── Mode toggle ──────────────────────────────────────────────────────────────

  const toggleType = () => {
    if (project.type === "blocks") {
      const source = useApp.getState().pythonPreview || "";
      const check = checkTranslation(source, project.title, project.settings);
      if (check.hasRaw || !check.roundTripOk) {
        setToPythonPrompt({ hasRaw: check.hasRaw, roundTripOk: check.roundTripOk, source });
        return;
      }
      setProject({ ...newPythonProject(project.title), settings: project.settings, source });
      return;
    }
    const check = checkTranslation(project.source, project.title, project.settings);
    if (!check.hasRaw && check.roundTripOk) {
      setProject(check.project);
      return;
    }
    setSwitchPrompt({ hasRaw: check.hasRaw, roundTripOk: check.roundTripOk });
  };

  const confirmToPython = () => {
    if (!toPythonPrompt) return;
    setProject({ ...newPythonProject(project.title), settings: project.settings, source: toPythonPrompt.source });
    setToPythonPrompt(null);
  };

  const confirmSwitch = (mode: "best-effort" | "discard") => {
    if (project.type !== "python") return setSwitchPrompt(null);
    if (mode === "best-effort") {
      setProject(blocksProjectFromPython(project.source, project.title, project.settings));
    } else {
      setProject({ ...newBlocksProject(project.title), settings: project.settings });
    }
    setSwitchPrompt(null);
  };

  // ── Device ───────────────────────────────────────────────────────────────────

  const connect = async (kind: "ble" | "serial" | "mock") => {
    setBusy(true);
    setConnection("connecting");
    let client: DeviceClient | null = null;
    try {
      const transport =
        kind === "ble" ? new BleTransport()
        : kind === "serial" ? new SerialTransport()
        : new MockTransport();
      client = new DeviceClient(transport);
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
      if (client) { try { await client.disconnect(); } catch { /* noop */ } }
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
        autoRun: false,
        onStdout: (t) => appendConsole("out", t),
        onProgress: (sent, total) => {
          if (cancelRef.current) throw new Error("Cancelled");
          setUploadProgress({ label: `Uploading ${base}.py…`, sent, total });
        },
      });
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

  // ── Styles ───────────────────────────────────────────────────────────────────

  const headerBg = dark ? "#0b1216" : "#0e7490";
  const headerBorder = dark ? "#164e63" : "#155e75";

  const btn: React.CSSProperties = {
    padding: "4px 11px",
    border: dark ? "1px solid #164e63" : "1px solid rgba(255,255,255,0.35)",
    background: dark ? "#111a20" : "rgba(255,255,255,0.12)",
    color: dark ? "#dff5fb" : "#ffffff",
    cursor: "pointer",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 13,
  };

  const dis = (base: React.CSSProperties, disabled: boolean): React.CSSProperties =>
    disabled ? { ...base, opacity: 0.45, cursor: "not-allowed" } : base;

  const primaryBtn: React.CSSProperties = {
    ...btn,
    background: dark ? "#0e7490" : "rgba(255,255,255,0.22)",
    border: dark ? "1px solid #155e75" : "1px solid rgba(255,255,255,0.55)",
  };

  const successBtn: React.CSSProperties = {
    ...btn,
    background: dark ? "#0f3e21" : "rgba(30,160,80,0.35)",
    border: dark ? "1px solid #1a5a30" : "1px solid rgba(80,220,120,0.6)",
    color: dark ? "#a9dcbc" : "#e0fff0",
  };

  const dangerBtn: React.CSSProperties = {
    ...btn,
    background: dark ? "#4a1414" : "rgba(200,30,30,0.35)",
    border: dark ? "1px solid #6a1c1c" : "1px solid rgba(255,100,100,0.6)",
    color: dark ? "#ffb0b0" : "#ffe8e8",
  };

  // status badge
  const badgeBg = (k: "ok" | "err" | "idle" | "run") =>
    dark
      ? k === "ok" ? "#0f3e21" : k === "err" ? "#4a1414" : k === "run" ? "#3a2a05" : "#111a20"
      : k === "ok" ? "rgba(60,200,100,0.25)" : k === "err" ? "rgba(220,50,50,0.25)" : k === "run" ? "rgba(255,200,30,0.25)" : "rgba(255,255,255,0.15)";
  const badgeFg = (k: "ok" | "err" | "idle" | "run") =>
    dark
      ? k === "ok" ? "#a9dcbc" : k === "err" ? "#ffb0b0" : k === "run" ? "#ffd166" : "#dff5fb"
      : k === "ok" ? "#c0ffe0" : k === "err" ? "#ffc0c0" : k === "run" ? "#fff2a0" : "#e0f4ff";
  const statusKind: "ok" | "err" | "idle" | "run" =
    connection === "connected" ? (running ? "run" : "ok") : connection === "error" ? "err" : "idle";
  const statusText =
    connection === "connected" ? (running ? "Running" : "Connected")
    : connection === "connecting" ? "Connecting…"
    : connection === "error" ? `Error: ${connectionError}`
    : "Disconnected";

  const divider: React.CSSProperties = {
    width: 1,
    alignSelf: "stretch",
    background: dark ? "#164e63" : "rgba(255,255,255,0.25)",
    margin: "2px 2px",
    flexShrink: 0,
  };

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        background: headerBg,
        color: dark ? "#dff5fb" : "#ffffff",
        borderBottom: `1px solid ${headerBorder}`,
        flexWrap: "nowrap",
        minHeight: 42,
      }}
    >
      {/* Brand */}
      <strong style={{ letterSpacing: 0.4, fontSize: 13, flexShrink: 0, marginRight: 4 }}>
        b2op
      </strong>

      <div style={divider} />

      {/* Mode toggle */}
      <button type="button" onClick={toggleType} style={btn}>
        {project.type === "blocks" ? "Blocks" : "Python"}
      </button>

      <div style={divider} />

      {/* Device controls */}
      {!device ? (
        <>
          <button type="button" style={dis(primaryBtn, busy || !bleSupported())} disabled={busy || !bleSupported()}
            onClick={() => connect("ble")} title={bleSupported() ? "Connect via Bluetooth" : "Web Bluetooth unsupported"}>
            BLE
          </button>
          <button type="button" style={dis(primaryBtn, busy || !serialSupported())} disabled={busy || !serialSupported()}
            onClick={() => connect("serial")} title={serialSupported() ? "Connect via USB" : "Web Serial unsupported"}>
            USB
          </button>
        </>
      ) : (
        <>
          <button type="button" style={dis(btn, busy)} disabled={busy} onClick={disconnect}>
            Disconnect
          </button>
          <button type="button" style={dis(successBtn, busy || running)} disabled={busy || running}
            onClick={run} title={running ? "Stop the running program first" : ""}>
            Run
          </button>
          <button type="button" style={dis(dangerBtn, busy || !running)} disabled={busy || !running}
            onClick={stop} title={!running ? "No program running" : ""}>
            Stop
          </button>
          {!running && (
            <>
              <button type="button" style={dis(primaryBtn, busy)} disabled={busy} onClick={upload}>
                Upload
              </button>
              <button type="button" style={dis(btn, busy)} disabled={busy}
                onClick={() => setShowBrowser(true)} title="Browse device filesystem">
                Files
              </button>
            </>
          )}
        </>
      )}

      {/* Status badge */}
      <span style={{
        marginLeft: "auto",
        fontWeight: 600,
        fontSize: 12,
        padding: "3px 9px",
        borderRadius: 999,
        background: badgeBg(statusKind),
        color: badgeFg(statusKind),
        border: dark ? "1px solid #164e63" : "1px solid rgba(255,255,255,0.2)",
        flexShrink: 0,
      }}>
        {statusText}
      </span>

      {/* Settings icon */}
      <button
        type="button"
        onClick={onOpenSettings}
        style={{ ...btn, fontSize: 16, padding: "3px 8px", lineHeight: 1 }}
        title="Settings"
      >
        ⚙
      </button>

      {/* Modals */}
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
      {switchPrompt && (
        <SwitchToBlocksPrompt dark={dark} state={switchPrompt}
          onCancel={() => setSwitchPrompt(null)}
          onDiscard={() => confirmSwitch("discard")}
          onBestEffort={() => confirmSwitch("best-effort")} />
      )}
      {toPythonPrompt && (
        <SwitchToPythonPrompt dark={dark} state={toPythonPrompt}
          onCancel={() => setToPythonPrompt(null)}
          onProceed={confirmToPython} />
      )}
    </header>
  );
}

// ── Prompt modals ─────────────────────────────────────────────────────────────

interface PromptProps {
  dark: boolean;
  state: PromptState;
  onCancel: () => void;
  onDiscard: () => void;
  onBestEffort: () => void;
}

function SwitchToBlocksPrompt({ dark, state, onCancel, onDiscard, onBestEffort }: PromptProps) {
  const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.6)" : "rgba(11,59,72,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
  const modal: React.CSSProperties = { background: dark ? "#0b1216" : "#ffffff", color: dark ? "#dff5fb" : "#0b3b48", padding: 20, borderRadius: 12, maxWidth: 460, border: dark ? "1px solid #164e63" : "1px solid #b6dbe4", boxShadow: dark ? "0 10px 30px rgba(0,0,0,0.5)" : "0 10px 30px rgba(0,111,143,0.25)" };
  const btn: React.CSSProperties = { padding: "6px 14px", borderRadius: 6, fontWeight: 600, cursor: "pointer", border: "1px solid #155e75" };
  const warnBg = dark ? "#3f1d1d" : "#fef2f2";
  const warnBorder = dark ? "#7f1d1d" : "#fecaca";
  const warnColor = dark ? "#fecaca" : "#7f1d1d";
  return (
    <div style={overlay} onClick={onCancel}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Switch to Blocks?</h3>
        <p style={{ fontSize: 14, lineHeight: 1.4 }}>Full translation isn't possible for this Python source:</p>
        <ul style={{ fontSize: 13, lineHeight: 1.5, paddingLeft: 18 }}>
          {state.hasRaw && <li>Some code doesn't map to any block — it will stay inside "raw Python" blocks.</li>}
          {!state.roundTripOk && (
            <li style={{ background: warnBg, border: `1px solid ${warnBorder}`, color: warnColor, padding: "4px 8px", borderRadius: 4, listStyle: "none", marginLeft: -18 }}>
              <strong>Round-trip check failed:</strong> regenerating Python from the imported blocks does not reproduce the original source exactly. Behavior may drift.
            </li>
          )}
        </ul>
        <p style={{ fontSize: 13, lineHeight: 1.5 }}>Choose how to proceed:</p>
        <ul style={{ fontSize: 13, lineHeight: 1.5, paddingLeft: 18 }}>
          <li><strong>Best effort</strong> — keep whatever translated + raw Python for the rest.</li>
          <li><strong>Discard</strong> — start with an empty blocks workspace.</li>
          <li><strong>Cancel</strong> — stay in Python mode.</li>
        </ul>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onCancel} style={{ ...btn, background: "transparent", color: dark ? "#dff5fb" : "#0b3b48", border: `1px solid ${dark ? "#164e63" : "#b6dbe4"}` }}>Cancel</button>
          <button type="button" onClick={onDiscard} style={{ ...btn, background: "#b91c1c", color: "#fff", border: "1px solid #7f1d1d" }}>Discard</button>
          <button type="button" onClick={onBestEffort} style={{ ...btn, background: "#0e7490", color: "#fff" }}>Best effort</button>
        </div>
      </div>
    </div>
  );
}

interface ToPythonPromptProps {
  dark: boolean;
  state: ToPythonPromptState;
  onCancel: () => void;
  onProceed: () => void;
}

function SwitchToPythonPrompt({ dark, state, onCancel, onProceed }: ToPythonPromptProps) {
  const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.6)" : "rgba(11,59,72,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
  const modal: React.CSSProperties = { background: dark ? "#0b1216" : "#ffffff", color: dark ? "#dff5fb" : "#0b3b48", padding: 20, borderRadius: 12, maxWidth: 460, border: dark ? "1px solid #164e63" : "1px solid #b6dbe4", boxShadow: dark ? "0 10px 30px rgba(0,0,0,0.5)" : "0 10px 30px rgba(0,111,143,0.25)" };
  const btn: React.CSSProperties = { padding: "6px 14px", borderRadius: 6, fontWeight: 600, cursor: "pointer", border: "1px solid #155e75" };
  const warnBg = dark ? "#3f1d1d" : "#fef2f2";
  const warnBorder = dark ? "#7f1d1d" : "#fecaca";
  const warnColor = dark ? "#fecaca" : "#7f1d1d";
  return (
    <div style={overlay} onClick={onCancel}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Switch to Python?</h3>
        <div style={{ background: warnBg, border: `1px solid ${warnBorder}`, color: warnColor, padding: "8px 10px", borderRadius: 6, fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
          <strong>Going back to Blocks won't be lossless.</strong> The generated Python does not round-trip cleanly to the current blocks:
          <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 18 }}>
            {state.hasRaw && <li>Contains constructs that only exist as "raw Python" blocks.</li>}
            {!state.roundTripOk && <li>Re-parsing the Python does not reproduce the current workspace exactly.</li>}
          </ul>
          <p style={{ marginTop: 8, marginBottom: 0 }}>If you edit the Python and later switch back, some blocks may change or disappear.</p>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onCancel} style={{ ...btn, background: "transparent", color: dark ? "#dff5fb" : "#0b3b48", border: `1px solid ${dark ? "#164e63" : "#b6dbe4"}` }}>Cancel</button>
          <button type="button" onClick={onProceed} style={{ ...btn, background: "#0e7490", color: "#fff" }}>Switch anyway</button>
        </div>
      </div>
    </div>
  );
}
