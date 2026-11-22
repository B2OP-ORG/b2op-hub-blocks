import { useRef } from "react";
import { Settings } from "lucide-react";
import { useApp } from "../../state/store";
import { useDark } from "../theme";
import { useCompactLevel } from "../hooks/useCompactLevel";
import { BoardInfo } from "./BoardInfo";
import { DeviceActions } from "./DeviceActions";
import { headerStyles, labelShown } from "./headerStyles";
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
 * Top bar: device actions, status, settings. (Blocks/Python switching and the
 * Python preview toggle live in the file tab / explorer context menus.)
 * Labels collapse to icons step by step when the bar gets too narrow:
 * level 1 hides secondary actions (Reload/Upload), 2 primary actions + board info.
 */
export function Header({ onOpenSettings, onOpenFwUpdate, onOpenFwUpdater, latestFw }: Props) {
  const transferring = useApp((s) => s.transfer !== null);
  // The children read their own state, but the overflow check runs after a
  // Header render: re-render whenever anything that changes the bar's width does.
  useApp((s) => [!!s.device, s.running, s.connection, s.connectionError, s.boardName, s.boardVersion, s.fwVersion].join("|"));
  const headerRef = useRef<HTMLElement>(null);
  const compactLevel = useCompactLevel(headerRef, 2);
  const dark = useDark();
  const s = headerStyles(dark);
  const conn = useDeviceConnection();
  const busy = conn.connBusy || transferring;
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
      <DeviceActions s={s} compact={compactLevel} busy={busy}
        onConnect={(k) => void conn.connect(k)} onDisconnect={() => void conn.disconnect()} onStop={() => void conn.stop()} />

      {/* Status + right side */}
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, position: "relative" }}>
        <BoardInfo dark={dark} showText={show(2)} onOpenFwUpdate={onOpenFwUpdate} />
        <StatusBadge s={s} dark={dark} compact={!show(2)} latestFw={latestFw} onOpenFwUpdater={onOpenFwUpdater} />
      </span>

      <button type="button" onClick={onOpenSettings} style={{ ...s.btn, padding: "4px 8px" }} title="Settings">
        <Settings size={15} />
      </button>
    </header>
  );
}
