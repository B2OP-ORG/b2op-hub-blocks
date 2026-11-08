import { lazy, Suspense, useEffect, useRef } from "react";
import { BookOpen, Cpu, FolderKanban, Files, HardDrive, Lightbulb } from "lucide-react";
import { useApp } from "../../state/store";
import type { SidebarTabId } from "../../project/format";
import { DEFAULT_SIDEBAR_WIDTH } from "../../project/storage";
import { usePalette } from "../theme";
import { openContextMenu } from "../ContextMenu";
import { ExplorerTab } from "./ExplorerTab";
import { ProjectsTab } from "./ProjectsTab";
import { DeviceFilesTab } from "./DeviceFilesTab";
import { DeviceTab } from "./DeviceTab";
import { ExamplesTab } from "./ExamplesTab";

// Docs parse the bundled stubs (large), so load them on first open.
const DocsTab = lazy(() => import("./DocsTab").then((m) => ({ default: m.DocsTab })));

export const TAB_INFO: Record<SidebarTabId, { label: string; icon: React.ReactNode }> = {
  explorer: { label: "Explorer", icon: <Files size={20} /> },
  projects: { label: "Projects", icon: <FolderKanban size={20} /> },
  sdcard: { label: "SD card", icon: <HardDrive size={20} /> },
  device: { label: "Device", icon: <Cpu size={20} /> },
  docs: { label: "Docs", icon: <BookOpen size={20} /> },
  examples: { label: "Examples", icon: <Lightbulb size={20} /> },
};

const ACTIVITY_W = 42;
const MIN_W = 160;
const maxWidth = () => Math.max(MIN_W, Math.min(800, Math.round(window.innerWidth * 0.5)));

function DocsSlot({ active }: { active: boolean }) {
  const opened = useRef(false);
  if (active) opened.current = true;
  if (!opened.current) return null;
  return <div style={{ display: active ? "contents" : "none" }}><Suspense fallback={null}><DocsTab /></Suspense></div>;
}

