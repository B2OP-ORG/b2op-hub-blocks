import type { ProjectFile } from "../../project/format";
import { usePalette, type Palette } from "../theme";
import { RowIcon } from "../components/ListRow";
import { fileKindByName, fileKindOf, FOLDER_KIND, type FileKind } from "./fileKind";

function kindColor(p: Palette, color: string): string {
  return color === "accent" ? p.accent : color === "dim" ? p.dimText : color;
}

function KindIcon({ kind, size }: { kind: FileKind; size: number }) {
  const p = usePalette();
  const Icon = kind.icon;
  return <RowIcon color={kindColor(p, kind.color)}><Icon size={size} /></RowIcon>;
}

/** Coloured icon for a project file: scene, blocks, Python, remote layout, image or other. */
export function FileIcon({ file, size = 13 }: { file: ProjectFile; size?: number }) {
  return <KindIcon kind={fileKindOf(file)} size={size} />;
}

/** Coloured icon for a device entry, resolved from its name. */
export function DeviceFileIcon({ name, isDir, size = 13 }: { name: string; isDir?: boolean; size?: number }) {
  return <KindIcon kind={isDir ? FOLDER_KIND : fileKindByName(name)} size={size} />;
}
