// Store-internal helpers shared by the project and file slices.

import type { StoreApi } from "zustand";
import type { MultiFileProject } from "../../project/format";
import { deriveProject } from "../../project/ops";
import { loadProject, metaOf, saveProject, saveProjectIndex, type ProjectMeta } from "../../project/storage";
import type { AppState } from "./types";

export type SetState = StoreApi<AppState>["setState"];
export type GetState = StoreApi<AppState>["getState"];

/** Fresh state when a (different) project becomes active. */
export function activate(mfp: MultiFileProject) {
  const ids = new Set(mfp.files.map((f) => f.id));
  const openFileIds = mfp.openFileIds.filter((id) => ids.has(id));
  const activeFileId = ids.has(mfp.activeFileId) ? mfp.activeFileId : (openFileIds[0] ?? mfp.files[0]?.id ?? "");
  if (activeFileId && !openFileIds.includes(activeFileId)) openFileIds.push(activeFileId);
  return {
    mfp,
    openFileIds,
    activeFileId,
    project: deriveProject(mfp, activeFileId),
    pythonPreview: "",
    activeExtraTab: null,
  };
}

export function updateMeta(projects: ProjectMeta[], p: MultiFileProject): ProjectMeta[] {
  const m = metaOf(p);
  return projects.some((x) => x.id === p.id) ? projects.map((x) => (x.id === p.id ? m : x)) : [...projects, m];
}

export function projectHelpers(set: SetState, get: GetState) {
  return {
    /** Snapshot of the active project including live tab state. */
    snapshot: (): MultiFileProject => {
      const s = get();
      return { ...s.mfp, openFileIds: s.openFileIds, activeFileId: s.activeFileId };
    },

    /** Apply `fn` to a stored (non-active) project and save it. */
    mutateStored: (id: string, fn: (p: MultiFileProject) => MultiFileProject) => {
      const p = loadProject(id);
      if (!p) return;
      const next = fn(p);
      saveProject(next);
      set((s) => ({ projects: updateMeta(s.projects, next) }));
      saveProjectIndex(get().projects, get().mfp.id);
    },

    /** Replace the active project and re-derive the active file view. */
    setActiveFiles: (mfp: MultiFileProject, extra: Partial<AppState> = {}) =>
      set((s) => {
        const project = deriveProject(mfp, s.activeFileId);
        return { mfp, project, ...extra };
      }),
  };
}
