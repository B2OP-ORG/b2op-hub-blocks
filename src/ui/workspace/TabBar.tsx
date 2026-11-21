import { BookOpen, Download, Eye, Pencil, Play, Upload, X } from "lucide-react";
import { useApp } from "../../state/store";
import { isFileUnsynced, runProjectFile, uploadFile } from "../../run/deviceSync";
import { baseName } from "../../project/format";
import { relDirname, relJoin } from "../../project/paths";
import { isRemoteFile } from "../../remote/layout";
import { isSceneFile } from "../../scene/project";
import { usePalette } from "../theme";
import { showAlert } from "../dialog";
import { downloadProjectFile } from "../actions";
import { openContextMenu } from "../components/menuStore";
import { InlineInput } from "../components/InlineInput";
import { useDeviceAvailability } from "../hooks/useDeviceAvailability";
import { useInlineRename } from "../hooks/useInlineRename";
import { EditorTab, TabLabel } from "./EditorTab";

/** Open files, then doc / example tabs. Double-click a file tab to rename it. */
export function TabBar() {
  const p = usePalette();
  const mfp = useApp((s) => s.mfp);
  const openFileIds = useApp((s) => s.openFileIds);
  const activeFileId = useApp((s) => s.activeFileId);
  const deviceName = useApp((s) => s.deviceName);
  const openFile = useApp((s) => s.openFile);
  const closeFile = useApp((s) => s.closeFile);
  const extraTabs = useApp((s) => s.extraTabs);
  const activeExtraTab = useApp((s) => s.activeExtraTab);
  const { canDevice, deviceHint } = useDeviceAvailability();

  const rename = useInlineRename<{ id: string; value: string }>(async (r, value) => {
    const f = useApp.getState().mfp.files.find((x) => x.id === r.id);
    if (!f || baseName(f.name) === value) return;
    const err = useApp.getState().renameFile(r.id, relJoin(relDirname(f.name), value));
    if (err) await showAlert("Can't rename", err);
  });

  const tabMenu = (e: React.MouseEvent, id: string) => {
    const f = mfp.files.find((x) => x.id === id);
    if (!f) return;
    openContextMenu(e, [
      !isRemoteFile(f.name) && !isSceneFile(f) && { label: "Run this file", icon: <Play size={13} />, disabled: !canDevice, hint: deviceHint, onSelect: () => runProjectFile(id) },
      { label: "Upload this file", icon: <Upload size={13} />, disabled: !canDevice, hint: deviceHint, onSelect: () => uploadFile(id) },
      "separator",
      { label: "Rename", icon: <Pencil size={13} />, onSelect: () => rename.start({ id, value: baseName(f.name) }) },
      { label: "Download", icon: <Download size={13} />, onSelect: () => downloadProjectFile(id) },
      "separator",
      { label: "Close", icon: <X size={13} />, onSelect: () => closeFile(id) },
      { label: "Close others", disabled: openFileIds.length <= 1, onSelect: () => useApp.getState().closeOtherFiles(id) },
      { label: "Close all", onSelect: () => useApp.getState().closeAllFiles() },
    ]);
  };

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
        const unsynced = isFileUnsynced(mfp, file, deviceName || undefined);
        const isRenaming = rename.renaming?.id === fileId;
        return (
          <EditorTab
            key={fileId}
            active={fileId === activeFileId && !activeExtraTab}
            title={`${file.name}${unsynced ? " · changed since last upload" : ""}`}
            dirty={unsynced}
            onClick={() => { if (!isRenaming) openFile(fileId); }}
            onClose={() => closeFile(fileId)}
            onDoubleClick={() => rename.start({ id: fileId, value: baseName(file.name) })}
            onContextMenu={(e) => tabMenu(e, fileId)}
          >
            {isRenaming && rename.inputProps ? <InlineInput {...rename.inputProps} /> : <TabLabel>{baseName(file.name)}</TabLabel>}
          </EditorTab>
        );
      })}
      {extraTabs.map((t) => {
        const close = () => useApp.getState().closeExtraTab(t.id);
        return (
          <EditorTab
            key={t.id}
            active={t.id === activeExtraTab}
            title={t.kind === "example" ? `Example preview (read-only): ${t.ref}` : `Docs: ${t.title}`}
            italic padLeft={9} gap={5}
            onClick={() => useApp.getState().openExtraTab(t)}
            onClose={close}
            onContextMenu={(e) => openContextMenu(e, [
              { label: "Close", icon: <X size={13} />, onSelect: close },
              { label: "Close others", disabled: extraTabs.length <= 1, onSelect: () => useApp.getState().closeOtherExtraTabs(t.id) },
            ])}
          >
            <span style={{ display: "inline-flex", color: p.dimText, flexShrink: 0 }}>{t.kind === "doc" ? <BookOpen size={12} /> : <Eye size={12} />}</span>
            <TabLabel>{t.title}</TabLabel>
          </EditorTab>
        );
      })}
    </div>
  );
}
