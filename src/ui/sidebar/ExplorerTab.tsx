import { useMemo, useState } from "react";
import {
  Blocks, ChevronDown, ChevronRight, Copy, Download, Ellipsis, FilePlus, Folder, FolderOpen, Gamepad2,
  FolderPlus, Import, Monitor, Pencil, Play, Trash2, Upload,
} from "lucide-react";
import { useApp } from "../../state/store";
import { isFileUnsynced, runProjectFile, uploadFile, uploadProject } from "../../run/deviceSync";
import { baseName, type ProjectFile } from "../../project/format";
import { relDirname, relJoin } from "../../project/paths";
import { isRemoteFile } from "../../remote/layout";
import { isSceneFile } from "../../scene/project";
import { usePalette } from "../theme";
import { showAlert } from "../dialog";
import {
  deleteFileFlow, deleteFolderFlow, downloadProjectFile, importFilesFromComputer, newFileFlow, newFolderFlow,
} from "../actions";
import { openContextMenu, openMenuAt, type MenuItem } from "../components/menuStore";
import { EmptyNote } from "../components/EmptyNote";
import { IconButton } from "../components/IconButton";
import { InlineInput } from "../components/InlineInput";
import { ListRow, RowIcon, RowLabel } from "../components/ListRow";
import { PanelHeader } from "../components/PanelHeader";
import { useDeviceAvailability } from "../hooks/useDeviceAvailability";
import { useInlineRename } from "../hooks/useInlineRename";
import { openRemoteController } from "../remote/actions";
import { newSceneFlow } from "../scene/actions";
import { FileIcon } from "./FileIcon";
import { buildTree, type DirNode, type TreeNode } from "./tree";

type Renaming = { kind: "file"; id: string; value: string } | { kind: "dir"; path: string; value: string };

