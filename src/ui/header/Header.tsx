import { useRef } from "react";
import { Code2, Gamepad2, Layers, Settings } from "lucide-react";
import { useApp } from "../../state/store";
import { useDark } from "../theme";
import { useCompactLevel } from "../hooks/useCompactLevel";
import { switchActiveFileMode } from "../editor/modeSwitch";
import { openRemoteController } from "../remote/actions";
import { isSceneFile } from "../../scene/project";
import { BoardInfo } from "./BoardInfo";
import { DeviceActions } from "./DeviceActions";
import { dis, headerStyles, iconPad, labelShown } from "./headerStyles";
import { StatusBadge } from "./StatusBadge";
import { useDeviceConnection } from "./useDeviceConnection";

interface Props {
  onOpenSettings: () => void;
  onOpenFwUpdate?: () => void;
  /** Opens the firmware updater page directly (always available). */
  onOpenFwUpdater?: () => void;
  /** Latest firmware version for the connected board, when newer than the installed one. */
  latestFw?: string;
}

/**
 * Top bar: Blocks/Python toggle, remote controller, device actions, status.
 * Labels collapse to icons step by step when the bar gets too narrow:
 * level 1 hides toggles (Remote/Live), 2 secondary actions (Reload/Upload),
 * 3 primary actions + mode toggle + board info.
 */
export function Header({ onOpenSettings, onOpenFwUpdate, onOpenFwUpdater, latestFw }: Props) {
  const projectType = useApp((s) => s.project.type);
  const transferring = useApp((s) => s.transfer !== null);
  const activeFile = useApp((s) => s.mfp.files.find((f) => f.id === s.activeFileId));
  // The children read their own state, but the overflow check runs after a
  // Header render: re-render whenever anything that changes the bar's width does.
  useApp((s) => [!!s.device, s.running, s.connection, s.connectionError, s.boardName, s.boardVersion, s.fwVersion, s.project.settings.liveMode].join("|"));
  const headerRef = useRef<HTMLElement>(null);
  const compactLevel = useCompactLevel(headerRef, 3);
  const dark = useDark();
  const s = headerStyles(dark);
  const conn = useDeviceConnection();
  const busy = conn.connBusy || transferring;
  const canSwitchMode = !!activeFile && /\.py$/i.test(activeFile.name) && !isSceneFile(activeFile);
  const show = (hideAt: number) => labelShown(compactLevel, hideAt);

  return (
    <header
      ref={headerRef}
      data-autoreload-ignore
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 12px",
        background: s.headerBg,
        color: s.text,
        borderBottom: `1px solid ${s.headerBorder}`,
        flexWrap: "nowrap",
        minHeight: 36,
        overflow: "hidden",
      }}
    >
      {/* Mode toggle — text hides at level 3 */}
      <button type="button" onClick={() => void switchActiveFileMode()}
        disabled={!canSwitchMode}
        style={{ ...dis(projectType === "blocks" ? s.blocksMode : s.pythonMode, !canSwitchMode), ...iconPad(compactLevel, 3) }}
        title={canSwitchMode ? "Switch this file between Blocks and Python" : "Open a .py file to switch modes"}>
        {projectType === "blocks"
          ? <><Layers size={13} />{show(3) && " Blocks"}</>
          : <><Code2 size={13} />{show(3) && " Python"}</>}
      </button>
      <button type="button" style={{ ...s.btn, ...iconPad(compactLevel, 1) }} onClick={openRemoteController}
        title="Open the project's remote controller (sliders, buttons, indicators for remote.*)">
        <Gamepad2 size={13} />{show(1) && " Remote"}
      </button>

      <div style={s.divider} />

      <DeviceActions s={s} compact={compactLevel} busy={busy}
        onConnect={(k) => void conn.connect(k)} onDisconnect={() => void conn.disconnect()} onStop={() => void conn.stop()} />

      {/* Status + right side */}
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, position: "relative" }}>
        <BoardInfo dark={dark} showText={show(3)} onOpenFwUpdate={onOpenFwUpdate} />
        <StatusBadge s={s} dark={dark} compact={!show(3)} latestFw={latestFw} onOpenFwUpdater={onOpenFwUpdater} />
      </span>

      <button type="button" onClick={onOpenSettings} style={{ ...s.btn, padding: "4px 8px" }} title="Settings">
        <Settings size={15} />
      </button>
    </header>
  );
}
