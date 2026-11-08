import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpCircle, Bluetooth, Circle, Code2, Layers,
  Play, Power, Settings, Square, Upload, Zap,
} from "lucide-react";
import { BleTransport, bleSupported } from "../transport/ble";
import { SerialTransport, serialSupported } from "../transport/serial";
import { MockTransport } from "../transport/mock";
import { DeviceClient } from "../device/deviceClient";
import { useApp, useDark } from "../state/store";
import { saveLastDeviceName } from "../project/storage";
import { runProject, runProjectFile, uploadFile, uploadProject } from "../project/deviceSync";
import { openContextMenu } from "./ContextMenu";
import { switchActiveFileMode } from "./modeSwitch";

interface Props {
  onOpenSettings: () => void;
  onOpenFwUpdate?: () => void;
}

export function Header({ onOpenSettings, onOpenFwUpdate }: Props) {
  const project = useApp((s) => s.project);
  const device = useApp((s) => s.device);
  const connection = useApp((s) => s.connection);
  const connectionError = useApp((s) => s.connectionError);
  const running = useApp((s) => s.running);
  const setDevice = useApp((s) => s.setDevice);
  const setConnection = useApp((s) => s.setConnection);
  const setRunning = useApp((s) => s.setRunning);
  const setDeviceName = useApp((s) => s.setDeviceName);
  const appendConsole = useApp((s) => s.appendConsole);
  const boardName = useApp((s) => s.boardName);
  const boardVersion = useApp((s) => s.boardVersion);
  const fwVersion = useApp((s) => s.fwVersion);
  const transferring = useApp((s) => s.transfer !== null);
  const projectId = useApp((s) => s.mfp.id);
  const activeFile = useApp((s) => s.mfp.files.find((f) => f.id === s.activeFileId));
  const [connBusy, setConnBusy] = useState(false);
  const busy = connBusy || transferring;
  const [compactLevel, setCompactLevel] = useState(0);
  const [, forceUpdate] = useState(0);
  const [showStatusPopover, setShowStatusPopover] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const compactLevelRef = useRef(0);
  const badgeBtnRef = useRef<HTMLButtonElement>(null);
  const dark = useDark();
  const liveMode = project.settings.liveMode;
  const canSwitchMode = !!activeFile && /\.py$/i.test(activeFile.name);

  useEffect(() => { compactLevelRef.current = compactLevel; }, [compactLevel]);

  // After every render: if overflowing, step up one level (pre-paint, no flicker)
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth && compactLevel < 3) {
      setCompactLevel(compactLevel + 1);
    }
  });

  // ResizeObserver: on width increase try stepping down; on any change force a re-render
  // so useLayoutEffect above can detect overflow at the new container size.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    let prevWidth = el.clientWidth;
    const obs = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > prevWidth && compactLevelRef.current > 0) {
        setCompactLevel(l => Math.max(l - 1, 0));
      } else if (w !== prevWidth) {
        forceUpdate(n => n + 1);
      }
      prevWidth = w;
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Close status popover on outside click
  useEffect(() => {
    if (!showStatusPopover) return;
    const close = () => setShowStatusPopover(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showStatusPopover]);

  // showLabel(hideAt): text visible until compactLevel reaches hideAt
  // level 1 = hide toggles (Device/Live)
  // level 2 = hide secondary actions (Upload/Files)
  // level 3 = hide primary actions + mode toggle
  const showLabel = (hideAt: number) => compactLevel < hideAt;
  const iconPad = (hideAt: number): React.CSSProperties =>
    compactLevel >= hideAt ? { padding: "4px 6px" } : {};

  // ── Device ───────────────────────────────────────────────────────────────────

  const connect = async (kind: "ble" | "serial" | "mock") => {
    setConnBusy(true);
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
      // Sinks must be registered before connect() so PROG_START/END frames
      // that arrive during the handshake (ping/hello/mtu) are not dropped.
      client.setProgramEndSink((info) => {
        setRunning(false);
        appendConsole(info.ok ? "info" : "err", `[program ${info.ok ? "ended" : "error"}${info.message ? ": " + info.message : ""}]\n`);
      });
      client.setProgramStartSink((info) => {
        setRunning(true);
        appendConsole("info", `[program running: ${info.path}]\n`);
      });
      client.addStdoutSink((t) => appendConsole("out", t));
      client.addStderrSink((t) => appendConsole("err", t));
      await client.connect();
      setDevice(client);
      setConnection("connected");
      setRunning(client.isProgramRunning());
      saveLastDeviceName(transport.info.name);
      setDeviceName(transport.info.name);
      appendConsole("info", `[connected: ${transport.info.name}]\n`);
    } catch (e) {
      setConnection("error", (e as Error).message);
      appendConsole("err", `[connect failed: ${(e as Error).message}]\n`);
      if (client) { try { await client.disconnect(); } catch { /* noop */ } }
    } finally {
      setConnBusy(false);
    }
  };

  const disconnect = async () => {
    if (!device) return;
    setConnBusy(true);
    try {
      await device.disconnect();
      setDevice(null);
      setConnection("disconnected");
      setRunning(false);
    } finally {
      setConnBusy(false);
    }
  };

  const runMenu = (e: React.MouseEvent) => openContextMenu(e, [
    { label: "Run project (main.py)", icon: <Play size={13} />, onSelect: runProject },
    { label: activeFile ? `Run active file (${activeFile.name})` : "Run active file", icon: <Play size={13} />, disabled: !activeFile, onSelect: () => runProjectFile() },
  ]);

  const uploadMenu = (e: React.MouseEvent) => openContextMenu(e, [
    { label: "Upload changed files", icon: <Upload size={13} />, onSelect: () => uploadProject(projectId, "changed") },
    { label: "Upload all files", icon: <Upload size={13} />, onSelect: () => uploadProject(projectId, "all") },
    { label: activeFile ? `Upload active file (${activeFile.name})` : "Upload active file", disabled: !activeFile, onSelect: () => activeFile && uploadFile(activeFile.id) },
  ]);

  const stop = async () => {
    if (!device) return;
    setConnBusy(true);
    try {
      await device.stop();
      setRunning(false);
      appendConsole("info", "[stop]\n");
    } catch (e) {
      appendConsole("err", `[stop failed: ${(e as Error).message}]\n`);
    } finally {
      setConnBusy(false);
    }
  };

  // ── Styles ───────────────────────────────────────────────────────────────────

  const headerBg = dark ? "#0b1216" : "#0e7490";
  const headerBorder = dark ? "#164e63" : "#155e75";

  const btn: React.CSSProperties = {
    padding: "4px 10px",
    border: dark ? "1px solid #164e63" : "1px solid rgba(255,255,255,0.55)",
    background: dark ? "#111a20" : "rgba(255,255,255,0.20)",
    color: dark ? "#dff5fb" : "#ffffff",
    cursor: "pointer",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 5,
  };

  const dis = (base: React.CSSProperties, disabled: boolean): React.CSSProperties =>
    disabled ? { ...base, opacity: 0.45, cursor: "not-allowed" } : base;

  const primaryBtn: React.CSSProperties = {
    ...btn,
    background: dark ? "#0c3a4a" : "rgba(255,255,255,0.28)",
    border: dark ? "1px solid #155e75" : "1px solid rgba(255,255,255,0.75)",
  };

  const successBtn: React.CSSProperties = {
    ...btn,
    background: dark ? "#0f3e21" : "rgba(20,140,70,0.55)",
    border: dark ? "1px solid #1a5a30" : "1px solid rgba(80,230,130,0.85)",
    color: dark ? "#a9dcbc" : "#ffffff",
  };

  const dangerBtn: React.CSSProperties = {
    ...btn,
    background: dark ? "#4a1414" : "rgba(190,30,30,0.55)",
    border: dark ? "1px solid #6a1c1c" : "1px solid rgba(255,110,110,0.85)",
    color: dark ? "#ffb0b0" : "#ffffff",
  };

  const warnBtn: React.CSSProperties = {
    ...btn,
    background: dark ? "#3c1a04" : "rgba(200,100,0,0.55)",
    border: dark ? "1px solid #78350f" : "1px solid rgba(251,191,36,0.85)",
    color: dark ? "#fde68a" : "#ffffff",
  };

  const indigoBtn: React.CSSProperties = {
    ...btn,
    background: dark ? "#1e1b4b" : "rgba(90,100,255,0.50)",
    border: dark ? "1px solid #3730a3" : "1px solid rgba(150,160,255,0.80)",
    color: dark ? "#a5b4fc" : "#ffffff",
  };

  const blocksModeBtn: React.CSSProperties = {
    ...btn,
    background: dark ? "#0c3040" : "rgba(255,255,255,0.28)",
    border: dark ? "1px solid #155e75" : "1px solid rgba(255,255,255,0.75)",
    color: dark ? "#67e8f9" : "#ffffff",
  };

  const pythonModeBtn: React.CSSProperties = {
    ...btn,
    background: dark ? "#3c1a04" : "rgba(200,100,0,0.50)",
    border: dark ? "1px solid #78350f" : "1px solid rgba(251,191,36,0.80)",
    color: dark ? "#fde68a" : "#ffffff",
  };

  const liveActiveBtn: React.CSSProperties = {
    ...btn,
    background: dark ? "#3c2a05" : "rgba(200,140,0,0.55)",
    border: dark ? "1px solid #92400e" : "1px solid rgba(251,191,36,0.90)",
    color: dark ? "#fcd34d" : "#ffffff",
  };

  // Status badge
  const badgeBg = (k: "ok" | "err" | "idle" | "run") =>
    dark
      ? k === "ok" ? "#0f3e21" : k === "err" ? "#4a1414" : k === "run" ? "#3a2a05" : "#111a20"
      : k === "ok" ? "rgba(20,140,70,0.55)" : k === "err" ? "rgba(190,30,30,0.55)" : k === "run" ? "rgba(180,130,0,0.55)" : "rgba(255,255,255,0.22)";
  const badgeFg = (k: "ok" | "err" | "idle" | "run") =>
    dark
      ? k === "ok" ? "#a9dcbc" : k === "err" ? "#ffb0b0" : k === "run" ? "#ffd166" : "#dff5fb"
      : "#ffffff";
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
      ref={headerRef}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 12px",
        background: headerBg,
        color: dark ? "#dff5fb" : "#ffffff",
        borderBottom: `1px solid ${headerBorder}`,
        flexWrap: "nowrap",
        minHeight: 36,
        overflow: "hidden",
      }}
    >
      {/* Brand */}
      {/* <strong style={{ letterSpacing: 0.4, fontSize: 13, flexShrink: 0, marginRight: 2 }}>
        b2op
      </strong>

      <div style={divider} /> */}

      {/* Mode toggle — text hides at level 3 */}
      <button type="button" onClick={() => void switchActiveFileMode()}
        disabled={!canSwitchMode}
        style={{ ...dis(project.type === "blocks" ? blocksModeBtn : pythonModeBtn, !canSwitchMode), ...iconPad(3) }}
        title={canSwitchMode ? "Switch this file between Blocks and Python" : "Open a .py file to switch modes"}>
        {project.type === "blocks"
          ? <><Layers size={13} />{showLabel(3) && " Blocks"}</>
          : <><Code2 size={13} />{showLabel(3) && " Python"}</>}
      </button>

      <div style={divider} />

      {/* Actions */}
      {!device ? (
        <button
          type="button"
          style={{ ...dis(primaryBtn, busy || !bleSupported()), ...iconPad(3) }}
          disabled={busy || !bleSupported()}
          onClick={(e) => connect(e.shiftKey && serialSupported() ? "serial" : "ble")}
          title={bleSupported() ? "Connect via Bluetooth · hold Shift for USB" : "Web Bluetooth unsupported"}
        >
          <Bluetooth size={13} />{showLabel(3) && " BLE"}
        </button>
      ) : (
        <>
          {/* Primary actions — text hides at level 3 */}
          <button type="button" style={{ ...dis(warnBtn, busy), ...iconPad(3) }} disabled={busy} onClick={disconnect}
            title="Disconnect device">
            <Power size={13} />{showLabel(3) && " Disconnect"}
          </button>
          <button type="button" style={{ ...dis(successBtn, busy || running), ...iconPad(3) }} disabled={busy || running}
            onClick={() => void runProject()} onContextMenu={(e) => { if (!busy && !running) runMenu(e); else e.preventDefault(); }}
            title={running ? "Stop the running program first" : "Upload changed files and run main.py · right-click for more"}>
            <Play size={13} />{showLabel(3) && " Run"}
          </button>
          <button type="button" style={{ ...dis(dangerBtn, busy || !running), ...iconPad(3) }} disabled={busy || !running}
            onClick={stop} title={!running ? "No program running" : "Stop program"}>
            <Square size={13} />{showLabel(3) && " Stop"}
          </button>
          {!running && (
            <>
              <button type="button" style={{ ...dis(indigoBtn, busy), ...iconPad(2) }} disabled={busy}
                onClick={() => void uploadProject(projectId, "changed")}
                onContextMenu={(e) => { if (!busy) uploadMenu(e); else e.preventDefault(); }}
                title="Upload changed project files to the SD card · right-click for more">
                <Upload size={13} />{showLabel(3) && " Upload"}
              </button>
            </>
          )}

          <div style={divider} />

          {/* Toggles — text hides at level 1 */}
          <button type="button"
            style={{ ...dis(liveMode ? liveActiveBtn : btn, busy), ...iconPad(1) }}
            disabled={busy}
            onClick={() => useApp.getState().updateSettings({ liveMode: !liveMode })}
            title="Toggle Pyodide live mode for this file">
            <Zap size={13} />{showLabel(1) && " Live"}
          </button>
        </>
      )}

      {/* Status + right side */}
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, position: "relative" }}>
        {/* Board info — hidden at level 3 */}
        {showLabel(3) && connection === "connected" && boardName && (
          <span style={{ fontSize: 11, opacity: 0.75, color: dark ? "#a0cce0" : "#e0f4ff" }}>
            {boardName}{boardVersion ? ` ${boardVersion}` : ""}{fwVersion ? ` (${fwVersion})` : ""}
          </span>
        )}
        {onOpenFwUpdate && (
          <button
            type="button"
            onClick={onOpenFwUpdate}
            title="Firmware update available"
            style={{
              padding: showLabel(3) ? "3px 9px" : "3px 6px",
              borderRadius: 999,
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
              background: "#92400e",
              color: "#fef3c7",
              border: "1px solid #b45309",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <ArrowUpCircle size={12} />{showLabel(3) && " Update"}
          </button>
        )}

        {/* Status badge — text pill at levels 0-2, colored icon at level 3 */}
        {compactLevel < 3 ? (
          <span style={{
            fontWeight: 600,
            fontSize: 12,
            padding: "3px 9px",
            borderRadius: 999,
            background: badgeBg(statusKind),
            color: badgeFg(statusKind),
            border: dark ? "1px solid #164e63" : "1px solid rgba(255,255,255,0.2)",
          }}>
            {statusText}
          </span>
        ) : (
          <>
            <button
              ref={badgeBtnRef}
              type="button"
              title={statusText}
              onClick={(e) => { e.stopPropagation(); setShowStatusPopover(v => !v); }}
              style={{
                background: badgeBg(statusKind),
                border: dark ? "1px solid #164e63" : "1px solid rgba(255,255,255,0.2)",
                borderRadius: 999,
                padding: "4px 6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <Circle
                size={12}
                style={{ fill: badgeFg(statusKind), color: badgeFg(statusKind) }}
              />
            </button>
            {showStatusPopover && createPortal(
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "fixed",
                  top: (badgeBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 6,
                  right: window.innerWidth - (badgeBtnRef.current?.getBoundingClientRect().right ?? 0),
                  background: dark ? "#0d1c24" : "#065a72",
                  border: dark ? "1px solid #164e63" : "1px solid rgba(255,255,255,0.25)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                  color: dark ? "#dff5fb" : "#ffffff",
                  zIndex: 9999,
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
                }}
              >
                <div style={{ fontWeight: 700, color: badgeFg(statusKind) }}>{statusText}</div>
                {connection === "connected" && boardName && (
                  <div style={{ opacity: 0.75, marginTop: 3 }}>
                    {boardName}{boardVersion ? ` ${boardVersion}` : ""}{fwVersion ? ` (${fwVersion})` : ""}
                  </div>
                )}
              </div>
            , document.body)}
          </>
        )}
      </span>

      {/* Settings */}
      <button
        type="button"
        onClick={onOpenSettings}
        style={{ ...btn, padding: "4px 8px" }}
        title="Settings"
      >
        <Settings size={15} />
      </button>

    </header>
  );
}

