import { useRef, useState } from "react";
import { BookOpen, Download, Eye, FileCode, Pencil, Play, Upload, X } from "lucide-react";
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
import { fileModeMenuItem } from "../editor/modeSwitch";
import { fileHasPythonPanel } from "./pythonPanel";
import { EditorTab, TabLabel } from "./EditorTab";
import { FileIcon } from "../sidebar/FileIcon";

const TAB_DND_TYPE = "application/x-b2op-editor-tab";
type TabGroup = "file" | "extra";
type DropSide = "before" | "after";

/** Drag-to-reorder within one tab group (files and doc / example tabs don't mix). */
function useTabReorder(onMove: (group: TabGroup, id: string, targetId: string, after: boolean) => void) {
  const dragging = useRef<{ group: TabGroup; id: string } | null>(null);
  const [drop, setDrop] = useState<{ group: TabGroup; id: string; side: DropSide } | null>(null);
  const end = () => { dragging.current = null; setDrop(null); };
  const sideAt = (e: React.DragEvent<HTMLDivElement>): DropSide => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX < r.left + r.width / 2 ? "before" : "after";
  };
  /** The drag in progress, if it's a tab from `group`. */
  const source = (e: React.DragEvent, group: TabGroup) => {
    const d = dragging.current;
    return d && d.group === group && e.dataTransfer.types.includes(TAB_DND_TYPE) ? d : null;
  };

  const handlers = (group: TabGroup, id: string) => ({
    onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
      dragging.current = { group, id };
      e.dataTransfer.setData(TAB_DND_TYPE, id);
      e.dataTransfer.effectAllowed = "move";
    },
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      const d = source(e, group);
      if (!d) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const side = sideAt(e);
      setDrop((prev) => (d.id === id ? null : prev?.group === group && prev.id === id && prev.side === side ? prev : { group, id, side }));
    },
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDrop((prev) => (prev?.group === group && prev.id === id ? null : prev));
    },
    onDrop: (e: React.DragEvent<HTMLDivElement>) => {
      const d = source(e, group);
      if (!d) return;
      e.preventDefault();
      onMove(group, d.id, id, sideAt(e) === "after");
      end();
    },
    onDragEnd: end,
  });
  const dropSide = (group: TabGroup, id: string) => (drop?.group === group && drop.id === id ? drop.side : undefined);
  return { handlers, dropSide };
}

/** Open files, then doc / example tabs. Double-click a file tab to rename it; drag a tab to reorder. */
export function TabBar() {
  const p = usePalette();
  const mfp = useApp((s) => s.mfp);
  const openFileIds = useApp((s) => s.openFileIds);
  const activeFileId = useApp((s) => s.activeFileId);
  const deviceName = useApp((s) => s.deviceName);
  const openFile = useApp((s) => s.openFile);
  const closeFile = useApp((s) => s.closeFile);
  const pyOpen = useApp((s) => s.pyPanel.open);
  const extraTabs = useApp((s) => s.extraTabs);
  const activeExtraTab = useApp((s) => s.activeExtraTab);
  const { canDevice, deviceHint } = useDeviceAvailability();
  const reorder = useTabReorder((group, id, targetId, after) => {
    const st = useApp.getState();
    if (group === "file") st.moveOpenFile(id, targetId, after);
    else st.moveExtraTab(id, targetId, after);
  });

  const rename = useInlineRename<{ id: string; value: string }>(async (r, value) => {
    const f = useApp.getState().mfp.files.find((x) => x.id === r.id);
    if (!f || baseName(f.name) === value) return;
    const err = useApp.getState().renameFile(r.id, relJoin(relDirname(f.name), value));
    if (err) await showAlert("Can't rename", err);
  });

  const tabMenu = (e: React.MouseEvent, id: string) => {
    const f = mfp.files.find((x) => x.id === id);
    if (!f) return;
    // The preview panel is shared by all editors; showing it from a background tab opens that tab too.
    const togglePython = () => {
      const st = useApp.getState();
      if (!pyOpen && (st.activeFileId !== id || st.activeExtraTab)) st.openFile(id);
      st.setPyPanel({ open: !pyOpen });
    };
    openContextMenu(e, [
      fileModeMenuItem(f),
      fileHasPythonPanel(f) && { label: pyOpen ? "Hide Python preview" : "Show Python preview", icon: <FileCode size={13} />, onSelect: togglePython },
      "separator",
      !isRemoteFile(f.name) && !isSceneFile(f) && !f.asset && { label: "Run this file", icon: <Play size={13} />, disabled: !canDevice, hint: deviceHint, onSelect: () => runProjectFile(id) },
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
            drag={isRenaming ? undefined : reorder.handlers("file", fileId)}
            dropSide={reorder.dropSide("file", fileId)}
          >
            <FileIcon file={file} size={12} />
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
            italic
            onClick={() => useApp.getState().openExtraTab(t)}
            onClose={close}
            drag={reorder.handlers("extra", t.id)}
            dropSide={reorder.dropSide("extra", t.id)}
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
