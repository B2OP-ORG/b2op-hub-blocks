// Pure multi-file project operations (no store, no storage).

import { fileToProject, newBlocksProject, type AnyProject, type AssetRef, type FileMode, type MultiFileProject, type ProjectFile } from "./format";
import { ancestorDirs, normalizeRelPath, uniqueName } from "./paths";

export interface NewFileInput {
  /** Project-relative path. */
  name: string;
  content: string;
  mode?: FileMode;
  /** Binary file: bytes already in the asset store. */
  asset?: AssetRef;
}

/** Legacy single-file view of the active file (what the editors render). */
export function deriveProject(mfp: MultiFileProject, activeFileId: string): AnyProject {
  const file = mfp.files.find((f) => f.id === activeFileId);
  if (!file) return { ...newBlocksProject(), settings: mfp.settings };
  return fileToProject(file, mfp.settings, mfp.createdAt);
}

export function touch(mfp: MultiFileProject, patch: Partial<MultiFileProject>): MultiFileProject {
  return { ...mfp, ...patch, updatedAt: new Date().toISOString() };
}

/** Add any ancestor folders of `paths` to the folder list. */
export function withFolders(folders: string[], paths: string[]): string[] {
  const set = new Set(folders);
  for (const p of paths) for (const d of ancestorDirs(p)) set.add(d);
  return [...set].sort();
}

export function pathTaken(mfp: MultiFileProject, path: string, exceptId?: string): boolean {
  const lower = path.toLowerCase();
  return mfp.files.some((f) => f.id !== exceptId && f.name.toLowerCase() === lower)
    || mfp.folders.some((d) => d.toLowerCase() === lower);
}

export function mergeFiles(mfp: MultiFileProject, files: NewFileInput[], overwrite: boolean): { mfp: MultiFileProject; ids: string[] } {
  let next = { ...mfp, files: [...mfp.files] };
  const ids: string[] = [];
  for (const input of files) {
    const path = normalizeRelPath(input.name);
    if (!path) continue;
    const existing = next.files.findIndex((f) => f.name.toLowerCase() === path.toLowerCase());
    if (existing !== -1 && overwrite) {
      const f: ProjectFile = { ...next.files[existing], content: input.content, mode: input.mode, asset: input.asset };
      if (!f.asset) delete f.asset;
      next.files[existing] = f;
      ids.push(f.id);
      continue;
    }
    const finalPath = uniqueName(path, (c) => pathTaken(next, c));
    const file: ProjectFile = { id: crypto.randomUUID(), name: finalPath, content: input.content, mode: input.mode, ...(input.asset ? { asset: input.asset } : {}) };
    next.files.push(file);
    ids.push(file.id);
  }
  next = touch(next, { folders: withFolders(next.folders, next.files.map((f) => f.name)) });
  return { mfp: next, ids };
}
