import { useEffect, useRef, useState } from "react";

interface DrawerProps {
  side: "right" | "bottom";
  label: string;
  storageKey: string;
  defaultSize?: number;
  minOpenSize?: number;
  dark?: boolean;
  onSizeChange?: (openSize: number) => void;
  /** Extra controls rendered at the end of the handle (bottom drawers only). */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

const HANDLE = 22;

/**
 * Panel that hides against a wall. A thin handle tab is always visible; the
 * user drags it out to reveal the content. Size persists to localStorage.
 * `onSizeChange` fires with the currently open size (0 when closed).
 */
export function Drawer({ side, label, storageKey, defaultSize = 0, minOpenSize = 40, dark = false, onSizeChange, headerActions, children }: DrawerProps) {
  const [size, setSize] = useState<number>(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw == null) return defaultSize;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : defaultSize;
  });
  const dragRef = useRef<{ start: number; startSize: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(storageKey, String(size));
    onSizeChange?.(size);
  }, [size, storageKey, onSizeChange]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { start: side === "right" ? e.clientX : e.clientY, startSize: size };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { start, startSize } = dragRef.current;
    const delta = side === "right" ? start - e.clientX : start - e.clientY;
    const next = Math.max(0, startSize + delta);
    setSize(next < minOpenSize ? 0 : next);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onDoubleClick = () => setSize(size > 0 ? 0 : Math.max(defaultSize || 240, minOpenSize));

  const isVertical = side === "right";
  const totalSize = size + HANDLE;

  const wrapBg = dark ? "#0b1216" : "#e0eff4";
  const wrapBorder = dark ? "#164e63" : "#b6dbe4";
  const handleBg = dark ? "#0c3a4a" : "#0e7490";
  const contentBg = dark ? "#0b1216" : "#ffffff";

  const wrapperStyle: React.CSSProperties = isVertical
    ? { display: "flex", flexDirection: "row", width: totalSize, height: "100%", background: wrapBg, borderLeft: `1px solid ${wrapBorder}` }
    : { display: "flex", flexDirection: "column", height: totalSize, width: "100%", background: wrapBg, borderTop: `1px solid ${wrapBorder}` };

  const handleStyle: React.CSSProperties = {
    background: handleBg,
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: isVertical || !headerActions ? "center" : "flex-start",
    padding: isVertical || !headerActions ? 0 : "0 4px 0 10px",
    boxSizing: "border-box",
    gap: 6,
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: 0.5,
    userSelect: "none",
    cursor: isVertical ? "ew-resize" : "ns-resize",
    ...(isVertical ? { width: HANDLE, height: "100%" } : { height: HANDLE, width: "100%" }),
    flexShrink: 0,
    touchAction: "none",
  };

  const labelStyle: React.CSSProperties = isVertical
    ? { writingMode: "vertical-rl", transform: "rotate(180deg)", textTransform: "uppercase" }
    : { textTransform: "uppercase" };

  return (
    <div style={wrapperStyle}>
      <div
        style={handleStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        title="Drag to resize · double-click to toggle"
      >
        <span style={labelStyle}>{size > 0 ? label : `▸ ${label}`}</span>
        {!isVertical && headerActions && (
          <div
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, cursor: "default" }}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {headerActions}
          </div>
        )}
      </div>
      {size > 0 && (
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden", background: contentBg }}>
          {children}
        </div>
      )}
    </div>
  );
}

export const DRAWER_HANDLE = HANDLE;