export function Sidebar() {
  const p = usePalette();
  const settings = useApp((s) => s.editorSettings.sidebar);
  const update = useApp((s) => s.updateEditorSettings);
  const activeTab = useApp((s) => s.sidebarTab);
  const collapsed = useApp((s) => s.sidebarCollapsed);
  const width = useApp((s) => s.sidebarWidth);
  const setTab = useApp((s) => s.setSidebarTab);
  const setCollapsed = useApp((s) => s.setSidebarCollapsed);
  const setWidth = useApp((s) => s.setSidebarWidth);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const side = settings.side;
  const visible = settings.tabOrder.filter((t) => !settings.hiddenTabs.includes(t));
  const current: SidebarTabId | undefined = visible.includes(activeTab) ? activeTab : visible[0];
  const open = !collapsed && !!current;
  const w = Math.min(Math.max(width, MIN_W), maxWidth());

  // Editors (Blockly) only relayout on window resize.
  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(id);
  }, [w, open, side]);

  const onIconClick = (t: SidebarTabId) => {
    if (t === current && !collapsed) setCollapsed(true);
    else { setTab(t); setCollapsed(false); }
  };

  const moveTab = (t: SidebarTabId, dir: -1 | 1) => {
    const order = [...settings.tabOrder];
    // Move relative to visible neighbours.
    const vis = order.filter((x) => !settings.hiddenTabs.includes(x));
    const vi = vis.indexOf(t);
    const swapWith = vis[vi + dir];
    if (!swapWith) return;
    const a = order.indexOf(t), b = order.indexOf(swapWith);
    [order[a], order[b]] = [order[b], order[a]];
    update({ sidebar: { ...settings, tabOrder: order } });
  };

  const activityMenu = (e: React.MouseEvent, t?: SidebarTabId) => {
    const vi = t ? visible.indexOf(t) : -1;
    openContextMenu(e, [
      t && { label: `Hide "${TAB_INFO[t].label}"`, disabled: visible.length <= 1, onSelect: () => update({ sidebar: { ...settings, hiddenTabs: [...settings.hiddenTabs, t] } }) },
      t && { label: "Move up", disabled: vi <= 0, onSelect: () => moveTab(t, -1) },
      t && { label: "Move down", disabled: vi === -1 || vi >= visible.length - 1, onSelect: () => moveTab(t, 1) },
      "separator",
      ...settings.hiddenTabs.map((h) => ({ label: `Show "${TAB_INFO[h].label}"`, onSelect: () => update({ sidebar: { ...settings, hiddenTabs: settings.hiddenTabs.filter((x) => x !== h) } }) })),
      "separator",
      { label: `Move sidebar to the ${side === "left" ? "right" : "left"}`, onSelect: () => update({ sidebar: { ...settings, side: side === "left" ? "right" : "left" } }) },
      { label: "Reset width", onSelect: () => setWidth(DEFAULT_SIDEBAR_WIDTH) },
      { label: collapsed ? "Expand sidebar" : "Collapse sidebar", onSelect: () => setCollapsed(!collapsed) },
    ]);
  };

  // ── Resize handle ───────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startW: w };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const delta = side === "left" ? e.clientX - d.startX : d.startX - e.clientX;
    const next = d.startW + delta;
    if (next < MIN_W - 60) { setCollapsed(true); return; }
    if (collapsed) setCollapsed(false);
    setWidth(Math.min(Math.max(next, MIN_W), maxWidth()));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const activityBar = (
    <div
      style={{
        width: ACTIVITY_W,
        flexShrink: 0,
        background: p.dark ? "#070c0f" : "#c5e2eb",
        borderLeft: side === "right" ? `1px solid ${p.border}` : undefined,
        borderRight: side === "left" ? `1px solid ${p.border}` : undefined,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 4,
        gap: 2,
      }}
      onContextMenu={(e) => activityMenu(e)}
    >
      {visible.map((t) => {
        const active = open && t === current;
        return (
          <button
            key={t}
            type="button"
            title={TAB_INFO[t].label}
            aria-label={TAB_INFO[t].label}
            aria-pressed={active}
            onClick={() => onIconClick(t)}
            onContextMenu={(e) => activityMenu(e, t)}
            style={{
              width: ACTIVITY_W,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              borderLeft: side === "left" ? `2px solid ${active ? p.accent : "transparent"}` : "2px solid transparent",
              borderRight: side === "right" ? `2px solid ${active ? p.accent : "transparent"}` : "2px solid transparent",
              color: active ? p.text : p.dimText,
              opacity: active ? 1 : 0.8,
              cursor: "pointer",
            }}
          >
            {TAB_INFO[t].icon}
          </button>
        );
      })}
    </div>
  );

  const handle = (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => setWidth(DEFAULT_SIDEBAR_WIDTH)}
      style={{ width: 5, flexShrink: 0, cursor: "ew-resize", background: "transparent", touchAction: "none", margin: side === "left" ? "0 -2px 0 -3px" : "0 -3px 0 -2px", zIndex: 5, position: "relative" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = p.accent; }}
      onMouseLeave={(e) => { if (!dragRef.current) e.currentTarget.style.background = "transparent"; }}
    />
  );

  const panel = open && (
    <div style={{
      width: w,
      flexShrink: 0,
      background: p.panelBg,
      color: p.text,
      borderLeft: side === "right" ? `1px solid ${p.border}` : undefined,
      borderRight: side === "left" ? `1px solid ${p.border}` : undefined,
      display: "flex",
      flexDirection: "column",
      fontSize: 12,
      overflow: "hidden",
      minHeight: 0,
    }}>
      {/* Keep stateful tabs mounted so e.g. the SD card path survives tab switches. */}
      <div style={{ display: current === "explorer" ? "contents" : "none" }}><ExplorerTab /></div>
      <div style={{ display: current === "projects" ? "contents" : "none" }}><ProjectsTab /></div>
      <div style={{ display: current === "sdcard" ? "contents" : "none" }}><DeviceFilesTab active={current === "sdcard"} /></div>
      {current === "device" && <DeviceTab />}
      {/* Mounted on first open, then kept so navigation survives tab switches. */}
      <DocsSlot active={current === "docs"} />
      <div style={{ display: current === "examples" ? "contents" : "none" }}><ExamplesTab /></div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexShrink: 0, minHeight: 0, height: "100%" }}>
      {side === "left" ? <>{activityBar}{panel}{open && handle}</> : <>{open && handle}{panel}{activityBar}</>}
    </div>
  );
}
