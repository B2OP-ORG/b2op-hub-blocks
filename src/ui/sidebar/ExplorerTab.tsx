import { useMemo, useState } from "react";
import {
  Blocks, ChevronDown, ChevronRight, Copy, Download, Ellipsis, File, FileCode, FilePlus, Folder, FolderOpen,
  FolderPlus, Import, Pencil, Play, Trash2, Upload,
} from "lucide-react";
import { useApp, isFileUnsynced } from "../../state/store";
import { baseName, fileMode, type ProjectFile } from "../../project/format";
import { relDirname, relJoin } from "../../project/paths";
import { runProjectFile, uploadFile, uploadProject } from "../../project/deviceSync";
import { openContextMenu, openMenuAt, type MenuItem } from "../ContextMenu";
import { usePalette } from "../theme";
import { showAlert } from "../Dialog";
import {
  deleteFileFlow, deleteFolderFlow, downloadProjectFile, importFilesFromComputer, newFileFlow, newFolderFlow,
} from "../actions";
import { EmptyNote, IconButton, InlineInput, PanelHeader, wrapText } from "./common";

interface DirNode { kind: "dir"; path: string; name: string; children: TreeNode[] }
interface FileNode { kind: "file"; file: ProjectFile; name: string }
type TreeNode = DirNode | FileNode;

function buildTree(files: ProjectFile[], folders: string[]): TreeNode[] {
  const root: DirNode = { kind: "dir", path: "", name: "", children: [] };
  const dirs = new Map<string, DirNode>([["", root]]);
  const ensureDir = (path: string): DirNode => {
    const existing = dirs.get(path);
    if (existing) return existing;
    const parent = ensureDir(relDirname(path));
    const node: DirNode = { kind: "dir", path, name: baseName(path), children: [] };
    parent.children.push(node);
    dirs.set(path, node);
    return node;
  };
  for (const d of folders) ensureDir(d);
  for (const f of files) ensureDir(relDirname(f.name)).children.push({ kind: "file", file: f, name: baseName(f.name) });
  const sort = (n: DirNode) => {
    n.children.sort((a, b) => (a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true })));
    n.children.forEach((c) => c.kind === "dir" && sort(c));
  };
  sort(root);
  return root.children;
}

type Renaming = { kind: "file"; id: string; value: string } | { kind: "dir"; path: string; value: string } | null;

