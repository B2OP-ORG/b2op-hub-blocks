import type { StateCreator } from "zustand";
import { fileToProject, newBlocksProject, withBlocksHeader, type AssetRef, type FileMode, type ProjectFile, type ProjectSettings } from "../../project/format";
import { deriveProject, mergeFiles, pathTaken, touch, withFolders } from "../../project/ops";
import { isWithin, normalizeRelPath, relJoin, uniqueName } from "../../project/paths";
import { projectHelpers, reorder } from "./helpers";
import type { AppState } from "./types";

/** File management inside the active project. */
export interface FilesSlice {
  openFile: (id: string) => void;
  closeFile: (id: string) => void;
  closeOtherFiles: (id: string) => void;
  closeAllFiles: () => void;
  /** Reorder open file tabs: move `id` before (or `after`) `targetId`. */
  moveOpenFile: (id: string, targetId: string, after: boolean) => void;
  updateFile: (id: string, content: string) => void;
  /** Replace a binary file's bytes reference (image re-rendered by crop / resize). */
  setFileAsset: (id: string, asset: AssetRef) => void;
  /** Rename/move a file to a new project-relative path. Returns an error message or null. */
  renameFile: (id: string, newPath: string) => string | null;
  /** Create a file (unique name in `dir`) and open it. Returns its id. */
  newFile: (dir?: string, name?: string, kind?: FileMode) => string;
  duplicateFile: (id: string) => void;
  deleteFile: (id: string) => void;
  newFolder: (path: string) => string | null;
  renameFolder: (oldPath: string, newPath: string) => string | null;
  deleteFolder: (path: string) => void;
  setFileMode: (id: string, mode: FileMode, content: string) => void;

  // ── Blocks content update (workspace + generated python together) ────────
  setBlocksContent: (workspace: unknown, python: string) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;
}

