import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Download, Eye, FilePlus, FileCode, Folder, FolderInput, FolderPlus } from "lucide-react";
import { useApp, EXAMPLE_PREVIEW_ID } from "../../state/store";
import { EXAMPLES, exampleDescription, fetchExample, pathInExample, type ExampleEntry } from "../../examples";
import { openContextMenu, type MenuItem } from "../ContextMenu";
import { usePalette } from "../theme";
import { addExampleToOtherProject, addExampleToProject, downloadExample, openExampleAsProject } from "../actions";
import { EmptyNote, PanelHeader, wrapText } from "./common";

function previewExample(path: string) {
  useApp.getState().openExtraTab({ id: EXAMPLE_PREVIEW_ID, kind: "example", title: path.split("/").pop()!, ref: path });
}

function menuFor(entry: ExampleEntry, file?: string): MenuItem[] {
  const previewPath = file ?? entry.files.find((f) => f.endsWith("/main.py")) ?? entry.files[0];
  return [
    { label: "Preview", icon: <Eye size={13} />, onSelect: () => previewExample(previewPath) },
    "separator",
    { label: entry.folder ? "Open as new project" : "Open as new project (as main.py)", icon: <FolderPlus size={13} />, onSelect: () => openExampleAsProject(entry) },
    { label: entry.folder ? "Add files to current project" : "Add to current project", icon: <FilePlus size={13} />, onSelect: () => addExampleToProject(entry) },
    { label: "Add to another project…", icon: <FolderInput size={13} />, onSelect: () => addExampleToOtherProject(entry) },
    "separator",
    { label: "Copy code", icon: <Copy size={13} />, onSelect: async () => { await navigator.clipboard?.writeText(await fetchExample(previewPath)); } },
    { label: entry.folder && !file ? "Download as .zip" : "Download", icon: <Download size={13} />, onSelect: () => downloadExample(entry, file) },
  ];
}

function useDescription(path: string): string {
  const [d, setD] = useState("");
  useEffect(() => {
    let alive = true;
    fetchExample(path).then((t) => { if (alive) setD(exampleDescription(t)); }).catch(() => { /* none */ });
    return () => { alive = false; };
  }, [path]);
  return d;
}

function ExampleRow({ entry, previewRef }: { entry: ExampleEntry; previewRef: string | null }) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const mainFile = entry.files.find((f) => f.endsWith("/main.py")) ?? entry.files[0];
  const description = useDescription(mainFile);
  const active = !entry.folder && previewRef === entry.files[0];

  const rowStyle = (isActive: boolean, depth: number): React.CSSProperties => ({
    display: "flex", gap: 6, alignItems: "flex-start", padding: `5px 10px 5px ${10 + depth * 16}px`, cursor: "pointer", userSelect: "none",
    background: isActive ? p.activeBg : "transparent", borderLeft: `2px solid ${isActive ? p.accent : "transparent"}`,
  });
  const hover = (isActive: boolean) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => { if (!isActive) e.currentTarget.style.background = p.hoverBg; },
    onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => { if (!isActive) e.currentTarget.style.background = "transparent"; },
  });

  return (
    <>
      <div
        title={entry.folder ? "Multi-file example · right-click for options" : `${entry.id} · right-click for options`}
        style={rowStyle(active, 0)}
        onClick={() => (entry.folder ? setOpen(!open) : previewExample(entry.files[0]))}
        onContextMenu={(e) => openContextMenu(e, menuFor(entry))}
        {...hover(active)}
      >
        <span style={{ display: "inline-flex", paddingTop: 2, color: p.dimText, flexShrink: 0 }}>
          {entry.folder ? (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <FileCode size={13} />}
        </span>
        <div style={{ ...wrapText }}>
          <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
            {entry.folder && <Folder size={13} color={p.dimText} />}{entry.title}
          </div>
          {description && <div style={{ fontSize: 11, color: p.dimText, marginTop: 1 }}>{description}</div>}
        </div>
      </div>
      {open && entry.files.map((f) => {
        const isActive = previewRef === f;
        return (
          <div key={f} style={rowStyle(isActive, 1)} onClick={() => previewExample(f)} onContextMenu={(e) => openContextMenu(e, menuFor(entry, f))} {...hover(isActive)}>
            <span style={{ display: "inline-flex", paddingTop: 2, color: p.dimText, flexShrink: 0 }}><FileCode size={13} /></span>
            <span style={wrapText}>{pathInExample(entry, f)}</span>
          </div>
        );
      })}
    </>
  );
}

export function ExamplesTab() {
  const previewRef = useApp((s) => (s.activeExtraTab === EXAMPLE_PREVIEW_ID ? s.extraTabs.find((t) => t.id === EXAMPLE_PREVIEW_ID)?.ref ?? null : null));
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <PanelHeader title="Examples" />
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>
        {EXAMPLES.length === 0
          ? <EmptyNote>No examples found.</EmptyNote>
          : <>
              <EmptyNote>Click an example to look at its code. Right-click to open it as a project or add it to yours.</EmptyNote>
              {EXAMPLES.map((e) => <ExampleRow key={e.id} entry={e} previewRef={previewRef} />)}
            </>}
      </div>
    </div>
  );
}