export function ExplorerTab() {
  const p = usePalette();
  const mfp = useApp((s) => s.mfp);
  const activeFileId = useApp((s) => s.activeFileId);
  const openFileIds = useApp((s) => s.openFileIds);
  const device = useApp((s) => s.device);
  const running = useApp((s) => s.running);
  const deviceName = useApp((s) => s.deviceName);
  const openFile = useApp((s) => s.openFile);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<Renaming>(null);

  const tree = useMemo(() => buildTree(mfp.files, mfp.folders), [mfp.files, mfp.folders]);
  const canDevice = !!device && !running;
  const deviceHint = !device ? "connect a hub" : running ? "program running" : undefined;

  const commitRename = async () => {
    const r = renaming;
    if (!r) return;
    setRenaming(null);
    const value = r.value.trim();
    if (!value) return;
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
  };

  const backgroundItems = (dir = ""): MenuItem[] => [
    { label: "New Python file…", icon: <FilePlus size={13} />, onSelect: () => newFileFlow(dir, "python") },
    { label: "New Blocks file…", icon: <Blocks size={13} />, onSelect: () => newFileFlow(dir, "blocks") },
    { label: "New folder…", icon: <FolderPlus size={13} />, onSelect: () => newFolderFlow(dir) },
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
      { label: "Run this file", icon: <Play size={13} />, disabled: !canDevice, hint: deviceHint, onSelect: () => runProjectFile(f.id) },
      { label: "Upload this file", icon: <Upload size={13} />, disabled: !canDevice, hint: deviceHint, onSelect: () => uploadFile(f.id) },
      "separator",
      { label: "Rename", icon: <Pencil size={13} />, hint: "F2", onSelect: () => setRenaming({ kind: "file", id: f.id, value: baseName(f.name) }) },
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
      { label: "Rename", icon: <Pencil size={13} />, onSelect: () => setRenaming({ kind: "dir", path: d.path, value: d.name }) },
      { label: "Delete", icon: <Trash2 size={13} />, danger: true, onSelect: () => deleteFolderFlow(d.path) },
    ]);
  };

  const toggle = (path: string) => setCollapsed((c) => {
    const n = new Set(c);
    if (n.has(path)) n.delete(path); else n.add(path);
    return n;
  });

  const rowBase = (depth: number, active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 5,
    padding: `3px 8px 3px ${8 + depth * 12}px`,
    background: active ? p.activeBg : "transparent",
    color: p.text,
    cursor: "pointer",
    borderLeft: `2px solid ${active ? p.accent : "transparent"}`,
    userSelect: "none",
  });

  const iconWrap: React.CSSProperties = { display: "inline-flex", alignItems: "center", height: 16, flexShrink: 0, color: p.dimText };

  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((n) => {
      if (n.kind === "dir") {
        const isCollapsed = collapsed.has(n.path);
        const isRenaming = renaming?.kind === "dir" && renaming.path === n.path;
        return (
          <div key={"d:" + n.path}>
            <div
              style={rowBase(depth, false)}
              onClick={() => toggle(n.path)}
              onContextMenu={(e) => dirMenu(e, n)}
              onMouseEnter={(e) => { e.currentTarget.style.background = p.hoverBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={iconWrap}>{isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</span>
              <span style={iconWrap}>{isCollapsed ? <Folder size={13} /> : <FolderOpen size={13} />}</span>
              {isRenaming
                ? <InlineInput value={renaming.value} onChange={(v) => setRenaming({ ...renaming, value: v })} onCommit={commitRename} onCancel={() => setRenaming(null)} />
                : <span style={{ ...wrapText, fontWeight: 600 }}>{n.name}</span>}
            </div>
            {!isCollapsed && renderNodes(n.children, depth + 1)}
          </div>
        );
      }
      const f = n.file;
      const active = f.id === activeFileId;
      const isOpen = openFileIds.includes(f.id);
      const isRenaming = renaming?.kind === "file" && renaming.id === f.id;
      const unsynced = isFileUnsynced(mfp, f, deviceName || undefined);
      const mode = /\.pyi?$/i.test(f.name) ? fileMode(f) : null;
      return (
        <div
          key={f.id}
          tabIndex={0}
          style={rowBase(depth, active)}
          title={f.name}
          onClick={() => openFile(f.id)}
          onKeyDown={(e) => {
            if (e.key === "F2") setRenaming({ kind: "file", id: f.id, value: baseName(f.name) });
            if (e.key === "Enter") openFile(f.id);
            if (e.key === "Delete") void deleteFileFlow(f.id);
          }}
          onContextMenu={(e) => fileMenu(e, f)}
          onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = p.hoverBg; }}
          onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
        >
          <span style={{ ...iconWrap, width: 13 }} />
          <span style={{ ...iconWrap, color: mode === "blocks" ? "#d97706" : mode === "python" ? p.accent : p.dimText }}>
            {mode === "blocks" ? <Blocks size={13} /> : mode === "python" ? <FileCode size={13} /> : <File size={13} />}
          </span>
          {isRenaming
            ? <InlineInput value={renaming.value} onChange={(v) => setRenaming({ ...renaming, value: v })} onCommit={commitRename} onCancel={() => setRenaming(null)} />
            : <span style={{ ...wrapText, fontWeight: isOpen ? 600 : 400, opacity: isOpen ? 1 : 0.85 }}>{n.name}</span>}
          {unsynced && !isRenaming && (
            <span title="Changed since last upload" style={{ color: p.accent, fontSize: 9, lineHeight: "16px", flexShrink: 0 }}>●</span>
          )}
        </div>
      );
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <PanelHeader title="Explorer" subtitle={mfp.title}>
        <IconButton
          title="More actions"
          onClick={(e) => openMenuAt(e.currentTarget, [...backgroundItems(), ...projectItems()])}
        >
          <Ellipsis size={15} />
        </IconButton>
      </PanelHeader>
      <div
        style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}
        onContextMenu={(e) => openContextMenu(e, [...backgroundItems(), ...projectItems()])}
      >
        {tree.length === 0
          ? <EmptyNote>This project is empty. Right-click to create a file. Run needs a <code>main.py</code> at the top level.</EmptyNote>
          : renderNodes(tree, 0)}
      </div>
    </div>
  );
}
