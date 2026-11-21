// Single app-wide zustand store, composed from slices.

import { create } from "zustand";
import { createDeviceSlice } from "./deviceSlice";
import { createFilesSlice } from "./filesSlice";
import { createProjectsSlice } from "./projectsSlice";
import { createSettingsSlice } from "./settingsSlice";
import { createTransferSlice } from "./transferSlice";
import { createUiSlice } from "./uiSlice";
import type { AppState } from "./types";

export { EXAMPLE_PREVIEW_ID } from "./types";
export type { AppState, ConnectionState, ConsoleEntry, ExtraTab, NewFileInput, TransferState } from "./types";

export const useApp = create<AppState>()((...a) => ({
  ...createProjectsSlice(...a),
  ...createFilesSlice(...a),
  ...createDeviceSlice(...a),
  ...createTransferSlice(...a),
  ...createUiSlice(...a),
  ...createSettingsSlice(...a),
}));
