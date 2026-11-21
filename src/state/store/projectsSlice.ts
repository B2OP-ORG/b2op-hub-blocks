import type { StateCreator } from "zustand";
import { newMultiFileProject, normalizeProject, type AnyProject, type FileMode, type MultiFileProject } from "../../project/format";
import { mergeFiles, deriveProject, touch, type NewFileInput } from "../../project/ops";
import { loadProject, metaOf, removeProject, saveProject, saveProjectIndex, type ProjectMeta } from "../../project/storage";
import { sanitizeFilename } from "../../utils/sanitize";
import { activate, projectHelpers, updateMeta } from "./helpers";
import type { AppState } from "./types";

export interface ProjectsSlice {
  /** Metadata of every stored project (the active one included). */
  projects: ProjectMeta[];
  /** Active project. `openFileIds`/`activeFileId` below are the live copies. */
  mfp: MultiFileProject;
  openFileIds: string[];
  activeFileId: string;

  // ── Derived from the active file ────────────────────────────────────────
  project: AnyProject;
  pythonPreview: string;

  createProject: (title: string, kind: FileMode) => void;
  switchProject: (id: string) => void;
  renameProject: (id: string, title: string) => string | null;
  duplicateProject: (id: string) => void;
  deleteProject: (id: string) => void;
  /** Store a new project (title made unique). Returns its id. */
  importProject: (p: MultiFileProject, activate?: boolean) => string;
  /**
   * Add files to a project (active or stored). Existing paths are replaced when
   * `overwrite`, otherwise renamed with a suffix. Returns the ids of the added files.
   */
  addFilesToProject: (projectId: string, files: NewFileInput[], overwrite: boolean) => string[];
  /** Get a project by id: the live one if active, else from storage. */
  getProject: (id: string) => MultiFileProject | null;
  /** Update upload hashes for a project; `reset` drops existing hashes first. */
  recordUpload: (projectId: string, device: string, hashes: Record<string, string>, reset?: boolean) => void;
  /** Write the active project + index to localStorage. */
  persist: () => void;
  /** Title unique among projects by SD-folder name. */
  uniqueProjectTitle: (title: string, exceptId?: string) => string;
}

const _initial = newMultiFileProject("My project");

export const createProjectsSlice: StateCreator<AppState, [], [], ProjectsSlice> = (set, get) => {
  const { snapshot, mutateStored } = projectHelpers(set, get);

  return {
    projects: [metaOf(_initial)],
    ...activate(_initial),

    uniqueProjectTitle: (title, exceptId) => {
      const clean = title.trim() || "Untitled";
      const taken = (c: string) => get().projects.some((p) => p.id !== exceptId && sanitizeFilename(p.title) === sanitizeFilename(c));
      if (!taken(clean)) return clean;
      for (let n = 2; ; n++) {
        const c = `${clean} ${n}`;
        if (!taken(c)) return c;
      }
    },

    persist: () => {
      const snap = snapshot();
      saveProject(snap);
      const projects = updateMeta(get().projects, snap);
      set({ projects });
      saveProjectIndex(projects, snap.id);
    },

    createProject: (title, kind) => {
      const mfp = newMultiFileProject(get().uniqueProjectTitle(title), kind);
      get().importProject(mfp, true);
    },

    importProject: (p, activateIt = true) => {
      const norm = normalizeProject(p) ?? newMultiFileProject();
      const mfp = { ...norm, id: crypto.randomUUID(), title: get().uniqueProjectTitle(norm.title), upload: null };
      get().persist();
      saveProject(mfp);
      const projects = [...get().projects, metaOf(mfp)];
      if (activateIt) {
        set({ projects, ...activate(mfp) });
        saveProjectIndex(projects, mfp.id);
      } else {
        set({ projects });
        saveProjectIndex(projects, get().mfp.id);
      }
      return mfp.id;
    },

    switchProject: (id) => {
      if (id === get().mfp.id) return;
      const target = loadProject(id);
      if (!target) return;
      get().persist();
      set(activate(target));
      saveProjectIndex(get().projects, id);
    },

    renameProject: (id, title) => {
      const clean = title.trim();
      if (!clean) return "Name cannot be empty.";
      const unique = get().uniqueProjectTitle(clean, id);
      if (unique !== clean) return `A project whose folder name matches "${clean}" already exists.`;
      if (id === get().mfp.id) {
        // Upload hashes refer to the old SD folder; a rename means a fresh folder.
        set((s) => ({ mfp: touch(s.mfp, { title: clean, upload: null }) }));
        get().persist();
      } else {
        mutateStored(id, (p) => touch(p, { title: clean, upload: null }));
      }
      return null;
    },

    duplicateProject: (id) => {
      const src = get().getProject(id);
      if (!src) return;
      const idMap = new Map(src.files.map((f) => [f.id, crypto.randomUUID()]));
      const copy: MultiFileProject = {
        ...src,
        title: src.title + " copy",
        files: src.files.map((f) => ({ ...f, id: idMap.get(f.id)! })),
        openFileIds: src.openFileIds.map((x) => idMap.get(x)!).filter(Boolean),
        activeFileId: idMap.get(src.activeFileId) ?? "",
        createdAt: new Date().toISOString(),
      };
      get().importProject(copy, false);
    },

    deleteProject: (id) => {
      const s = get();
      removeProject(id);
      const projects = s.projects.filter((p) => p.id !== id);
      if (id !== s.mfp.id) {
        set({ projects });
        saveProjectIndex(projects, s.mfp.id);
        return;
      }
      const nextMeta = projects[0];
      const next = nextMeta ? loadProject(nextMeta.id) : null;
      if (next) {
        set({ projects, ...activate(next) });
        saveProjectIndex(projects, next.id);
      } else {
        const fresh = newMultiFileProject("My project");
        saveProject(fresh);
        const list = [metaOf(fresh)];
        set({ projects: list, ...activate(fresh) });
        saveProjectIndex(list, fresh.id);
      }
    },

    getProject: (id) => (id === get().mfp.id ? snapshot() : loadProject(id)),

    addFilesToProject: (projectId, files, overwrite) => {
      const s = get();
      if (projectId === s.mfp.id) {
        const { mfp, ids } = mergeFiles(s.mfp, files, overwrite);
        // Refresh the editor if the active file was overwritten.
        set({ mfp, project: deriveProject(mfp, s.activeFileId), pythonPreview: ids.includes(s.activeFileId) ? "" : s.pythonPreview });
        return ids;
      }
      let added: string[] = [];
      mutateStored(projectId, (p) => {
        const r = mergeFiles(p, files, overwrite);
        added = r.ids;
        return r.mfp;
      });
      return added;
    },

    recordUpload: (projectId, device, hashes, reset = false) => {
      const apply = (p: MultiFileProject): MultiFileProject => {
        const base = !reset && p.upload && p.upload.device === device ? p.upload.hashes : {};
        return { ...p, upload: { device, hashes: { ...base, ...hashes } } };
      };
      if (projectId === get().mfp.id) set((s) => ({ mfp: apply(s.mfp) }));
      else mutateStored(projectId, apply);
    },
  };
};
