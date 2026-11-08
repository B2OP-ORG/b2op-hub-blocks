import { useState } from "react";
import { Download, Pencil, Play, Upload, X } from "lucide-react";
import { useApp, isFileUnsynced } from "../state/store";
import { baseName } from "../project/format";
import { relDirname, relJoin } from "../project/paths";
import { runProjectFile, uploadFile } from "../project/deviceSync";
import { openContextMenu } from "./ContextMenu";
import { usePalette } from "./theme";
import { showAlert } from "./Dialog";
import { downloadProjectFile } from "./actions";
import { InlineInput } from "./sidebar/common";

export function TabBar() {
  const p = usePalette();
  const mfp = useApp((s) => s.mfp);
  const openFileIds = useApp((s) => s.openFileIds);
  const activeFileId = useApp((s) => s.activeFileId);
  const device = useApp((s) => s.device);
  const running = useApp((s) => s.running);
  const deviceName = useApp((s) => s.deviceName);
  const openFile = useApp((s) => s.openFile);
  const closeFile = useApp((s) => s.closeFile);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);

  const canDevice = !!device && !running;
  const deviceHint = !device ? "connect a hub" : running ? "program running" : undefined;

  const commitRename = async () => {
    const r = renaming;
    setRenaming(null);
    if (!r || !r.value.trim()) return;
    const f = useApp.getState().mfp.files.find((x) => x.id === r.id);
    if (!f || baseName(f.name) === r.value.trim()) return;
    const err = useApp.getState().renameFile(r.id, relJoin(relDirname(f.name), r.value.trim()));
    if (err) await showAlert("Can't rename", err);
  };

  const tabMenu = (e: React.MouseEvent, id: string) => {
    const f = mfp.files.find((x) => x.id === id);
    if (!f) return;
    openContextMenu(e, [
      { label: "Run this file", icon: <Play size={13} />, disabled: !canDevice, hint: deviceHint, onSelect: () => runProjectFile(id) },
      { label: "Upload this file", icon: <Upload size={13} />, disabled: !canDevice, hint: deviceHint, onSelect: () => uploadFile(id) },
      "separator",
      { label: "Rename", icon: <Pencil size={13} />, onSelect: () => setRenaming({ id, value: baseName(f.name) }) },
      { label: "Download", icon: <Download size={13} />, onSelect: () => downloadProjectFile(id) },
      "separator",
      { label: "Close", icon: <X size={13} />, onSelect: () => closeFile(id) },
      { label: "Close others", disabled: openFileIds.length <= 1, onSelect: () => useApp.getState().closeOtherFiles(id) },
      { label: "Close all", onSelect: () => useApp.getState().closeAllFiles() },
    ]);
  };

  const tabBg = p.dark ? "#111a20" : "#eaf4f7";
  const tabActiveBg = p.dark ? "#0b1216" : "#ffffff";

  return (
    <div
      className={p.dark ? "tabbar-dark" : "tabbar-light"}
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 2,
        padding: "2px 8px 0",
        background: p.panelBg,
        borderBottom: `1px solid ${p.border}`,
        overflowX: "auto",
        overflowY: "hidden",
        minHeight: 29,
        boxSizing: "border-box",
        flexShrink: 0,
      }}
    >
      {openFileIds.map((fileId) => {
        const file = mfp.files.find((f) => f.id === fileId);
        if (!file) return null;
        const active = fileId === activeFileId;
        const unsynced = isFileUnsynced(mfp, file, deviceName || undefined);
        const isRenaming = renaming?.id === fileId;
        return (
          <div
            key={fileId}
            title={`${file.name}${unsynced ? " · changed since last upload" : ""}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 6px 4px 11px",
              background: active ? tabActiveBg : tabBg,
              color: p.text,
              borderTop: `1px solid ${p.border}`,
              borderLeft: `1px solid ${p.border}`,
              borderRight: `1px solid ${p.border}`,
              borderBottom: active ? `2px solid ${p.accent}` : `1px solid ${p.border}`,
              borderRadius: "4px 4px 0 0",
              cursor: "pointer",
              fontWeight: active ? 600 : 400,
              fontSize: 13,
              userSelect: "none",
              maxWidth: 220,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
            onClick={() => { if (!isRenaming) openFile(fileId); }}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closeFile(fileId); } }}
            onDoubleClick={() => setRenaming({ id: fileId, value: baseName(file.name) })}
            onContextMenu={(e) => tabMenu(e, fileId)}
          >
            {isRenaming ? (
              <InlineInput value={renaming.value} onChange={(v) => setRenaming({ ...renaming, value: v })} onCommit={commitRename} onCancel={() => setRenaming(null)} />
            ) : (
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{baseName(file.name)}</span>
            )}
            <button
              type="button"
              title={unsynced ? "Changed since last upload · close" : "Close"}
              onClick={(e) => { e.stopPropagation(); closeFile(fileId); }}
              style={{
                marginLeft: 2, background: "none", border: "none", cursor: "pointer", color: unsynced ? p.accent : p.dimText,
                fontSize: unsynced ? 10 : 14, lineHeight: 1, padding: "0 2px", borderRadius: 3, flexShrink: 0, width: 16,
              }}
              onMouseEnter={(e) => { e.currentTarget.textContent = "×"; e.currentTarget.style.fontSize = "14px"; }}
              onMouseLeave={(e) => { e.currentTarget.textContent = unsynced ? "●" : "×"; e.currentTarget.style.fontSize = unsynced ? "10px" : "14px"; }}
            >
              {unsynced ? "●" : "×"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
