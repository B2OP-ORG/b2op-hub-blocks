import { create } from "zustand";
import type {
  AnyProject, ProjectSettings, EditorSettings, MultiFileProject, ProjectFile, FileMode, SidebarTabId,
} from "../project/format";
import {
  DEFAULT_SETTINGS, newBlocksProject, newMultiFileProject, fileToProject, withBlocksHeader, normalizeProject, hashContent,
} from "../project/format";
import {
  loadEditorSettings, saveEditorSettings, loadProject, saveProject, removeProject, saveProjectIndex,
  metaOf, loadSidebarLayout, saveSidebarLayout, type ProjectMeta,
} from "../project/storage";
import { ancestorDirs, isWithin, normalizeRelPath, relJoin, uniqueName } from "../project/paths";
import { sanitizeFilename } from "../utils/sanitize";
import type { DeviceClient } from "../device/deviceClient";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

interface ConsoleEntry {
  ts: number;
  text: string;
  kind: "out" | "err" | "info";
}

export interface TransferState {
  label: string;
  sent: number;
  total: number;
  startedAt: number;
  /** 1-based index of the current file within a multi-file transfer. */
  fileIndex?: number;
  fileCount?: number;
}

export interface NewFileInput {
  /** Project-relative path. */
  name: string;
  content: string;
  mode?: FileMode;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface AppState {
  // ── Projects ────────────────────────────────────────────────────────────
  /** Metadata of every stored project (the active one included). */
  projects: ProjectMeta[];
  /** Active project. `openFileIds`/`activeFileId` below are the live copies. */
  mfp: MultiFileProject;
  openFileIds: string[];
  activeFileId: string;

  // ── Derived from the active file ────────────────────────────────────────
  project: AnyProject;
  pythonPreview: string;

  // ── Device / connection ─────────────────────────────────────────────────
  device: DeviceClient | null;
  connection: ConnectionState;
  connectionError: string | null;
  running: boolean;
  console: ConsoleEntry[];
  boardName: string;
  boardVersion: string;
  fwVersion: string;
  deviceName: string;

  // ── Transfers ───────────────────────────────────────────────────────────
  transfer: TransferState | null;
  transferCancel: boolean;
  setTransfer: (t: TransferState | null) => void;
  cancelTransfer: () => void;

  // ── Sidebar UI state ────────────────────────────────────────────────────
  sidebarTab: SidebarTabId;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  setSidebarTab: (t: SidebarTabId) => void;
  /** Activate a tab and make sure the sidebar is expanded. */
  openSidebarTab: (t: SidebarTabId) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setSidebarWidth: (w: number) => void;

  // ── Live device state ───────────────────────────────────────────────────
  batteryMv: number;
  batteryPct: number;
  buttonState: Record<string, boolean>;
  orientation: { pitch: number; yaw: number; roll: number };
  sensorValues: Record<string, number[]>;
  deviceType: Record<string, number>;

  // ── File management (active project) ────────────────────────────────────
  openFile: (id: string) => void;
  closeFile: (id: string) => void;
  closeOtherFiles: (id: string) => void;
  closeAllFiles: () => void;
  updateFile: (id: string, content: string) => void;
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

  // ── Projects ────────────────────────────────────────────────────────────
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

  // ── Global ──────────────────────────────────────────────────────────────
  setDevice: (d: DeviceClient | null) => void;
  setConnection: (s: ConnectionState, err?: string) => void;
  setRunning: (r: boolean) => void;
  appendConsole: (kind: ConsoleEntry["kind"], text: string) => void;
  clearConsole: () => void;
  setBoardInfo: (name: string, version: string, fwVersion: string) => void;
  setDeviceName: (n: string) => void;

  editorSettings: EditorSettings;
  updateEditorSettings: (patch: Partial<EditorSettings>) => void;

  setBattery: (mv: number, pct: number) => void;
  setButtonState: (state: Record<string, boolean>) => void;
  setOrientation: (o: { pitch: number; yaw: number; roll: number }) => void;
  setSensorValue: (port: string, vals: number[]) => void;
  setDeviceType: (port: string, t: number) => void;
}

const MAX_CONSOLE = 500;

function deriveProject(mfp: MultiFileProject, activeFileId: string): AnyProject {
  const file = mfp.files.find((f) => f.id === activeFileId);
  if (!file) return { ...newBlocksProject(), settings: mfp.settings };
  return fileToProject(file, mfp.settings, mfp.createdAt);
}

function touch(mfp: MultiFileProject, patch: Partial<MultiFileProject>): MultiFileProject {
  return { ...mfp, ...patch, updatedAt: new Date().toISOString() };
}

/** Fresh state slice when a (different) project becomes active. */
function activate(mfp: MultiFileProject) {
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
  };
}