export function ExplorerTab() {
  const p = usePalette();
  const mfp = useApp((s) => s.mfp);
  const hasRemote = mfp.files.some((f) => isRemoteFile(f.name));
  const activeFileId = useApp((s) => s.activeFileId);
  const openFileIds = useApp((s) => s.openFileIds);
  const deviceName = useApp((s) => s.deviceName);
  const openFile = useApp((s) => s.openFile);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { canDevice, deviceHint } = useDeviceAvailability();

  const tree = useMemo(() => buildTree(mfp.files, mfp.folders), [mfp.files, mfp.folders]);

  const rename = useInlineRename<Renaming>(async (r, value) => {
    const st = useApp.getState();
    let err: string | null = null;
    if (r.kind === "file") {
      const f = st.mfp.files.find((x) => x.id === r.id);
      if (!f || baseName(f.name) === value) return;
      err = st.renameFile(r.id, relJoin(relDirname(f.name), value));
    } else {
      if (baseName(r.path) === value) return;
      err = st.renameFolder(r.path, relJoin(relDirname(r.path), value));
    }
    if (err) await showAlert("Can't rename", err);
  });
  const { renaming } = rename;

  const backgroundItems = (dir = ""): MenuItem[] => [
    { label: "New Python file…", icon: <FilePlus size={13} />, onSelect: () => newFileFlow(dir, "python") },
    { label: "New Blocks file…", icon: <Blocks size={13} />, onSelect: () => newFileFlow(dir, "blocks") },
    { label: "New folder…", icon: <FolderPlus size={13} />, onSelect: () => newFolderFlow(dir) },
    { label: "New scene (screen layout)…", icon: <Monitor size={13} />, onSelect: () => void newSceneFlow(dir) },
    { label: hasRemote ? "Open remote controller" : "New remote controller", icon: <Gamepad2 size={13} />, onSelect: openRemoteController },
    { label: "Import files from computer…", icon: <Import size={13} />, onSelect: () => importFilesFromComputer(dir) },
  ];

  const projectItems = (): Array<MenuItem | false> => [
    "separator",
    { label: "Upload changed files", icon: <Upload size={13} />, disabled: !canDevice, hint: deviceHint, onSelect: () => uploadProject(mfp.id, "changed") },
    { label: "Upload all files", icon: <Upload size={13} />, disabled: !canDevice, hint: deviceHint, onSelect: () => uploadProject(mfp.id, "all") },
  ];

  const fileMenu = (e: React.MouseEvent, f: ProjectFile) => {
    openContextMenu(e, [
      { label: "Open", onSelect: () => openFile(f.id) },
      !isRemoteFile(f.name) && !isSceneFile(f) && { label: "Run this file", icon: <Play size={13} />, disabled: !canDevice, hint: deviceHint, onSelect: () => runProjectFile(f.id) },
      { label: "Upload this file", icon: <Upload size={13} />, disabled: !canDevice, hint: deviceHint, onSelect: () => uploadFile(f.id) },
      "separator",
      { label: "Rename", icon: <Pencil size={13} />, hint: "F2", onSelect: () => rename.start({ kind: "file", id: f.id, value: baseName(f.name) }) },
      { label: "Duplicate", icon: <Copy size={13} />, onSelect: () => useApp.getState().duplicateFile(f.id) },
      { label: "Download", icon: <Download size={13} />, onSelect: () => downloadProjectFile(f.id) },
      "separator",
      { label: "Delete", icon: <Trash2 size={13} />, danger: true, onSelect: () => deleteFileFlow(f.id) },
    ]);
  };

  const dirMenu = (e: React.MouseEvent, d: DirNode) => {
    openContextMenu(e, [
      ...backgroundItems(d.path),
      "separator",
      { label: "Rename", icon: <Pencil size={13} />, onSelect: () => rename.start({ kind: "dir", path: d.path, value: d.name }) },
      { label: "Delete", icon: <Trash2 size={13} />, danger: true, onSelect: () => deleteFolderFlow(d.path) },
    ]);
  };

  const toggle = (path: string) => setCollapsed((c) => {
    const n = new Set(c);
    if (n.has(path)) n.delete(path); else n.add(path);
    return n;
  });

  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((n) => {
      if (n.kind === "dir") {
        const isCollapsed = collapsed.has(n.path);
        const isRenaming = renaming?.kind === "dir" && renaming.path === n.path;
        return (
          <div key={"d:" + n.path}>
            <ListRow depth={depth} bar onClick={() => toggle(n.path)} onContextMenu={(e) => dirMenu(e, n)}>
              <RowIcon>{isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</RowIcon>
              <RowIcon>{isCollapsed ? <Folder size={13} /> : <FolderOpen size={13} />}</RowIcon>
              {isRenaming && rename.inputProps
                ? <InlineInput {...rename.inputProps} />
                : <RowLabel style={{ fontWeight: 600 }}>{n.name}</RowLabel>}
            </ListRow>
            {!isCollapsed && renderNodes(n.children, depth + 1)}
          </div>
        );
      }
      const f = n.file;
      const active = f.id === activeFileId;
      const isOpen = openFileIds.includes(f.id);
      const isRenaming = renaming?.kind === "file" && renaming.id === f.id;
      const unsynced = isFileUnsynced(mfp, f, deviceName || undefined);
      return (
        <ListRow
          key={f.id}
          depth={depth}
          bar
          active={active}
          tabIndex={0}
          title={f.name}
          onClick={() => openFile(f.id)}
          onKeyDown={(e) => {
            if (e.key === "F2") rename.start({ kind: "file", id: f.id, value: baseName(f.name) });
            if (e.key === "Enter") openFile(f.id);
            if (e.key === "Delete") void deleteFileFlow(f.id);
          }}
          onContextMenu={(e) => fileMenu(e, f)}
        >
          <RowIcon width={13} />
          <FileIcon file={f} />
          {isRenaming && rename.inputProps
            ? <InlineInput {...rename.inputProps} />
            : <RowLabel style={{ fontWeight: isOpen ? 600 : 400, opacity: isOpen ? 1 : 0.85 }}>{n.name}</RowLabel>}
          {unsynced && !isRenaming && (
            <span title="Changed since last upload" style={{ color: p.accent, fontSize: 9, lineHeight: "16px", flexShrink: 0 }}>●</span>
          )}
        </ListRow>
      );
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <PanelHeader title="Explorer" subtitle={mfp.title}>
        <IconButton title="More actions" onClick={(e) => openMenuAt(e.currentTarget, [...backgroundItems(), ...projectItems()])}>
          <Ellipsis size={15} />
        </IconButton>
      </PanelHeader>
      <div
        style={{ flex: 1, overflowY: "auto", paddingBottom: 24, color: p.text }}
        onContextMenu={(e) => openContextMenu(e, [...backgroundItems(), ...projectItems()])}
      >
        {tree.length === 0
          ? <EmptyNote>This project is empty. Right-click to create a file. Run needs a <code>main.py</code> at the top level.</EmptyNote>
          : renderNodes(tree, 0)}
      </div>
    </div>
  );
}
