import type { AppState } from "../../state/store/types";
import { fileMode, type ProjectFile } from "../../project/format";
import { isRemoteFile } from "../../remote/layout";
import { isSceneFile } from "../../scene/project";

/** The active editor has a generated-Python panel: a blocks or scene file (not an extra tab). */
export function pythonPanelUsable(s: AppState): boolean {
  if (s.activeExtraTab) return false;
  const f = s.mfp.files.find((x) => x.id === s.activeFileId);
  if (!f || isRemoteFile(f.name)) return false;
  return isSceneFile(f) || s.project.type === "blocks";
}

/** `file`'s editor has a generated-Python panel (blocks or scene file). */
export function fileHasPythonPanel(file: ProjectFile): boolean {
  if (isRemoteFile(file.name) || file.asset) return false;
  return isSceneFile(file) || (/\.py$/i.test(file.name) && fileMode(file) === "blocks");
}

/** Width of the separator between the editor and the Python panel. */
export const PY_SEPARATOR = 3;
