import { create } from "zustand";
import type { AnyProject, ProjectSettings, EditorSettings, MultiFileProject, ProjectFile } from "../project/format";
import {
  DEFAULT_SETTINGS, newBlocksProject, newMultiFileProject,
  fileToProject, projectToFileContent,
} from "../project/format";
import { loadEditorSettings, saveEditorSettings } from "../project/storage";
import type { DeviceClient } from "../device/deviceClient";
import { sanitizeFilename } from "../utils/sanitize";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

interface ConsoleEntry {
  ts: number;
  text: string;
  kind: "out" | "err" | "info";
}

// ── Legacy Tab type kept for storage.ts compat ───────────────────────────────

export interface Tab {
  id: string;
  project: AnyProject;
  savedSnapshot: string;
  devicePath?: string;
  pythonPreview: string;
}

export function makeTab(project: AnyProject, devicePath?: string): Tab {
  return {
    id: crypto.randomUUID(),
    project,
    savedSnapshot: JSON.stringify(project),
    devicePath,
    pythonPreview: "",
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface AppState {
  // ── Multi-file project ──────────────────────────────────────────────────
  mfp: MultiFileProject;
  openFileIds: string[];
  activeFileId: string;
  savedSnapshot: string; // JSON.stringify(mfp) at last save

  // ── Derived / compat shims (updated whenever activeFileId/mfp changes) ──
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

  // ── UI panel state ──────────────────────────────────────────────────────
  replOpen: boolean;
  devicePanelOpen: boolean;

  // ── Live device state ───────────────────────────────────────────────────
  batteryMv: number;
  batteryPct: number;
  buttonState: Record<string, boolean>;
  orientation: { pitch: number; yaw: number; roll: number };
  sensorValues: Record<string, number[]>;
  deviceType: Record<string, number>;

  // ── File management ─────────────────────────────────────────────────────
  openFile: (id: string) => void;
  closeFile: (id: string) => void;
  updateFile: (id: string, content: string) => void;
  renameFile: (id: string, name: string) => void;
  newFile: (name?: string) => void;
  deleteFile: (id: string) => void;

  // ── Blocks content update (workspace + generated python together) ────────
  setBlocksContent: (workspace: unknown, python: string) => void;

  // ── Compat shims (keep existing call sites working) ─────────────────────
  // These map to the active file's content
  setProject: (p: AnyProject) => void;
  loadProject: (p: AnyProject) => void;
  markSaved: () => void;
  setPythonPreview: (s: string) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;

  // Legacy tab API (used by FileBrowserModal, TabBar, App restore)
  tabs: Tab[];
  activeTabId: string;
  openTab: (project: AnyProject, devicePath?: string) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  renameTab: (id: string, title: string) => void;

  // ── Global ──────────────────────────────────────────────────────────────
  setDevice: (d: DeviceClient | null) => void;
  setConnection: (s: ConnectionState, err?: string) => void;
  setRunning: (r: boolean) => void;
  appendConsole: (kind: ConsoleEntry["kind"], text: string) => void;
  clearConsole: () => void;
  setBoardInfo: (name: string, version: string, fwVersion: string) => void;

  editorSettings: EditorSettings;
  updateEditorSettings: (patch: Partial<EditorSettings>) => void;

  setReplOpen: (v: boolean) => void;
  setDevicePanelOpen: (v: boolean) => void;
  setBattery: (mv: number, pct: number) => void;
  setButtonState: (state: Record<string, boolean>) => void;
  setOrientation: (o: { pitch: number; yaw: number; roll: number }) => void;
  setSensorValue: (port: string, vals: number[]) => void;
  setDeviceType: (port: string, t: number) => void;
}

const MAX_CONSOLE = 500;

function deriveProject(mfp: MultiFileProject, activeFileId: string): AnyProject {
  const file = mfp.files.find((f) => f.id === activeFileId) ?? mfp.files[0];
  if (!file) return { ...newBlocksProject(), settings: mfp.settings };
  return fileToProject(file, mfp.settings, mfp.createdAt);
}

// Map from file IDs to legacy Tab IDs (for the compat shim)
function mfpToTabs(mfp: MultiFileProject, openFileIds: string[]): Tab[] {
  return openFileIds.map((id) => {
    const file = mfp.files.find((f) => f.id === id);
    if (!file) return makeTab(newBlocksProject());
    return makeTab(fileToProject(file, mfp.settings, mfp.createdAt));
  });
}

const _initial = newMultiFileProject();
const _initialProject = deriveProject(_initial, _initial.files[0].id);

export const useApp = create<AppState>((set, get) => ({
  mfp: _initial,
  openFileIds: [_initial.files[0].id],
  activeFileId: _initial.files[0].id,
  savedSnapshot: JSON.stringify(_initial),

  project: _initialProject,
  pythonPreview: "",

  // Legacy compat
  tabs: mfpToTabs(_initial, [_initial.files[0].id]),
  activeTabId: _initial.files[0].id,

  device: null,
  connection: "disconnected",
  connectionError: null,
  running: false,
  console: [],
  boardName: "",
  boardVersion: "",
  fwVersion: "",

  editorSettings: loadEditorSettings(),

  replOpen: false,
  devicePanelOpen: false,
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
    const project = fileToProject(file, s.mfp.settings, s.mfp.createdAt);
    return {
      openFileIds,
      activeFileId: id,
      project,
      tabs: mfpToTabs(s.mfp, openFileIds),
      activeTabId: id,
    };
  }),

  closeFile: (id) => set((s) => {
    const openFileIds = s.openFileIds.filter((x) => x !== id);
    if (openFileIds.length === 0) {
      // Always keep at least one file open
      const fallbackId = s.mfp.files.find((f) => f.id !== id)?.id ?? s.mfp.files[0]?.id ?? id;
      const newOpen = [fallbackId];
      const project = deriveProject(s.mfp, fallbackId);
      return { openFileIds: newOpen, activeFileId: fallbackId, project, tabs: mfpToTabs(s.mfp, newOpen), activeTabId: fallbackId };
    }
    const activeFileId = s.activeFileId === id
      ? openFileIds[Math.min(s.openFileIds.indexOf(id), openFileIds.length - 1)]
      : s.activeFileId;
    const project = deriveProject(s.mfp, activeFileId);
    return { openFileIds, activeFileId, project, tabs: mfpToTabs(s.mfp, openFileIds), activeTabId: activeFileId };
  }),

  updateFile: (id, content) => set((s) => {
    const files = s.mfp.files.map((f) => f.id === id ? { ...f, content } : f);
    const mfp = { ...s.mfp, files };
    const project = id === s.activeFileId ? fileToProject({ id, name: s.mfp.files.find((f) => f.id === id)!.name, content }, mfp.settings, mfp.createdAt) : s.project;
    return { mfp, project };
  }),

  renameFile: (id, name) => set((s) => {
    // Ensure .py extension
    const safeName = name.endsWith(".py") ? name : name + ".py";
    const files = s.mfp.files.map((f) => f.id === id ? { ...f, name: safeName } : f);
    const mfp = { ...s.mfp, files };
    const project = id === s.activeFileId ? fileToProject(files.find((f) => f.id === id)!, mfp.settings, mfp.createdAt) : s.project;
    return { mfp, project, tabs: mfpToTabs(mfp, s.openFileIds) };
  }),

  newFile: (name) => set((s) => {
    const baseName = name ? (name.endsWith(".py") ? name : name + ".py") : "untitled.py";
    // Avoid name collisions
    let finalName = baseName;
    let n = 1;
    while (s.mfp.files.some((f) => f.name === finalName)) {
      finalName = baseName.replace(/\.py$/, `_${n++}.py`);
    }
    const file: ProjectFile = { id: crypto.randomUUID(), name: finalName, content: "" };
    const files = [...s.mfp.files, file];
    const mfp = { ...s.mfp, files };
    const openFileIds = [...s.openFileIds, file.id];
    return {
      mfp,
      openFileIds,
      activeFileId: file.id,
      project: fileToProject(file, mfp.settings, mfp.createdAt),
      tabs: mfpToTabs(mfp, openFileIds),
      activeTabId: file.id,
    };
  }),

  deleteFile: (id) => set((s) => {
    if (s.mfp.files.length <= 1) return {}; // can't delete last file
    const files = s.mfp.files.filter((f) => f.id !== id);
    const mfp = { ...s.mfp, files };
    const openFileIds = s.openFileIds.filter((x) => x !== id);
    const safeOpen = openFileIds.length > 0 ? openFileIds : [files[0].id];
    const activeFileId = s.activeFileId === id ? safeOpen[safeOpen.length - 1] : s.activeFileId;
    const project = deriveProject(mfp, activeFileId);
    return { mfp, openFileIds: safeOpen, activeFileId, project, tabs: mfpToTabs(mfp, safeOpen), activeTabId: activeFileId };
  }),

  setBlocksContent: (workspace, python) => set((s) => {
    const id = s.activeFileId;
    const fileName = s.mfp.files.find((f) => f.id === id)?.name ?? "main.py";
    const content = `# __blocks__: ${JSON.stringify(workspace)}\n${python}`;
    const files = s.mfp.files.map((f) => f.id === id ? { ...f, content } : f);
    const mfp = { ...s.mfp, files };
    const project = { ...fileToProject({ id, name: fileName, content }, mfp.settings, mfp.createdAt) };
    return { mfp, project, pythonPreview: python };
  }),

  // ── Compat shims ───────────────────────────────────────────────────────────

  setProject: (p) => set((s) => {
    const id = s.activeFileId;
    const existingFile = s.mfp.files.find((f) => f.id === id);
    if (!existingFile) return {};
    const content = projectToFileContent(p, s.pythonPreview);
    // Rename if title changed
    const newName = p.title !== existingFile.name.replace(/\.py$/, "")
      ? sanitizeFilename(p.title) + ".py"
      : existingFile.name;
    const files = s.mfp.files.map((f) => f.id === id ? { ...f, name: newName, content } : f);
    const mfp = { ...s.mfp, settings: p.settings ?? s.mfp.settings, files };
    return { mfp, project: p, tabs: mfpToTabs(mfp, s.openFileIds) };
  }),

  loadProject: (p) => set((s) => {
    // Replace active file with this project (preserves settings)
    const merged = { ...p, settings: s.mfp.settings };
    const id = s.activeFileId;
    const existingFile = s.mfp.files.find((f) => f.id === id);
    const name = existingFile?.name ?? sanitizeFilename(merged.title) + ".py";
    const content = projectToFileContent(merged, "");
    const files = s.mfp.files.map((f) => f.id === id ? { ...f, name, content } : f);
    const mfp = { ...s.mfp, files };
    const savedSnapshot = JSON.stringify(mfp);
    return { mfp, project: merged, savedSnapshot, tabs: mfpToTabs(mfp, s.openFileIds) };
  }),

  markSaved: () => set((s) => ({ savedSnapshot: JSON.stringify(s.mfp) })),

  setPythonPreview: (pythonPreview) => set({ pythonPreview }),

  updateSettings: (patch) => set((s) => {
    const settings = { ...s.mfp.settings, ...patch };
    const mfp = { ...s.mfp, settings };
    const project = { ...s.project, settings };
    return { mfp, project };
  }),

  // ── Legacy tab API ─────────────────────────────────────────────────────────

  openTab: (project, devicePath) => set((s) => {
    // If same devicePath already open, activate that file
    if (devicePath) {
      const existing = s.mfp.files.find((f) => f.name === sanitizeFilename(project.title) + ".py");
      if (existing) {
        const openFileIds = s.openFileIds.includes(existing.id) ? s.openFileIds : [...s.openFileIds, existing.id];
        const proj = fileToProject(existing, s.mfp.settings, s.mfp.createdAt);
        return { openFileIds, activeFileId: existing.id, project: proj, tabs: mfpToTabs(s.mfp, openFileIds), activeTabId: existing.id };
      }
    }
    const name = sanitizeFilename(project.title) + ".py";
    const content = projectToFileContent(project, "");
    const file: ProjectFile = { id: crypto.randomUUID(), name, content };
    const files = [...s.mfp.files, file];
    const mfp = { ...s.mfp, files };
    const openFileIds = [...s.openFileIds, file.id];
    return {
      mfp, openFileIds, activeFileId: file.id,
      project, tabs: mfpToTabs(mfp, openFileIds), activeTabId: file.id,
    };
  }),

  closeTab: (id) => { get().closeFile(id); },

  activateTab: (id) => { get().openFile(id); },

  renameTab: (id, title) => { get().renameFile(id, sanitizeFilename(title) + ".py"); },

  // ── Global ─────────────────────────────────────────────────────────────────

  setDevice: (device) => set({ device }),
  setConnection: (connection, err) => set({ connection, connectionError: err ?? null }),
  setBoardInfo: (boardName, boardVersion, fwVersion) => set({ boardName, boardVersion, fwVersion }),
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

  setReplOpen: (replOpen) => set({ replOpen }),
  setDevicePanelOpen: (devicePanelOpen) => set({ devicePanelOpen }),
  setBattery: (batteryMv, batteryPct) => set({ batteryMv, batteryPct }),
  setButtonState: (buttonState) => set({ buttonState }),
  setOrientation: (orientation) => set({ orientation }),
  setSensorValue: (port, vals) => set((s) => ({ sensorValues: { ...s.sensorValues, [port]: vals } })),
  setDeviceType: (port, t) => set((s) => ({ deviceType: { ...s.deviceType, [port]: t } })),
}));

export { DEFAULT_SETTINGS };
