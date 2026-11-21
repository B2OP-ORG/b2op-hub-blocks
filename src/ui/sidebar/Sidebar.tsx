import { lazy, Suspense, useEffect, useRef } from "react";
import { useApp } from "../../state/store";
import type { SidebarTabId } from "../../settings/editorSettings";
import { DEFAULT_SIDEBAR_WIDTH } from "../../settings/storage";
import { usePalette } from "../theme";
import { openContextMenu } from "../components/menuStore";
import { ResizeHandle } from "../components/ResizeHandle";
import { useResizeDrag } from "../hooks/useResizeDrag";
import { ActivityBar } from "./ActivityBar";
import { TAB_INFO } from "./tabInfo";
import { ExplorerTab } from "./ExplorerTab";
import { ProjectsTab } from "./ProjectsTab";
import { DeviceFilesTab } from "./DeviceFilesTab";
import { DeviceTab } from "./DeviceTab";
import { ExamplesTab } from "./ExamplesTab";

// Docs parse the bundled stubs (large), so load them on first open.
const DocsTab = lazy(() => import("./DocsTab").then((m) => ({ default: m.DocsTab })));

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

  // Dragging below the minimum by a margin collapses the panel.
  const resize = useResizeDrag({
    axis: "x",
    invert: side === "right",
    getSize: () => w,
    onResize: (next) => {
      if (next < MIN_W - 60) { setCollapsed(true); return; }
      if (collapsed) setCollapsed(false);
      setWidth(Math.min(Math.max(next, MIN_W), maxWidth()));
    },
  });

  const activityBar = (
    <ActivityBar side={side} tabs={visible} current={current} open={open} onIconClick={onIconClick} onMenu={activityMenu} />
  );

  const handle = (
    <ResizeHandle side={side} title="Drag to resize · double-click to reset" onDoubleClick={() => setWidth(DEFAULT_SIDEBAR_WIDTH)} handlers={resize} />
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
