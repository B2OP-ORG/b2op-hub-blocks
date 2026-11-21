import type { DeviceSlice } from "./deviceSlice";
import type { FilesSlice } from "./filesSlice";
import type { ProjectsSlice } from "./projectsSlice";
import type { SettingsSlice } from "./settingsSlice";
import type { TransferSlice } from "./transferSlice";
import type { UiSlice } from "./uiSlice";

export type { NewFileInput } from "../../project/ops";

/** A non-file editor tab (doc page or read-only example preview). */
export interface ExtraTab {
  id: string;
  kind: "doc" | "example";
  title: string;
  /** Doc page id (e.g. "guide:ports", "api:hub.lcd") or example path. */
  ref: string;
}

export const EXAMPLE_PREVIEW_ID = "example:preview";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export interface ConsoleEntry {
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

export type AppState = ProjectsSlice & FilesSlice & DeviceSlice & TransferSlice & UiSlice & SettingsSlice;
