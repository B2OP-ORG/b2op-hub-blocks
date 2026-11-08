import type { AnyProject, EditorSettings, MultiFileProject, ProjectFile } from "./format";
import { parseProject, DEFAULT_EDITOR_SETTINGS, DEFAULT_SETTINGS } from "./format";
import type { Tab } from "../state/store";
import { makeTab } from "../state/store";
import { sanitizeFilename } from "../utils/sanitize";

const KEY_AUTOSAVE = "b2op.autosave";
const KEY_TABS = "b2op.tabs";
const KEY_PROJECT_V3 = "b2op.project.v3";
const KEY_OPEN_FILES = "b2op.openFiles";
const KEY_LAST_DEVICE = "b2op.lastDeviceName";
const KEY_EDITOR_SETTINGS = "b2op.editorSettings";

interface SavedTabs {
  version: 1;
  tabs: Array<{ project: AnyProject; devicePath?: string }>;
  activeIndex: number;
}

export function loadSavedTabs(): { tabs: Tab[]; activeTabId: string } | null {
  try {
    // Try new multi-tab format first
    const raw = localStorage.getItem(KEY_TABS);
    if (raw) {
      const saved = JSON.parse(raw) as SavedTabs;
      if (saved.version === 1 && Array.isArray(saved.tabs) && saved.tabs.length > 0) {
        const tabs: Tab[] = [];
        for (const entry of saved.tabs) {
          const result = parseProject(entry.project);
          if (result && !result.stale) {
            tabs.push(makeTab(result.project, entry.devicePath));
          }
        }
        if (tabs.length > 0) {
          const activeIndex = Math.min(saved.activeIndex, tabs.length - 1);
          return { tabs, activeTabId: tabs[activeIndex].id };
        }
      }
    }

    // Migrate old single-project autosave
    const legacy = localStorage.getItem(KEY_AUTOSAVE);
    if (legacy) {
      const result = parseProject(JSON.parse(legacy));
      if (result && !result.stale) {
        const tab = makeTab(result.project);
        return { tabs: [tab], activeTabId: tab.id };
      }
    }
  } catch {
    // corrupt storage — fall through
  }
  return null;
}

export function saveTabs(tabs: Tab[], activeTabId: string): void {
  try {
    const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === activeTabId));
    const saved: SavedTabs = {
      version: 1,
      tabs: tabs.map((t) => ({ project: t.project, devicePath: t.devicePath })),
      activeIndex,
    };
    localStorage.setItem(KEY_TABS, JSON.stringify(saved));
  } catch {
    // storage quota — silent
  }
}

// Keep legacy exports so any remaining callers compile
export function loadAutosave(): AnyProject | null {
  try {
    const raw = localStorage.getItem(KEY_AUTOSAVE);
    if (!raw) return null;
    const result = parseProject(JSON.parse(raw));
    if (!result || result.stale) return null;
    return result.project;
  } catch {
    return null;
  }
}

export function saveAutosave(project: AnyProject): void {
  try {
    localStorage.setItem(KEY_AUTOSAVE, JSON.stringify(project));
  } catch {
    // storage quota — silent
  }
}

export function loadLastDeviceName(): string | null {
  return localStorage.getItem(KEY_LAST_DEVICE);
}

export function saveLastDeviceName(name: string): void {
  localStorage.setItem(KEY_LAST_DEVICE, name);
}

export interface LoadedProject {
  mfp: MultiFileProject;
  openFileIds: string[];
  activeFileId: string;
}

