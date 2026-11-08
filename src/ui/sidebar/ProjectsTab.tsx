import { Copy, Download, Ellipsis, FolderOpen, Import, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useApp } from "../../state/store";
import { uploadProject, projectRoot } from "../../project/deviceSync";
import { openContextMenu, openMenuAt, type MenuItem } from "../ContextMenu";
import { usePalette } from "../theme";
import { deleteProjectFlow, downloadProjectZip, importZipFlow, newProjectFlow, renameProjectFlow } from "../actions";
import { IconButton, PanelHeader, wrapText } from "./common";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString();
}

export function ProjectsTab() {
  const p = usePalette();
  const projects = useApp((s) => s.projects);
  const mfp = useApp((s) => s.mfp);
  const activeId = mfp.id;
  const device = useApp((s) => s.device);
  const running = useApp((s) => s.running);
  const switchProject = useApp((s) => s.switchProject);

  const canDevice = !!device && !running;
  const deviceHint = !device ? "connect a hub" : running ? "program running" : undefined;

  // "Create / import" lives in its own menu, separate from per-project actions.
  const globalItems: MenuItem[] = [
    { label: "New project…", icon: <Plus size={13} />, onSelect: newProjectFlow },
    { label: "Import from .zip…", icon: <Import size={13} />, onSelect: importZipFlow },
  ];

  const projectMenu = (e: React.MouseEvent, id: string) => {
    openContextMenu(e, [
      { label: "Open", icon: <FolderOpen size={13} />, disabled: id === activeId, onSelect: () => { switchProject(id); useApp.getState().openSidebarTab("explorer"); } },
      { label: "Upload all", icon: <Upload size={13} />, disabled: !canDevice, hint: deviceHint, onSelect: () => uploadProject(id, "all") },
      { label: "Download as .zip", icon: <Download size={13} />, onSelect: () => downloadProjectZip(id) },
      "separator",
      { label: "Rename…", icon: <Pencil size={13} />, onSelect: () => renameProjectFlow(id) },
      { label: "Duplicate", icon: <Copy size={13} />, onSelect: () => useApp.getState().duplicateProject(id) },
      "separator",
      { label: "Delete…", icon: <Trash2 size={13} />, danger: true, onSelect: () => deleteProjectFlow(id) },
    ]);
  };

  // The active project's metadata is live; stored metadata only updates on save.
  const sorted = projects.map((m) => (m.id === activeId ? { ...m, title: mfp.title, fileCount: mfp.files.length, updatedAt: mfp.updatedAt } : m)).sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <PanelHeader title="Projects">
        <IconButton title="New project…" onClick={() => newProjectFlow()}><Plus size={15} /></IconButton>
        <IconButton title="More actions" onClick={(e) => openMenuAt(e.currentTarget, globalItems)}><Ellipsis size={15} /></IconButton>
      </PanelHeader>
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }} onContextMenu={(e) => openContextMenu(e, globalItems)}>
        {sorted.map((m) => {
          const active = m.id === activeId;
          return (
            <div
              key={m.id}
              title={`Uploads to ${projectRoot(m.title)}/`}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                background: active ? p.activeBg : "transparent",
                borderLeft: `2px solid ${active ? p.accent : "transparent"}`,
                userSelect: "none",
              }}
              onClick={() => switchProject(m.id)}
              onDoubleClick={() => useApp.getState().openSidebarTab("explorer")}
              onContextMenu={(e) => projectMenu(e, m.id)}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = p.hoverBg; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ ...wrapText, display: "block", fontWeight: active ? 700 : 500, fontSize: 13 }}>{m.title}</div>
              <div style={{ fontSize: 11, color: p.dimText, marginTop: 1 }}>
                {m.fileCount} file{m.fileCount === 1 ? "" : "s"} · {fmtDate(m.updatedAt)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
