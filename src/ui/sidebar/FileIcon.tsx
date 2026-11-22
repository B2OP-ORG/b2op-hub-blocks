import { Blocks, File, FileCode, FileImage, Gamepad2, Monitor } from "lucide-react";
import { fileMode, type ProjectFile } from "../../project/format";
import { isRemoteFile } from "../../remote/layout";
import { isSceneFile } from "../../scene/project";
import { usePalette } from "../theme";
import { RowIcon } from "../components/ListRow";

/** Coloured icon for a project file: scene, blocks, Python, remote layout or other. */
export function FileIcon({ file }: { file: ProjectFile }) {
  const p = usePalette();
  if (file.asset) return <RowIcon color="#0d9488"><FileImage size={13} /></RowIcon>;
  const scene = isSceneFile(file);
  const mode = !scene && /\.pyi?$/i.test(file.name) ? fileMode(file) : null;
  const remote = isRemoteFile(file.name);
  const color = scene ? "#7c3aed" : mode === "blocks" ? "#d97706" : mode === "python" ? p.accent : remote ? "#db2777" : p.dimText;
  return (
    <RowIcon color={color}>
      {scene ? <Monitor size={13} /> : mode === "blocks" ? <Blocks size={13} /> : mode === "python" ? <FileCode size={13} /> : remote ? <Gamepad2 size={13} /> : <File size={13} />}
    </RowIcon>
  );
}