export function loadMultiFileProject(): LoadedProject | null {
  try {
    const raw = localStorage.getItem(KEY_PROJECT_V3);
    if (raw) {
      const mfp = JSON.parse(raw) as MultiFileProject;
      if (mfp.format === "b2op-hub-v3" && Array.isArray(mfp.files) && mfp.files.length > 0) {
        let openFileIds: string[] = [];
        let activeFileId = mfp.files[0].id;
        try {
          const openRaw = localStorage.getItem(KEY_OPEN_FILES);
          if (openRaw) {
            const saved = JSON.parse(openRaw) as { openFileIds: string[]; activeFileId: string };
            const validOpen = saved.openFileIds.filter((id) => mfp.files.some((f) => f.id === id));
            if (validOpen.length > 0) {
              openFileIds = validOpen;
              activeFileId = mfp.files.find((f) => f.id === saved.activeFileId) ? saved.activeFileId : validOpen[0];
            }
          }
        } catch { /* corrupt */ }
        if (openFileIds.length === 0) openFileIds = [activeFileId];
        return { mfp, openFileIds, activeFileId };
      }
    }

    // Migrate from old tabs format
    const tabsRaw = localStorage.getItem(KEY_TABS);
    if (tabsRaw) {
      const saved = JSON.parse(tabsRaw) as SavedTabs;
      if (saved.version === 1 && Array.isArray(saved.tabs) && saved.tabs.length > 0) {
        const files: ProjectFile[] = [];
        for (const entry of saved.tabs) {
          const result = parseProject(entry.project);
          if (!result) continue;
          const p = result.project;
          const name = sanitizeFilename(p.title) + ".py";
          const content = p.type === "blocks"
            ? `# __blocks__: ${JSON.stringify(p.workspace)}\n`
            : p.source;
          files.push({ id: crypto.randomUUID(), name, content });
        }
        if (files.length > 0) {
          const activeIndex = Math.min(saved.activeIndex, files.length - 1);
          const mfp: MultiFileProject = {
            format: "b2op-hub-v3",
            version: "3.0.0",
            title: "Untitled",
            createdAt: new Date().toISOString(),
            settings: { ...DEFAULT_SETTINGS },
            files,
          };
          const activeFileId = files[activeIndex].id;
          return { mfp, openFileIds: [activeFileId], activeFileId };
        }
      }
    }

    // Migrate old single autosave
    const legacy = localStorage.getItem(KEY_AUTOSAVE);
    if (legacy) {
      const result = parseProject(JSON.parse(legacy));
      if (result && !result.stale) {
        const p = result.project;
        const name = sanitizeFilename(p.title) + ".py";
        const content = p.type === "blocks"
          ? `# __blocks__: ${JSON.stringify(p.workspace)}\n`
          : p.source;
        const file: ProjectFile = { id: crypto.randomUUID(), name, content };
        const mfp: MultiFileProject = {
          format: "b2op-hub-v3",
          version: "3.0.0",
          title: p.title,
          createdAt: new Date().toISOString(),
          settings: p.settings,
          files: [file],
        };
        return { mfp, openFileIds: [file.id], activeFileId: file.id };
      }
    }
  } catch { /* corrupt */ }
  return null;
}

export function saveMultiFileProject(mfp: MultiFileProject, openFileIds: string[], activeFileId: string): void {
  try {
    localStorage.setItem(KEY_PROJECT_V3, JSON.stringify(mfp));
    localStorage.setItem(KEY_OPEN_FILES, JSON.stringify({ openFileIds, activeFileId }));
  } catch { /* quota */ }
}

// ─────────────────────────────────────────────────────────────────────────────

export function loadEditorSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(KEY_EDITOR_SETTINGS);
    if (raw) {
      return { ...DEFAULT_EDITOR_SETTINGS, ...JSON.parse(raw) };
    }
    // Migrate: pull known fields from the first saved project's settings if present.
    const tabsRaw = localStorage.getItem(KEY_TABS) ?? localStorage.getItem(KEY_AUTOSAVE);
    if (tabsRaw) {
      const parsed = JSON.parse(tabsRaw);
      const src = (parsed?.tabs?.[0]?.project?.settings ?? parsed?.settings) as Partial<EditorSettings> | undefined;
      if (src) return { ...DEFAULT_EDITOR_SETTINGS, ...src };
    }
  } catch {
    // corrupt storage
  }
  return { ...DEFAULT_EDITOR_SETTINGS };
}

export function saveEditorSettings(settings: EditorSettings): void {
  try {
    localStorage.setItem(KEY_EDITOR_SETTINGS, JSON.stringify(settings));
  } catch {
    // storage quota — silent
  }
}
