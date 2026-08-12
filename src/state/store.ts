import { create } from "zustand";
import type { AnyProject, ProjectSettings } from "../project/format";
import { DEFAULT_SETTINGS, newBlocksProject } from "../project/format";
import type { DeviceClient } from "../device/deviceClient";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

interface ConsoleEntry {
  ts: number;
  text: string;
  kind: "out" | "err" | "info";
}

interface AppState {
  project: AnyProject;
  pythonPreview: string; // read-only Python view in blocks mode
  device: DeviceClient | null;
  connection: ConnectionState;
  connectionError: string | null;
  running: boolean;
  console: ConsoleEntry[];
  /** JSON snapshot of the last explicitly-saved project. Empty until save. */
  savedSnapshot: string;
  setProject: (p: AnyProject) => void;
  /** Replace project AND mark the new state as the saved baseline (Open / Load). */
  loadProject: (p: AnyProject) => void;
  markSaved: () => void;
  setPythonPreview: (s: string) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;
  setDevice: (d: DeviceClient | null) => void;
  setConnection: (s: ConnectionState, err?: string) => void;
  setRunning: (r: boolean) => void;
  appendConsole: (kind: ConsoleEntry["kind"], text: string) => void;
  clearConsole: () => void;
}

const MAX_CONSOLE = 500;

const INITIAL_PROJECT = newBlocksProject();

export const useApp = create<AppState>((set) => ({
  project: INITIAL_PROJECT,
  pythonPreview: "",
  device: null,
  connection: "disconnected",
  connectionError: null,
  running: false,
  console: [],
  savedSnapshot: JSON.stringify(INITIAL_PROJECT),
  setProject: (project) => set({ project }),
  loadProject: (project) => set({ project, savedSnapshot: JSON.stringify(project) }),
  markSaved: () => set((s) => ({ savedSnapshot: JSON.stringify(s.project) })),
  setPythonPreview: (pythonPreview) => set({ pythonPreview }),
  updateSettings: (patch) =>
    set((s) => ({
      project: { ...s.project, settings: { ...s.project.settings, ...patch } },
    })),
  setDevice: (device) => set({ device }),
  setConnection: (connection, err) =>
    set({ connection, connectionError: err ?? null }),
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
}));

export { DEFAULT_SETTINGS };
