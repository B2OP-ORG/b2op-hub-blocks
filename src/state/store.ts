import { create } from "zustand";
import type { AnyProject, ProjectSettings, EditorSettings } from "../project/format";
import { DEFAULT_SETTINGS, newBlocksProject } from "../project/format";
import { loadEditorSettings, saveEditorSettings } from "../project/storage";
import type { DeviceClient } from "../device/deviceClient";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

interface ConsoleEntry {
  ts: number;
  text: string;
  kind: "out" | "err" | "info";
}

export interface Tab {
  id: string;
  project: AnyProject;
  savedSnapshot: string;
  devicePath?: string;
  pythonPreview: string;
}

function makeTab(project: AnyProject, devicePath?: string): Tab {
  return {
    id: crypto.randomUUID(),
    project,
    savedSnapshot: JSON.stringify(project),
    devicePath,
    pythonPreview: "",
  };
}

interface AppState {
  tabs: Tab[];
  activeTabId: string;
  project: AnyProject;
  pythonPreview: string;
  savedSnapshot: string;
  device: DeviceClient | null;
  connection: ConnectionState;
  connectionError: string | null;
  running: boolean;
  console: ConsoleEntry[];
  boardName: string;
  boardVersion: string;
  fwVersion: string;

  // UI panel state
  replOpen: boolean;
  devicePanelOpen: boolean;

  // Live device state (polled by LiveModePanel)
  batteryMv: number;
  batteryPct: number;
  buttonState: Record<string, boolean>;
  orientation: { pitch: number; yaw: number; roll: number };
  sensorValues: Record<string, number[]>;
  deviceType: Record<string, number>;

  // Tab management
  openTab: (project: AnyProject, devicePath?: string) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  renameTab: (id: string, title: string) => void;

  // Per-active-tab mutations (keep existing interface)
  setProject: (p: AnyProject) => void;
  loadProject: (p: AnyProject) => void;
  markSaved: () => void;
  setPythonPreview: (s: string) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;

  // Global
  setDevice: (d: DeviceClient | null) => void;
  setConnection: (s: ConnectionState, err?: string) => void;
  setRunning: (r: boolean) => void;
  appendConsole: (kind: ConsoleEntry["kind"], text: string) => void;
  clearConsole: () => void;
  setBoardInfo: (name: string, version: string, fwVersion: string) => void;

  // Global editor settings (persisted in localStorage)
  editorSettings: EditorSettings;
  updateEditorSettings: (patch: Partial<EditorSettings>) => void;

  // Panel toggles
  setReplOpen: (v: boolean) => void;
  setDevicePanelOpen: (v: boolean) => void;

  // Device state setters (called by LiveModePanel polling)
  setBattery: (mv: number, pct: number) => void;
  setButtonState: (state: Record<string, boolean>) => void;
  setOrientation: (o: { pitch: number; yaw: number; roll: number }) => void;
  setSensorValue: (port: string, vals: number[]) => void;
  setDeviceType: (port: string, t: number) => void;
}

const MAX_CONSOLE = 500;

const _initialTab = makeTab(newBlocksProject());

export const useApp = create<AppState>((set) => ({
  tabs: [_initialTab],
  activeTabId: _initialTab.id,
  project: _initialTab.project,
  pythonPreview: "",
  savedSnapshot: _initialTab.savedSnapshot,
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

  openTab: (project, devicePath) => set((s) => {
    if (devicePath) {
      const existing = s.tabs.find((t) => t.devicePath === devicePath);
      if (existing) {
        return {
          activeTabId: existing.id,
          project: existing.project,
          pythonPreview: existing.pythonPreview,
          savedSnapshot: existing.savedSnapshot,
        };
      }
    }
    const tab = makeTab(project, devicePath);
    return {
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
      project: tab.project,
      pythonPreview: tab.pythonPreview,
      savedSnapshot: tab.savedSnapshot,
    };
  }),

  closeTab: (id) => set((s) => {
    if (s.tabs.length === 1) {
      // Replace with a fresh tab rather than leaving zero tabs
      const fresh = makeTab(newBlocksProject());
      return {
        tabs: [fresh],
        activeTabId: fresh.id,
        project: fresh.project,
        pythonPreview: fresh.pythonPreview,
        savedSnapshot: fresh.savedSnapshot,
      };
    }
    const idx = s.tabs.findIndex((t) => t.id === id);
    const tabs = s.tabs.filter((t) => t.id !== id);
    let activeTabId = s.activeTabId;
    if (activeTabId === id) {
      const newIdx = Math.min(idx, tabs.length - 1);
      activeTabId = tabs[newIdx].id;
    }
    const active = tabs.find((t) => t.id === activeTabId)!;
    return {
      tabs,
      activeTabId,
      project: active.project,
      pythonPreview: active.pythonPreview,
      savedSnapshot: active.savedSnapshot,
    };
  }),

  activateTab: (id) => set((s) => {
    const tab = s.tabs.find((t) => t.id === id);
    if (!tab) return {};
    return {
      activeTabId: id,
      project: tab.project,
      pythonPreview: tab.pythonPreview,
      savedSnapshot: tab.savedSnapshot,
    };
  }),

  renameTab: (id, title) => set((s) => {
    const tabs = s.tabs.map((t) =>
      t.id === id ? { ...t, project: { ...t.project, title } } : t,
    );
    const project = id === s.activeTabId ? { ...s.project, title } : s.project;
    return { tabs, project };
  }),

  setProject: (project) => set((s) => ({
    project,
    tabs: s.tabs.map((t) => t.id === s.activeTabId ? { ...t, project } : t),
  })),

  loadProject: (project) => set((s) => {
    // Preserve global settings — loaded file doesn't override them
    const merged = { ...project, settings: s.project.settings };
    const savedSnapshot = JSON.stringify(merged);
    return {
      project: merged,
      savedSnapshot,
      tabs: s.tabs.map((t) =>
        t.id === s.activeTabId ? { ...t, project: merged, savedSnapshot } : t,
      ),
    };
  }),

  markSaved: () => set((s) => {
    const savedSnapshot = JSON.stringify(s.project);
    return {
      savedSnapshot,
      tabs: s.tabs.map((t) =>
        t.id === s.activeTabId ? { ...t, savedSnapshot } : t,
      ),
    };
  }),

  setPythonPreview: (pythonPreview) => set((s) => ({
    pythonPreview,
    tabs: s.tabs.map((t) => t.id === s.activeTabId ? { ...t, pythonPreview } : t),
  })),

  updateSettings: (patch) => set((s) => {
    const settings = { ...s.project.settings, ...patch };
    const tabs = s.tabs.map((t) => ({ ...t, project: { ...t.project, settings } }));
    const project = { ...s.project, settings };
    return { project, tabs };
  }),

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
// Expose makeTab for use in storage.ts restoration
export { makeTab };