/** Add any ancestor folders of `paths` to the folder list. */
function withFolders(folders: string[], paths: string[]): string[] {
  const set = new Set(folders);
  for (const p of paths) for (const d of ancestorDirs(p)) set.add(d);
  return [...set].sort();
}

function pathTaken(mfp: MultiFileProject, path: string, exceptId?: string): boolean {
  const lower = path.toLowerCase();
  return mfp.files.some((f) => f.id !== exceptId && f.name.toLowerCase() === lower)
    || mfp.folders.some((d) => d.toLowerCase() === lower);
}

function mergeFiles(mfp: MultiFileProject, files: NewFileInput[], overwrite: boolean): { mfp: MultiFileProject; ids: string[] } {
  let next = { ...mfp, files: [...mfp.files] };
  const ids: string[] = [];
  for (const input of files) {
    const path = normalizeRelPath(input.name);
    if (!path) continue;
    const existing = next.files.findIndex((f) => f.name.toLowerCase() === path.toLowerCase());
    if (existing !== -1 && overwrite) {
      const f = { ...next.files[existing], content: input.content, mode: input.mode };
      next.files[existing] = f;
      ids.push(f.id);
      continue;
    }
    const finalPath = uniqueName(path, (c) => pathTaken(next, c));
    const file: ProjectFile = { id: crypto.randomUUID(), name: finalPath, content: input.content, mode: input.mode };
    next.files.push(file);
    ids.push(file.id);
  }
  next = touch(next, { folders: withFolders(next.folders, next.files.map((f) => f.name)) });
  return { mfp: next, ids };
}

const _initial = newMultiFileProject("My project");

