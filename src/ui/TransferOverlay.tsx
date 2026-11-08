import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../state/store";
import { usePalette } from "./theme";

/** Byte count as B / kB / MB (1024-based), e.g. 512 B, 12.3 kB, 1.25 MB. */
export function fmtBytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${Math.round(n)} B`;
}

export function fmtSpeed(bps: number): string {
  return `${fmtBytes(bps)}/s`;
}

export function fmtEta(sec: number): string {
  if (sec < 60) return `~${Math.ceil(sec)}s`;
  return `~${Math.floor(sec / 60)}m ${Math.ceil(sec % 60)}s`;
}

/** Modal progress for device transfers, driven by `useApp().transfer`. */
export function TransferOverlay() {
  const t = useApp((s) => s.transfer);
  const cancelled = useApp((s) => s.transferCancel);
  const cancel = useApp((s) => s.cancelTransfer);
  const p = usePalette();
  // Re-render periodically so speed/ETA stay fresh between progress events.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!t) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [t]);

  if (!t) return null;
  const pct = t.total > 0 ? Math.min(100, Math.round((t.sent / t.total) * 100)) : 0;
  const elapsed = (Date.now() - t.startedAt) / 1000;
  const speed = elapsed > 0.5 && t.sent > 0 ? t.sent / elapsed : 0;
  const eta = speed > 0 && t.total > t.sent ? (t.total - t.sent) / speed : 0;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 40000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        background: p.surface, border: `1px solid ${p.border}`, borderRadius: 10, padding: "24px 32px",
        minWidth: 320, maxWidth: "90vw", boxShadow: "0 10px 30px rgba(0,0,0,0.4)", color: p.text,
      }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, overflowWrap: "anywhere" }}>{t.label}</div>
        {t.fileCount !== undefined && t.fileCount > 1 && (
          <div style={{ fontSize: 12, color: p.dimText, marginBottom: 10 }}>File {t.fileIndex} of {t.fileCount}</div>
        )}
        <div style={{ height: 8, borderRadius: 4, background: p.dark ? "#1a2a35" : "#e0f0f5", overflow: "hidden", margin: "10px 0 8px" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: p.accent, borderRadius: 4, transition: "width 0.1s linear" }} />
        </div>
        <div style={{ fontSize: 12, color: p.dimText, marginBottom: 16, minHeight: 16 }}>
          {t.total > 0 && (
            <>
              {fmtBytes(t.sent)} / {fmtBytes(t.total)} ({pct}%)
              {speed > 0 && <> · {fmtSpeed(speed)}</>}
              {eta > 0 && <> · {fmtEta(eta)}</>}
            </>
          )}
        </div>
        <button
          type="button"
          disabled={cancelled}
          style={{
            padding: "6px 18px", border: `1px solid ${p.dark ? "#6a1c1c" : "#f0b4b4"}`, background: p.dangerBg,
            color: p.danger, borderRadius: 6, cursor: cancelled ? "default" : "pointer", fontWeight: 600, opacity: cancelled ? 0.6 : 1,
          }}
          onClick={cancel}
        >
          {cancelled ? "Cancelling…" : "Cancel"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
