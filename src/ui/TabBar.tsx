import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/store";
import { downloadProject, pickFile } from "../project/download";
import { newBlocksProject, newPythonProject, parseProject } from "../project/format";

interface MenuPos { x: number; y: number; }

export function TabBar() {
  const tabs = useApp((s) => s.tabs);
  const activeTabId = useApp((s) => s.activeTabId);
  const activateTab = useApp((s) => s.activateTab);
  const closeTab = useApp((s) => s.closeTab);
  const openTab = useApp((s) => s.openTab);
  const renameTab = useApp((s) => s.renameTab);
  const loadProject = useApp((s) => s.loadProject);
  const markSaved = useApp((s) => s.markSaved);
  const activeProject = useApp((s) => s.project);
  const dark = activeProject.type === "python";

  // + button dropdown
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [newMenuPos, setNewMenuPos] = useState<MenuPos | null>(null);

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{ tabId: string } & MenuPos | null>(null);

  // Inline rename
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const close = () => { setNewMenuPos(null); setContextMenu(null); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (!renamingTabId) return;
    const id = setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
    return () => clearTimeout(id);
  }, [renamingTabId]);

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const commitRename = () => {
    if (renamingTabId && renameValue.trim()) {
      renameTab(renamingTabId, renameValue.trim());
    }
    setRenamingTabId(null);
  };

  const startRename = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    setRenamingTabId(tabId);
    setRenameValue(tab.project.title);
  };

  const openFileIntoTab = async (tabId: string) => {
    const file = await pickFile(".json,.blocksproj.json,.py");
    if (!file) return;
    const text = await file.text();
    activateTab(tabId);
    if (file.name.endsWith(".py")) {
      loadProject({ ...newPythonProject(file.name.replace(/\.py$/, "")), source: text });
    } else {
      try {
        const raw = JSON.parse(text);
        const parsed = parseProject(raw);
        if (!parsed) { alert("Unsupported project format."); return; }
        if (parsed.stale) alert("This project was created with an older version.");
        loadProject(parsed.project);
      } catch (e) {
        alert("Invalid project file: " + (e as Error).message);
      }
    }
  };

  const saveTab = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    downloadProject(tab.project);
    if (tabId === activeTabId) markSaved();
  };

  // ── Colours ───────────────────────────────────────────────────────────────────

  const barBg = dark ? "#0a0f13" : "#d4eaf1";
  const barBorder = dark ? "#164e63" : "#b6dbe4";
  const tabBg = dark ? "#111a20" : "#eaf4f7";
  const tabActiveBg = dark ? "#0b1216" : "#ffffff";
  const tabText = dark ? "#dff5fb" : "#0b3b48";
  const tabBorder = dark ? "#164e63" : "#b6dbe4";
  const teal = "#0e7490";
  const menuBg = dark ? "#0b1216" : "#ffffff";
  const menuBorder = dark ? "#164e63" : "#b6dbe4";
  const menuShadow = dark ? "0 4px 16px rgba(0,0,0,0.5)" : "0 4px 16px rgba(0,111,143,0.18)";

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px 4px 11px",
    background: active ? tabActiveBg : tabBg,
    color: tabText,
    borderTop: `1px solid ${tabBorder}`,
    borderLeft: `1px solid ${tabBorder}`,
    borderRight: `1px solid ${tabBorder}`,
    borderBottom: active ? `2px solid ${teal}` : `1px solid ${tabBorder}`,
    borderRadius: "4px 4px 0 0",
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
    fontSize: 13,
    userSelect: "none",
    maxWidth: 200,
    whiteSpace: "nowrap",
    overflow: "hidden",
    flexShrink: 0,
  });

  const badgeStyle: React.CSSProperties = {
    fontSize: 10,
    padding: "1px 4px",
    borderRadius: 3,
    background: dark ? "#164e63" : "#cce9f3",
    color: dark ? "#7dd3fc" : "#0e7490",
    fontWeight: 700,
    flexShrink: 0,
  };

  const closeBtnStyle: React.CSSProperties = {
    marginLeft: 2,
    background: "none",
    border: "none",
    cursor: "pointer",
    color: dark ? "#7aabb8" : "#4a7e8f",
    fontSize: 14,
    lineHeight: 1,
    padding: "0 2px",
    borderRadius: 3,
    flexShrink: 0,
  };

  const addBtnStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 3,
    padding: "4px 10px",
    background: tabBg,
    color: tabText,
    borderTop: `1px solid ${tabBorder}`,
    borderLeft: `1px solid ${tabBorder}`,
    borderRight: `1px solid ${tabBorder}`,
    borderBottom: `1px solid ${tabBorder}`,
    borderRadius: "4px 4px 0 0",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    flexShrink: 0,
  };

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    background: menuBg,
    border: `1px solid ${menuBorder}`,
    borderRadius: 6,
    boxShadow: menuShadow,
    zIndex: 9999,
    minWidth: 150,
    overflow: "hidden",
  };

  const menuItemStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "7px 14px",
    background: "none",
    border: "none",
    textAlign: "left",
    cursor: "pointer",
    color: tabText,
    fontSize: 13,
  };

  const menuDivider: React.CSSProperties = {
    height: 1,
    background: tabBorder,
    margin: "3px 0",
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 2,
          padding: "4px 8px 0",
          background: barBg,
          borderBottom: `1px solid ${barBorder}`,
          overflowX: "auto",
          overflowY: "visible",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const unsaved = tab.savedSnapshot !== JSON.stringify(tab.project);
          const badge = tab.project.type === "blocks" ? "B" : "P";
          const isRenaming = renamingTabId === tab.id;

          return (
            <div
              key={tab.id}
              style={tabStyle(active)}
              onClick={(e) => { e.stopPropagation(); if (!isRenaming) activateTab(tab.id); }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
                setNewMenuPos(null);
              }}
            >
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingTabId(null);
                    e.stopPropagation();
                  }}
                  onBlur={commitRename}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    width: 100,
                    background: dark ? "#111a20" : "#f0f8fc",
                    color: tabText,
                    border: `1px solid ${teal}`,
                    borderRadius: 3,
                    padding: "1px 5px",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
              ) : (
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>
                  {unsaved && <span style={{ color: teal, marginRight: 3 }}>●</span>}
                  {tab.project.title}
                </span>
              )}
              <span style={badgeStyle}>{badge}</span>
              <button
                type="button"
                style={closeBtnStyle}
                onMouseDown={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                title="Close tab"
              >
                ×
              </button>
            </div>
          );
        })}

        {/* + button */}
        <button
          ref={addBtnRef}
          type="button"
          style={addBtnStyle}
          onMouseDown={(e) => {
            e.stopPropagation();
            const rect = addBtnRef.current!.getBoundingClientRect();
            setNewMenuPos(newMenuPos ? null : { x: rect.left, y: rect.bottom + 2 });
            setContextMenu(null);
          }}
          title="New tab"
        >
          + ▾
        </button>
      </div>

      {/* New-tab dropdown — fixed position, above editor area */}
      {newMenuPos && (
        <div
          style={{ ...menuStyle, top: newMenuPos.y, left: newMenuPos.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button type="button" style={menuItemStyle}
            onMouseDown={() => { openTab(newBlocksProject()); setNewMenuPos(null); }}>
            New Blocks tab
          </button>
          <button type="button" style={menuItemStyle}
            onMouseDown={() => { openTab(newPythonProject()); setNewMenuPos(null); }}>
            New Python tab
          </button>
        </div>
      )}

      {/* Right-click context menu — fixed position */}
      {contextMenu && (
        <div
          style={{ ...menuStyle, top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button type="button" style={menuItemStyle}
            onMouseDown={() => { startRename(contextMenu.tabId); setContextMenu(null); }}>
            Rename
          </button>
          <button type="button" style={menuItemStyle}
            onMouseDown={() => { openFileIntoTab(contextMenu.tabId); setContextMenu(null); }}>
            Open…
          </button>
          <button type="button" style={menuItemStyle}
            onMouseDown={() => { saveTab(contextMenu.tabId); setContextMenu(null); }}>
            Save
          </button>
          <div style={menuDivider} />
          <button type="button" style={{ ...menuItemStyle, color: dark ? "#ffb0b0" : "#b91c1c" }}
            onMouseDown={() => { closeTab(contextMenu.tabId); setContextMenu(null); }}>
            Close
          </button>
        </div>
      )}
    </>
  );
}