export const useApp = create<AppState>((set, get) => {
  const sidebarLayout = loadSidebarLayout();
  const saveLayout = () => {
    const s = get();
    saveSidebarLayout({ activeTab: s.sidebarTab, collapsed: s.sidebarCollapsed, width: s.sidebarWidth });
  };

  /** Snapshot of the active project including live tab state. */
  const snapshot = (): MultiFileProject => {
    const s = get();
    return { ...s.mfp, openFileIds: s.openFileIds, activeFileId: s.activeFileId };
  };

  const updateMeta = (projects: ProjectMeta[], p: MultiFileProject): ProjectMeta[] => {
    const m = metaOf(p);
    return projects.some((x) => x.id === p.id) ? projects.map((x) => (x.id === p.id ? m : x)) : [...projects, m];
  };

  /** Apply `fn` to a stored (non-active) project and save it. */
  const mutateStored = (id: string, fn: (p: MultiFileProject) => MultiFileProject) => {
    const p = loadProject(id);
    if (!p) return;
    const next = fn(p);
    saveProject(next);
    set((s) => ({ projects: updateMeta(s.projects, next) }));
    saveProjectIndex(get().projects, get().mfp.id);
  };

  const setActiveFiles = (mfp: MultiFileProject, extra: Partial<AppState> = {}) =>
    set((s) => {
      const project = deriveProject(mfp, s.activeFileId);
      return { mfp, project, ...extra };
    });

  return {
    projects: [metaOf(_initial)],
    ...activate(_initial),

    device: null,
    connection: "disconnected",
    connectionError: null,
    running: false,
    console: [],
    boardName: "",
    boardVersion: "",
    fwVersion: "",
    deviceName: "",

    transfer: null,
    transferCancel: false,
    setTransfer: (transfer) => set(transfer ? { transfer } : { transfer: null, transferCancel: false }),
    cancelTransfer: () => set({ transferCancel: true }),

    sidebarTab: (["explorer", "projects", "sdcard", "device"] as const).includes(sidebarLayout.activeTab as SidebarTabId)
      ? (sidebarLayout.activeTab as SidebarTabId) : "explorer",
    sidebarCollapsed: sidebarLayout.collapsed,
    sidebarWidth: sidebarLayout.width,
    setSidebarTab: (sidebarTab) => { set({ sidebarTab }); saveLayout(); },
    openSidebarTab: (sidebarTab) => { set({ sidebarTab, sidebarCollapsed: false }); saveLayout(); },
    setSidebarCollapsed: (sidebarCollapsed) => { set({ sidebarCollapsed }); saveLayout(); },
    setSidebarWidth: (sidebarWidth) => { set({ sidebarWidth }); saveLayout(); },

    editorSettings: loadEditorSettings(),

    batteryMv: 0,
    batteryPct: 0,
    buttonState: {},
    orientation: { pitch: 0, yaw: 0, roll: 0 },
    sensorValues: {},
    deviceType: {},

    // ── File management ───────────────────────────────────────────────────────

    openFile: (id) => set((s) => {
      const file = s.mfp.files.find((f) => f.id === id);
      if (!file) return {};
      const openFileIds = s.openFileIds.includes(id) ? s.openFileIds : [...s.openFileIds, id];
      return { openFileIds, activeFileId: id, project: fileToProject(file, s.mfp.settings, s.mfp.createdAt), pythonPreview: "" };
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

    updateFile: (id, content) => {
      const s = get();
      const files = s.mfp.files.map((f) => (f.id === id ? { ...f, content } : f));
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
      const { mfp } = mergeFiles(s.mfp, [{ name: file.name, content: file.content, mode: file.mode }], false);
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

    // ── Projects ───────────────────────────────────────────────────────────────

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

    // ── Global ─────────────────────────────────────────────────────────────────

    setDevice: (device) => set({ device }),
    setConnection: (connection, err) => set({ connection, connectionError: err ?? null }),
    setBoardInfo: (boardName, boardVersion, fwVersion) => set({ boardName, boardVersion, fwVersion }),
    setDeviceName: (deviceName) => set({ deviceName }),
    setRunning: (running) => set({ running }),

    appendConsole: (kind, text) =>
      set((s) => {
        const next = s.console.length >= MAX_CONSOLE
          ? s.console.slice(s.console.length - MAX_CONSOLE + 1)
          : s.console.slice();
        next.push({ ts: Date.now(), kind, text });
        return { console: next };
      }),

    clearConsole: () => set({ console: [] }),

    updateEditorSettings: (patch) => set((s) => {
      const editorSettings = { ...s.editorSettings, ...patch };
      saveEditorSettings(editorSettings);
      return { editorSettings };
    }),

    setBattery: (batteryMv, batteryPct) => set({ batteryMv, batteryPct }),
    setButtonState: (buttonState) => set({ buttonState }),
    setOrientation: (orientation) => set({ orientation }),
    setSensorValue: (port, vals) => set((s) => ({ sensorValues: { ...s.sensorValues, [port]: vals } })),
    setDeviceType: (port, t) => set((s) => ({ deviceType: { ...s.deviceType, [port]: t } })),
  };
});

/** App-wide light/dark theme (a user setting, independent of the editor mode). */
export function useDark(): boolean {
  return useApp((s) => s.editorSettings.darkMode);
}

/**
 * True when a file's current content differs from what was last uploaded.
 * When `deviceName` is given and differs from the recorded device, every file counts as unsynced.
 */
export function isFileUnsynced(mfp: MultiFileProject, file: ProjectFile, deviceName?: string): boolean {
  if (!mfp.upload) return true;
  if (deviceName && mfp.upload.device !== deviceName) return true;
  const h = mfp.upload.hashes[file.name];
  return h === undefined || h !== hashContent(file.content);
}

export { DEFAULT_SETTINGS };
