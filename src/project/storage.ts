import type { AnyProject } from "./format";
import { parseProject } from "./format";
import type { Tab } from "../state/store";
import { makeTab } from "../state/store";

const KEY_AUTOSAVE = "b2op.autosave";
const KEY_TABS = "b2op.tabs";
const KEY_LAST_DEVICE = "b2op.lastDeviceName";

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
