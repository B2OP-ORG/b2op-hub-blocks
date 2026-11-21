import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Download, Eye, FilePlus, FileCode, Folder, FolderInput, FolderPlus } from "lucide-react";
import { useApp, EXAMPLE_PREVIEW_ID } from "../../state/store";
import { exampleDescription, fetchExample, pathInExample, type ExampleEntry } from "../../examples";
import { openContextMenu, type MenuItem } from "../components/menuStore";
import { ListRow, RowDetail, RowIcon, RowLabel } from "../components/ListRow";
import { usePalette } from "../theme";
import { addExampleToOtherProject, addExampleToProject, downloadExample, openExampleAsProject } from "../actions";

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

/** First docstring line of an example file (loaded lazily). */
function useDescription(path: string): string {
  const [d, setD] = useState("");
  useEffect(() => {
    let alive = true;
    fetchExample(path).then((t) => { if (alive) setD(exampleDescription(t)); }).catch(() => { /* none */ });
    return () => { alive = false; };
  }, [path]);
  return d;
}

/** One example (single file, or a folder that expands to its files). Click previews, right-click for actions. */
export function ExampleRow({ entry, previewRef }: { entry: ExampleEntry; previewRef: string | null }) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const mainFile = entry.files.find((f) => f.endsWith("/main.py")) ?? entry.files[0];
  const description = useDescription(mainFile);
  const active = !entry.folder && previewRef === entry.files[0];

  return (
    <>
      <ListRow
        title={entry.folder ? "Multi-file example · right-click for options" : `${entry.id} · right-click for options`}
        bar active={active} padY={5} padX={10} indent={16} gap={6}
        onClick={() => (entry.folder ? setOpen(!open) : previewExample(entry.files[0]))}
        onContextMenu={(e) => openContextMenu(e, menuFor(entry))}
      >
        <RowIcon top>
          {entry.folder ? (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <FileCode size={13} />}
        </RowIcon>
        <RowLabel>
          <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
            {entry.folder && <Folder size={13} color={p.dimText} />}{entry.title}
          </div>
          {description && <RowDetail>{description}</RowDetail>}
        </RowLabel>
      </ListRow>
      {open && entry.files.map((f) => (
        <ListRow key={f} depth={1} bar active={previewRef === f} padY={5} padX={10} indent={16} gap={6}
          onClick={() => previewExample(f)} onContextMenu={(e) => openContextMenu(e, menuFor(entry, f))}>
          <RowIcon top><FileCode size={13} /></RowIcon>
          <RowLabel>{pathInExample(entry, f)}</RowLabel>
        </ListRow>
      ))}
    </>
  );
}
