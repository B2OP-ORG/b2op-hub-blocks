import type { StateCreator } from "zustand";
import type { EditorSettings } from "../../settings/editorSettings";
import { loadEditorSettings, saveEditorSettings } from "../../settings/storage";
import type { AppState } from "./types";

/** Global editor settings (persisted on every change). */
export interface SettingsSlice {
  editorSettings: EditorSettings;
  updateEditorSettings: (patch: Partial<EditorSettings>) => void;
}

export const createSettingsSlice: StateCreator<AppState, [], [], SettingsSlice> = (set) => ({
  editorSettings: loadEditorSettings(),
  updateEditorSettings: (patch) => set((s) => {
    const editorSettings = { ...s.editorSettings, ...patch };
    saveEditorSettings(editorSettings);
    return { editorSettings };
  }),
});
