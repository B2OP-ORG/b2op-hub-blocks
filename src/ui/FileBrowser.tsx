import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/store";
import { getBlocksWorkspace } from "../project/format";
import { pickFile } from "../project/download";
import { parseProject } from "../project/format";

const STORAGE_KEY = "b2op.fileBrowserOpen";

interface MenuPos { x: number; y: number; }

export function FileBrowser() {
  const mfp = useApp((s) => s.mfp);
  const openFileIds = useApp((s) => s.openFileIds);
  const activeFileId = useApp((s) => s.activeFileId);
  const activeProject = useApp((s) => s.project);
  const openFile = useApp((s) => s.openFile);
  const renameFile = useApp((s) => s.renameFile);
  const deleteFile = useApp((s) => s.deleteFile);
  const newFile = useApp((s) => s.newFile);
  const loadProject = useApp((s) => s.loadProject);

  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== "false"; } catch { return true; }
  });
  const [contextMenu, setContextMenu] = useState<{ fileId: string } & MenuPos | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const dark = activeProject.type === "python";

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(expanded)); } catch { /* quota */ }
  }, [expanded]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (!renamingId) return;
    const id = setTimeout(() => { renameInputRef.current?.focus(); renameInputRef.current?.select(); }, 0);
    return () => clearTimeout(id);
  }, [renamingId]);

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      renameFile(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const importFile = async () => {
    const file = await pickFile(".json,.blocksproj.json,.py");
    if (!file) return;
    const text = await file.text();
    if (file.name.endsWith(".py")) {
      newFile(file.name.replace(/\.py$/, ""));
      const { activeFileId: newId } = useApp.getState();
      useApp.getState().updateFile(newId, text);
    } else {
      try {
        const raw = JSON.parse(text);
        const parsed = parseProject(raw);
        if (!parsed) { alert("Unsupported format."); return; }
        loadProject(parsed.project);
      } catch (e) {
        alert("Invalid file: " + (e as Error).message);
      }
    }
  };

  // ── Colours ────────────────────────────────────────────────────────────────

  const bg = dark ? "#0a0f13" : "#d4eaf1";
  const border = dark ? "#164e63" : "#b6dbe4";
  const text = dark ? "#dff5fb" : "#0b3b48";
  const activeBg = dark ? "#0b1216" : "#c5e3ec";
  const hoverBg = dark ? "#111a20" : "#daeef5";
  const dimText = dark ? "#7aabb8" : "#4a7e8f";
  const menuBg = dark ? "#0b1216" : "#ffffff";
  const menuShadow = dark ? "0 4px 16px rgba(0,0,0,0.5)" : "0 4px 16px rgba(0,111,143,0.18)";

  const collapseBtn: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: dimText,
    fontSize: 12,
    padding: "2px 4px",
    borderRadius: 3,
    lineHeight: 1,
    flexShrink: 0,
  };

  const toolBtn: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: dimText,
    fontSize: 12,
    padding: "2px 4px",
    borderRadius: 3,
    lineHeight: 1,
  };

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    background: menuBg,
    border: `1px solid ${border}`,
    borderRadius: 6,
    boxShadow: menuShadow,
    zIndex: 9999,
    minWidth: 130,
    overflow: "hidden",
  };

  const menuItemStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "6px 12px",
    background: "none",
    border: "none",
    textAlign: "left",
    cursor: "pointer",
    color: text,
    fontSize: 12,
  };

  if (!expanded) {
    return (
      <div style={{
        width: 22,
        flexShrink: 0,
        background: bg,
        borderRight: `1px solid ${border}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 4,
      }}>
        <button type="button" style={collapseBtn} title="Open file browser" onClick={() => setExpanded(true)}>
          ▶
        </button>
      </div>
    );
  }

  return (
    <>
      <div style={{
        width: 180,
        flexShrink: 0,
        background: bg,
        borderRight: `1px solid ${border}`,
        display: "flex",
        flexDirection: "column",
        fontSize: 12,
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          padding: "4px 6px",
          borderBottom: `1px solid ${border}`,
          gap: 2,
          flexShrink: 0,
        }}>
          <span style={{ flex: 1, fontWeight: 600, fontSize: 11, color: dimText, letterSpacing: 0.5, textTransform: "uppercase" }}>
            Files
          </span>
          <button type="button" style={toolBtn} title="New file" onClick={() => newFile()}>+</button>
          <button type="button" style={toolBtn} title="Import file" onClick={importFile}>↑</button>
          <button type="button" style={collapseBtn} title="Collapse" onClick={() => setExpanded(false)}>◀</button>
        </div>

        {/* File list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {mfp.files.map((file) => {
            const isActive = file.id === activeFileId;
            const isOpen = openFileIds.includes(file.id);
            const isBlocks = getBlocksWorkspace(file) !== null;
            const isRenaming = renamingId === file.id;

            return (
              <div
                key={file.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "4px 8px",
                  background: isActive ? activeBg : "transparent",
                  color: text,
                  cursor: "pointer",
                  gap: 5,
                  borderLeft: isActive ? `2px solid #0e7490` : "2px solid transparent",
                }}
                onClick={() => openFile(file.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ fileId: file.id, x: e.clientX, y: e.clientY });
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = hoverBg; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                <span style={{ fontSize: 10, opacity: 0.6, flexShrink: 0 }}>
                  {isBlocks ? "⬡" : "⬡"}
                </span>
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                      e.stopPropagation();
                    }}
                    onBlur={commitRename}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1,
                      background: dark ? "#111a20" : "#f0f8fc",
                      color: text,
                      border: `1px solid #0e7490`,
                      borderRadius: 3,
                      padding: "1px 4px",
                      fontSize: 12,
                      outline: "none",
                      minWidth: 0,
                    }}
                  />
                ) : (
                  <span style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontWeight: isOpen ? 500 : 400,
                    opacity: isOpen ? 1 : 0.75,
                  }}>
                    {file.name}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {contextMenu && (
        <div
          style={{ ...menuStyle, top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button type="button" style={menuItemStyle}
            onMouseDown={() => {
              const f = mfp.files.find((x) => x.id === contextMenu.fileId);
              if (f) { setRenamingId(f.id); setRenameValue(f.name.replace(/\.py$/, "")); }
              setContextMenu(null);
            }}>
            Rename
          </button>
          <button type="button" style={{ ...menuItemStyle, color: dark ? "#ffb0b0" : "#b91c1c" }}
            onMouseDown={() => {
              if (mfp.files.length <= 1) { alert("Cannot delete the last file."); }
              else if (confirm(`Delete "${mfp.files.find((f) => f.id === contextMenu.fileId)?.name}"?`)) {
                deleteFile(contextMenu.fileId);
              }
              setContextMenu(null);
            }}>
            Delete
          </button>
        </div>
      )}
    </>
  );
}
