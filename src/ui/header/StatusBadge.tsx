import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpCircle, Circle } from "lucide-react";
import { useApp } from "../../state/store";
import type { HeaderStyles, StatusKind } from "./headerStyles";

/**
 * Connection status pill (a coloured dot when compact); click opens a popover
 * with device details and a link to the firmware updater.
 */
export function StatusBadge({ s, dark, compact, latestFw, onOpenFwUpdater }: {
  s: HeaderStyles;
  dark: boolean;
  /** Show only the dot. */
  compact: boolean;
  latestFw?: string;
  onOpenFwUpdater?: () => void;
}) {
  const connection = useApp((st) => st.connection);
  const connectionError = useApp((st) => st.connectionError);
  const running = useApp((st) => st.running);
  const deviceName = useApp((st) => st.deviceName);
  const boardName = useApp((st) => st.boardName);
  const boardVersion = useApp((st) => st.boardVersion);
  const fwVersion = useApp((st) => st.fwVersion);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const kind: StatusKind = connection === "connected" ? (running ? "run" : "ok") : connection === "error" ? "err" : "idle";
  const text =
    connection === "connected" ? (running ? "Running" : "Connected")
    : connection === "connecting" ? "Connecting…"
    : connection === "error" ? `Error: ${connectionError}`
    : "Disconnected";
  const fg = s.badgeFg(kind);
  const connected = connection === "connected";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={compact ? text : "Device details"}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{
          fontWeight: 600,
          fontSize: 12,
          padding: compact ? "4px 6px" : "3px 9px",
          borderRadius: 999,
          background: s.badgeBg(kind),
          color: fg,
          border: dark ? "1px solid #164e63" : "1px solid rgba(255,255,255,0.2)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          maxWidth: 260,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {compact ? <Circle size={12} style={{ fill: fg, color: fg }} /> : text}
      </button>
      {open && createPortal(
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: (btnRef.current?.getBoundingClientRect().bottom ?? 0) + 6,
            right: window.innerWidth - (btnRef.current?.getBoundingClientRect().right ?? 0),
            background: dark ? "#0d1c24" : "#065a72",
            border: dark ? "1px solid #164e63" : "1px solid rgba(255,255,255,0.25)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12,
            color: dark ? "#dff5fb" : "#ffffff",
            zIndex: 9999,
            minWidth: 220,
            maxWidth: 360,
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, marginBottom: 8 }}>
            <Circle size={10} style={{ fill: fg, color: fg, flexShrink: 0 }} />
            <span style={{ wordBreak: "break-word" }}>{text}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 12, rowGap: 3 }}>
            {([
              ["Device", connected ? deviceName : ""],
              ["Board", connected ? boardName : ""],
              ["Hardware", connected ? boardVersion : ""],
              ["Firmware", connected ? fwVersion : ""],
              ...(latestFw ? [["Latest firmware", latestFw] as [string, string]] : []),
            ] as [string, string][]).map(([k, v]) => (
              <Fragment key={k}>
                <span style={{ opacity: 0.7 }}>{k}</span>
                <span style={{ fontWeight: 600, textAlign: "right" }}>{v || "—"}</span>
              </Fragment>
            ))}
          </div>
          {onOpenFwUpdater && (
            <button
              type="button"
              onClick={() => { setOpen(false); onOpenFwUpdater(); }}
              style={{
                ...(latestFw ? s.warn : s.btn),
                marginTop: 10,
                width: "100%",
                justifyContent: "center",
                fontSize: 12,
              }}
            >
              <ArrowUpCircle size={13} />{latestFw ? ` Update firmware to ${latestFw}` : " Open firmware updater"}
            </button>
          )}
        </div>
      , document.body)}
    </>
  );
}
