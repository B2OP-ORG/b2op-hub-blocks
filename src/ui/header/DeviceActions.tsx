import { Bluetooth, Play, Plug, Power, RotateCw, Square, Upload, Usb } from "lucide-react";
import { bleUnavailable } from "../../device/transport/ble";
import { serialSupported } from "../../device/transport/serial";
import { useApp } from "../../state/store";
import { reloadProgram, runProject, runProjectFile, uploadFile, uploadProject } from "../../run/deviceSync";
import { openContextMenu, openMenuAt } from "../components/menuStore";
import { dis, iconPad, labelShown, type HeaderStyles } from "./headerStyles";
import type { ConnectKind } from "./useDeviceConnection";

/** Connect, or (when connected) Disconnect · Run · Reload · Stop · Upload. */
export function DeviceActions({ s, compact, busy, onConnect, onDisconnect, onStop }: {
  s: HeaderStyles;
  compact: number;
  busy: boolean;
  onConnect: (kind: ConnectKind) => void;
  onDisconnect: () => void;
  onStop: () => void;
}) {
  const device = useApp((st) => st.device);
  const running = useApp((st) => st.running);
  const projectId = useApp((st) => st.mfp.id);
  const activeFile = useApp((st) => st.mfp.files.find((f) => f.id === st.activeFileId));
  const show = (hideAt: number) => labelShown(compact, hideAt);
  const pad = (hideAt: number) => iconPad(compact, hideAt);

  const bleReason = bleUnavailable();
  const serialReason = serialSupported() ? null : "Web Serial unsupported in this browser";
  const canConnect = !bleReason || !serialReason;

  const connectMenu = (el: HTMLElement) => openMenuAt(el, [
    { label: "Bluetooth", icon: <Bluetooth size={13} />, disabled: !!bleReason, hint: bleReason ?? undefined, onSelect: () => onConnect("ble") },
    { label: "USB Serial", icon: <Usb size={13} />, disabled: !!serialReason, hint: serialReason ?? undefined, onSelect: () => onConnect("serial") },
  ]);

  const runMenu = (e: React.MouseEvent) => openContextMenu(e, [
    { label: "Run project (main.py)", icon: <Play size={13} />, onSelect: runProject },
    { label: activeFile ? `Run active file (${activeFile.name})` : "Run active file", icon: <Play size={13} />, disabled: !activeFile, onSelect: () => runProjectFile() },
  ]);

  const uploadMenu = (e: React.MouseEvent) => openContextMenu(e, [
    { label: "Upload changed files", icon: <Upload size={13} />, onSelect: () => uploadProject(projectId, "changed") },
    { label: "Upload all files", icon: <Upload size={13} />, onSelect: () => uploadProject(projectId, "all") },
    { label: activeFile ? `Upload active file (${activeFile.name})` : "Upload active file", disabled: !activeFile, onSelect: () => activeFile && uploadFile(activeFile.id) },
  ]);

  if (!device) {
    return (
      <button
        type="button"
        style={{ ...dis(s.primary, busy || !canConnect), ...pad(2) }}
        disabled={busy || !canConnect}
        onClick={(e) => connectMenu(e.currentTarget)}
        title={canConnect ? "Connect via Bluetooth or USB" : "Neither Web Bluetooth nor Web Serial is available"}
      >
        <Plug size={13} />{show(2) && " Connect"}
      </button>
    );
  }

  return (
    <>
      {/* Primary actions — text hides at level 2 */}
      <button type="button" style={{ ...dis(s.warn, busy), ...pad(2) }} disabled={busy} onClick={onDisconnect}
        title="Disconnect device">
        <Power size={13} />{show(2) && " Disconnect"}
      </button>
      <button type="button" style={{ ...dis(s.success, busy || running), ...pad(2) }} disabled={busy || running}
        onClick={() => void runProject()} onContextMenu={(e) => { if (!busy && !running) runMenu(e); else e.preventDefault(); }}
        title={running ? "Stop the running program first" : "Upload changed files and run main.py · right-click for more"}>
        <Play size={13} />{show(2) && " Run"}
      </button>
      {running && (
        <button type="button" style={{ ...dis(s.btn, busy), ...pad(1) }} disabled={busy}
          onClick={() => void reloadProgram()}
          title="Reload: stop the program, upload changed files and run it again">
          <RotateCw size={13} />{show(1) && " Reload"}
        </button>
      )}
      <button type="button" style={{ ...dis(s.danger, busy || !running), ...pad(2) }} disabled={busy || !running}
        onClick={onStop} title={!running ? "No program running" : "Stop program"}>
        <Square size={13} />{show(2) && " Stop"}
      </button>
      {!running && (
        <button type="button" style={{ ...dis(s.indigo, busy), ...pad(1) }} disabled={busy}
          onClick={() => void uploadProject(projectId, "changed")}
          onContextMenu={(e) => { if (!busy) uploadMenu(e); else e.preventDefault(); }}
          title="Upload changed project files to the SD card · right-click for more">
          <Upload size={13} />{show(1) && " Upload"}
        </button>
      )}
    </>
  );
}
