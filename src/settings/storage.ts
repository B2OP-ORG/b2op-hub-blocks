import { DEFAULT_EDITOR_SETTINGS, mergeEditorSettings, type EditorSettings } from "./editorSettings";

// Per-browser UI state and global settings (localStorage).

const KEY_LAST_DEVICE = "b2op.lastDeviceName";
const KEY_EDITOR_SETTINGS = "b2op.editorSettings";
const KEY_SIDEBAR = "b2op.sidebar";

// Legacy project keys, read only to migrate old editor settings.
const KEY_AUTOSAVE = "b2op.autosave";
const KEY_TABS = "b2op.tabs";

// ── Last device ──────────────────────────────────────────────────────────────────────

export function loadLastDeviceName(): string | null {
  try { return localStorage.getItem(KEY_LAST_DEVICE); } catch { return null; }
}

export function saveLastDeviceName(name: string): void {
  try { localStorage.setItem(KEY_LAST_DEVICE, name); } catch { /* ignore */ }
}

// ── Sidebar layout (per-browser UI state, not a setting) ─────────────────────

export interface SidebarLayout {
  activeTab: string;
  collapsed: boolean;
  width: number;
}

export const DEFAULT_SIDEBAR_WIDTH = 240;

export function loadSidebarLayout(): SidebarLayout {
  const def: SidebarLayout = { activeTab: "explorer", collapsed: false, width: DEFAULT_SIDEBAR_WIDTH };
  try {
    const raw = localStorage.getItem(KEY_SIDEBAR);
    if (!raw) return def;
    const p = JSON.parse(raw) as Partial<SidebarLayout>;
    return {
      activeTab: typeof p.activeTab === "string" ? p.activeTab : def.activeTab,
      collapsed: typeof p.collapsed === "boolean" ? p.collapsed : def.collapsed,
      width: typeof p.width === "number" && Number.isFinite(p.width) ? p.width : def.width,
    };
  } catch {
    return def;
  }
}

export function saveSidebarLayout(l: SidebarLayout): void {
  try { localStorage.setItem(KEY_SIDEBAR, JSON.stringify(l)); } catch { /* ignore */ }
}

// ── Editor settings ───────────────────────────────────────────────────────────

export function loadEditorSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(KEY_EDITOR_SETTINGS);
    if (raw) return mergeEditorSettings(JSON.parse(raw));
    // Migrate: pull known fields from the first saved project's settings if present.
    const tabsRaw = localStorage.getItem(KEY_TABS) ?? localStorage.getItem(KEY_AUTOSAVE);
    if (tabsRaw) {
      const parsed = JSON.parse(tabsRaw);
      const src = (parsed?.tabs?.[0]?.project?.settings ?? parsed?.settings) as Partial<EditorSettings> | undefined;
      if (src) return mergeEditorSettings(src);
    }
  } catch {
    // corrupt storage
  }
  return mergeEditorSettings(DEFAULT_EDITOR_SETTINGS);
}

export function saveEditorSettings(settings: EditorSettings): void {
  try {
    localStorage.setItem(KEY_EDITOR_SETTINGS, JSON.stringify(settings));
  } catch {
    // storage quota — silent
  }
}