export const createFilesSlice: StateCreator<AppState, [], [], FilesSlice> = (set, get) => {
  const { setActiveFiles } = projectHelpers(set, get);

  return {
    openFile: (id) => set((s) => {
      const file = s.mfp.files.find((f) => f.id === id);
      if (!file) return {};
      const openFileIds = s.openFileIds.includes(id) ? s.openFileIds : [...s.openFileIds, id];
      return { openFileIds, activeFileId: id, activeExtraTab: null, project: fileToProject(file, s.mfp.settings, s.mfp.createdAt), pythonPreview: "" };
    }),

    closeFile: (id) => set((s) => {
      const openFileIds = s.openFileIds.filter((x) => x !== id);
      if (s.activeFileId !== id) return { openFileIds };
      const idx = s.openFileIds.indexOf(id);
      const activeFileId = openFileIds[Math.min(idx, openFileIds.length - 1)] ?? "";
      return { openFileIds, activeFileId, project: deriveProject(s.mfp, activeFileId), pythonPreview: "" };
    }),

    closeOtherFiles: (id) => set((s) => {
      if (!s.mfp.files.some((f) => f.id === id)) return {};
      return { openFileIds: [id], activeFileId: id, project: deriveProject(s.mfp, id), pythonPreview: s.activeFileId === id ? s.pythonPreview : "" };
    }),

    closeAllFiles: () => set((s) => ({ openFileIds: [], activeFileId: "", project: deriveProject(s.mfp, ""), pythonPreview: "" })),

    moveOpenFile: (id, targetId, after) => set((s) => {
      const openFileIds = reorder(s.openFileIds, (x) => x, id, targetId, after);
      return openFileIds === s.openFileIds ? {} : { openFileIds };
    }),

    updateFile: (id, content) => {
      const s = get();
      const files = s.mfp.files.map((f) => (f.id === id ? { ...f, content } : f));
      setActiveFiles(touch(s.mfp, { files }));
    },

    setFileAsset: (id, asset) => {
      const s = get();
      const files = s.mfp.files.map((f) => (f.id === id ? { ...f, asset } : f));
      setActiveFiles(touch(s.mfp, { files }));
    },

    renameFile: (id, newPath) => {
      const s = get();
      const file = s.mfp.files.find((f) => f.id === id);
      if (!file) return "File not found.";
      const path = normalizeRelPath(newPath);
      if (!path) return "Invalid name.";
      if (path === file.name) return null;
      if (pathTaken(s.mfp, path, id)) return `"${path}" already exists.`;
      const files = s.mfp.files.map((f) => (f.id === id ? { ...f, name: path } : f));
      setActiveFiles(touch(s.mfp, { files, folders: withFolders(s.mfp.folders, [path]) }));
      return null;
    },

    newFile: (dir = "", name, kind = "python") => {
      const s = get();
      const base = normalizeRelPath(relJoin(dir, name ?? "untitled.py")) ?? "untitled.py";
      const finalName = uniqueName(base, (c) => pathTaken(s.mfp, c));
      const file: ProjectFile = kind === "blocks"
        ? { id: crypto.randomUUID(), name: finalName, content: withBlocksHeader(newBlocksProject().workspace, ""), mode: "blocks" }
        : { id: crypto.randomUUID(), name: finalName, content: "", mode: "python" };
      const mfp = touch(s.mfp, { files: [...s.mfp.files, file], folders: withFolders(s.mfp.folders, [finalName]) });
      set({
        mfp,
        openFileIds: [...s.openFileIds, file.id],
        activeFileId: file.id,
        project: fileToProject(file, mfp.settings, mfp.createdAt),
        pythonPreview: "",
      });
      return file.id;
    },

    duplicateFile: (id) => {
      const s = get();
      const file = s.mfp.files.find((f) => f.id === id);
      if (!file) return;
      const { mfp } = mergeFiles(s.mfp, [{ name: file.name, content: file.content, mode: file.mode, asset: file.asset }], false);
      setActiveFiles(mfp);
    },

    deleteFile: (id) => set((s) => {
      const files = s.mfp.files.filter((f) => f.id !== id);
      const mfp = touch(s.mfp, { files });
      const openFileIds = s.openFileIds.filter((x) => x !== id);
      const activeFileId = s.activeFileId === id ? (openFileIds[openFileIds.length - 1] ?? "") : s.activeFileId;
      return { mfp, openFileIds, activeFileId, project: deriveProject(mfp, activeFileId), pythonPreview: s.activeFileId === id ? "" : s.pythonPreview };
    }),

    newFolder: (path) => {
      const s = get();
      const p = normalizeRelPath(path);
      if (!p) return "Invalid folder name.";
      if (pathTaken(s.mfp, p)) return `"${p}" already exists.`;
      setActiveFiles(touch(s.mfp, { folders: withFolders([...s.mfp.folders, p], [p]) }));
      return null;
    },

    renameFolder: (oldPath, newPath) => {
      const s = get();
      const to = normalizeRelPath(newPath);
      if (!to) return "Invalid folder name.";
      if (to === oldPath) return null;
      if (isWithin(to, oldPath)) return "Cannot move a folder into itself.";
      if (pathTaken(s.mfp, to)) return `"${to}" already exists.`;
      const move = (p: string) => (isWithin(p, oldPath) ? to + p.slice(oldPath.length) : p);
      const files = s.mfp.files.map((f) => ({ ...f, name: move(f.name) }));
      const folders = withFolders([...s.mfp.folders.map(move), to], files.map((f) => f.name));
      setActiveFiles(touch(s.mfp, { files, folders }));
      return null;
    },

    deleteFolder: (path) => set((s) => {
      const removed = new Set(s.mfp.files.filter((f) => isWithin(f.name, path)).map((f) => f.id));
      const files = s.mfp.files.filter((f) => !removed.has(f.id));
      const folders = s.mfp.folders.filter((d) => !isWithin(d, path));
      const mfp = touch(s.mfp, { files, folders });
      const openFileIds = s.openFileIds.filter((x) => !removed.has(x));
      const activeFileId = removed.has(s.activeFileId) ? (openFileIds[openFileIds.length - 1] ?? "") : s.activeFileId;
      return { mfp, openFileIds, activeFileId, project: deriveProject(mfp, activeFileId), pythonPreview: removed.has(s.activeFileId) ? "" : s.pythonPreview };
    }),

    setFileMode: (id, mode, content) => {
      const s = get();
      const files = s.mfp.files.map((f) => (f.id === id ? { ...f, mode, content } : f));
      setActiveFiles(touch(s.mfp, { files }), { pythonPreview: "" });
    },

    setBlocksContent: (workspace, python) => {
      const s = get();
      const id = s.activeFileId;
      const file = s.mfp.files.find((f) => f.id === id);
      if (!file) return;
      const content = withBlocksHeader(workspace, python);
      if (content === file.content) {
        if (s.pythonPreview !== python) set({ pythonPreview: python });
        return;
      }
      const files = s.mfp.files.map((f) => (f.id === id ? { ...f, content } : f));
      setActiveFiles(touch(s.mfp, { files }), { pythonPreview: python });
    },

    updateSettings: (patch) => {
      const s = get();
      setActiveFiles(touch(s.mfp, { settings: { ...s.mfp.settings, ...patch } }));
    },
  };
};
