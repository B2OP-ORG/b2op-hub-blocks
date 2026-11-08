import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/store";
import { getBlocksWorkspace } from "../project/format";
import { downloadProject, pickFile } from "../project/download";
import { newPythonProject, parseProject } from "../project/format";

interface MenuPos { x: number; y: number; }

export function TabBar() {
  const mfp = useApp((s) => s.mfp);
  const openFileIds = useApp((s) => s.openFileIds);
  const activeFileId = useApp((s) => s.activeFileId);
  const savedSnapshot = useApp((s) => s.savedSnapshot);
  const openFile = useApp((s) => s.openFile);
  const closeFile = useApp((s) => s.closeFile);
  const renameFile = useApp((s) => s.renameFile);
  const newFile = useApp((s) => s.newFile);
  const loadProject = useApp((s) => s.loadProject);
  const markSaved = useApp((s) => s.markSaved);
  const activeProject = useApp((s) => s.project);
  const dark = activeProject.type === "python";

  const [contextMenu, setContextMenu] = useState<{ fileId: string } & MenuPos | null>(null);
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const savedMfp = (() => { try { return JSON.parse(savedSnapshot); } catch { return null; } })();

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (!renamingFileId) return;
    const id = setTimeout(() => { renameInputRef.current?.focus(); renameInputRef.current?.select(); }, 0);
    return () => clearTimeout(id);
  }, [renamingFileId]);

  const isFileDirty = (fileId: string): boolean => {
    const current = mfp.files.find((f) => f.id === fileId);
    const saved = savedMfp?.files?.find((f: { id: string }) => f.id === fileId);
    if (!current) return false;
    if (!saved) return true;
    return current.content !== saved.content || current.name !== saved.name;
  };

  const commitRename = () => {
    if (renamingFileId && renameValue.trim()) {
      renameFile(renamingFileId, renameValue.trim());
    }
    setRenamingFileId(null);
  };

  const startRename = (fileId: string) => {
    const file = mfp.files.find((f) => f.id === fileId);
    if (!file) return;
    setRenamingFileId(fileId);
    setRenameValue(file.name.replace(/\.py$/, ""));
  };

  const openFileIntoTab = async (fileId: string) => {
    const file = await pickFile(".json,.blocksproj.json,.py");
    if (!file) return;
    const text = await file.text();
    openFile(fileId);
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

  const saveFile = (fileId: string) => {
    const file = mfp.files.find((f) => f.id === fileId);
    if (!file) return;
    const ws = getBlocksWorkspace(file);
    if (ws) {
      const proj = { type: "blocks" as const, format: "b2op-hub-blocks" as const, version: "2.0.0", title: file.name.replace(/\.py$/, ""), createdAt: mfp.createdAt, settings: mfp.settings, workspace: ws };
      downloadProject(proj);
    } else {
      downloadProject({ type: "python" as const, format: "b2op-hub-blocks" as const, version: "2.0.0", title: file.name.replace(/\.py$/, ""), createdAt: mfp.createdAt, settings: mfp.settings, source: file.content });
    }
    if (fileId === activeFileId) markSaved();
  };

  // ── Colours ────────────────────────────────────────────────────────────────

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
  const dirtyColor = dark ? "#7dd3fc" : "#0e7490";

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

  const menuDivider: React.CSSProperties = { height: 1, background: tabBorder, margin: "3px 0" };

  return (
    <>
      <div
        className={dark ? "tabbar-dark" : "tabbar-light"}
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 2,
          padding: "2px 8px 0",
          background: barBg,
          borderBottom: `1px solid ${barBorder}`,
          overflowX: "auto",
          overflowY: "visible",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {openFileIds.map((fileId) => {
          const file = mfp.files.find((f) => f.id === fileId);
          if (!file) return null;
          const active = fileId === activeFileId;
          const dirty = isFileDirty(fileId);
          const isRenaming = renamingFileId === fileId;

          return (
            <div
              key={fileId}
              style={tabStyle(active)}
              onClick={(e) => { e.stopPropagation(); if (!isRenaming) openFile(fileId); }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ fileId, x: e.clientX, y: e.clientY });
              }}
            >
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingFileId(null);
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
                <>
                  {dirty && <span style={{ color: dirtyColor, fontSize: 10, marginRight: 1 }}>●</span>}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>
                    {file.name}
                  </span>
                </>
              )}
              <button
                type="button"
                style={closeBtnStyle}
                onMouseDown={(e) => { e.stopPropagation(); closeFile(fileId); }}
                title="Close"
              >
                ×
              </button>
            </div>
          );
        })}

        <button
          type="button"
          style={addBtnStyle}
          onMouseDown={(e) => { e.stopPropagation(); newFile(); }}
          title="New file"
        >
          +
        </button>
      </div>

      {contextMenu && (
        <div
          style={{ ...menuStyle, top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button type="button" style={menuItemStyle}
            onMouseDown={() => { startRename(contextMenu.fileId); setContextMenu(null); }}>
            Rename
          </button>
          <button type="button" style={menuItemStyle}
            onMouseDown={() => { openFileIntoTab(contextMenu.fileId); setContextMenu(null); }}>
            Open…
          </button>
          <button type="button" style={menuItemStyle}
            onMouseDown={() => { saveFile(contextMenu.fileId); setContextMenu(null); }}>
            Save
          </button>
          <div style={menuDivider} />
          <button type="button" style={{ ...menuItemStyle, color: dark ? "#ffb0b0" : "#b91c1c" }}
            onMouseDown={() => { closeFile(contextMenu.fileId); setContextMenu(null); }}>
            Close
          </button>
        </div>
      )}
    </>
  );
}
