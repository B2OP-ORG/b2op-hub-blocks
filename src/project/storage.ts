import type { AnyProject, EditorSettings, MultiFileProject, ProjectFile } from "./format";
import { parseProject, mergeEditorSettings, DEFAULT_EDITOR_SETTINGS, DEFAULT_SETTINGS, normalizeProject, withBlocksHeader } from "./format";
import { sanitizeFilename } from "../utils/sanitize";

// ── Keys ──────────────────────────────────────────────────────────────────────

const KEY_PROJECT_INDEX = "b2op.projects";
const projectKey = (id: string) => `b2op.project.${id}`;
const KEY_LAST_DEVICE = "b2op.lastDeviceName";
const KEY_EDITOR_SETTINGS = "b2op.editorSettings";
const KEY_SIDEBAR = "b2op.sidebar";

// Legacy keys (read-only, for migration; never deleted).
const KEY_AUTOSAVE = "b2op.autosave";
const KEY_TABS = "b2op.tabs";
const KEY_PROJECT_V3 = "b2op.project.v3";
const KEY_OPEN_FILES = "b2op.openFiles";

// ── Project index ─────────────────────────────────────────────────────────────

export interface ProjectMeta {
  id: string;
  title: string;
  updatedAt: string;
  fileCount: number;
}

interface ProjectIndex {
  version: 1;
  activeProjectId: string;
  projects: ProjectMeta[];
}

export function metaOf(p: MultiFileProject): ProjectMeta {
  return { id: p.id, title: p.title, updatedAt: p.updatedAt, fileCount: p.files.length };
}

export interface LoadedWorkspace {
  projects: ProjectMeta[];
  active: MultiFileProject;
}

function readIndex(): ProjectIndex | null {
  try {
    const raw = localStorage.getItem(KEY_PROJECT_INDEX);
    if (!raw) return null;
    const idx = JSON.parse(raw) as ProjectIndex;
    if (idx.version !== 1 || !Array.isArray(idx.projects)) return null;
    return idx;
  } catch {
    return null;
  }
}

function writeIndex(projects: ProjectMeta[], activeProjectId: string): void {
  try {
    const idx: ProjectIndex = { version: 1, activeProjectId, projects };
    localStorage.setItem(KEY_PROJECT_INDEX, JSON.stringify(idx));
  } catch { /* quota */ }
}

export function loadProject(id: string): MultiFileProject | null {
  try {
    const raw = localStorage.getItem(projectKey(id));
    if (!raw) return null;
    return normalizeProject(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Persist one project. Returns false when storage is full / unavailable. */
export function saveProject(p: MultiFileProject): boolean {
  try {
    localStorage.setItem(projectKey(p.id), JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function removeProject(id: string): void {
  try { localStorage.removeItem(projectKey(id)); } catch { /* ignore */ }
}

export function saveProjectIndex(projects: ProjectMeta[], activeProjectId: string): void {
  writeIndex(projects, activeProjectId);
}

/**
 * Load the project list and the active project. Migrates from the older
 * single-project storage formats on first run. Returns null when nothing is
 * stored (fresh install) — the caller then creates a default project.
 */
export function loadWorkspace(): LoadedWorkspace | null {
  const idx = readIndex();
  if (idx && idx.projects.length > 0) {
    // Drop index entries whose data is gone.
    const projects = idx.projects.filter((m) => {
      try { return localStorage.getItem(projectKey(m.id)) != null; } catch { return false; }
    });
    const activeId = projects.some((m) => m.id === idx.activeProjectId) ? idx.activeProjectId : projects[0]?.id;
    const active = activeId ? loadProject(activeId) : null;
    if (active) return { projects, active };
  }

  const migrated = migrateLegacy();
  if (!migrated) return null;
  saveProject(migrated);
  const projects = [metaOf(migrated)];
  writeIndex(projects, migrated.id);
  return { projects, active: migrated };
}

interface SavedTabs {
  version: 1;
  tabs: Array<{ project: unknown; devicePath?: string }>;
  activeIndex: number;
}

/** Build a project from the pre-multi-project storage keys, if any exist. */
export function migrateLegacy(): MultiFileProject | null {
  try {
    const raw = localStorage.getItem(KEY_PROJECT_V3);
    if (raw) {
      const mfp = normalizeProject(JSON.parse(raw));
      if (mfp && mfp.files.length > 0) {
        try {
          const openRaw = localStorage.getItem(KEY_OPEN_FILES);
          if (openRaw) {
            const saved = JSON.parse(openRaw) as { openFileIds: string[]; activeFileId: string };
            const valid = (saved.openFileIds ?? []).filter((id) => mfp.files.some((f) => f.id === id));
            if (valid.length > 0) {
              mfp.openFileIds = valid;
              mfp.activeFileId = valid.includes(saved.activeFileId) ? saved.activeFileId : valid[0];
            }
          }
        } catch { /* corrupt */ }
        return mfp;
      }
    }

    const files: ProjectFile[] = [];
    let title = "Untitled";
    let settings = { ...DEFAULT_SETTINGS };
    const tabsRaw = localStorage.getItem(KEY_TABS);
    if (tabsRaw) {
      const saved = JSON.parse(tabsRaw) as SavedTabs;
      if (saved.version === 1 && Array.isArray(saved.tabs)) {
        for (const entry of saved.tabs) {
          const result = parseProject(entry.project);
          if (!result) continue;
          files.push(legacyToFile(result.project));
        }
      }
    }
    if (files.length === 0) {
      const legacy = localStorage.getItem(KEY_AUTOSAVE);
      if (legacy) {
        const result = parseProject(JSON.parse(legacy));
        if (result && !result.stale) {
          files.push(legacyToFile(result.project));
          title = result.project.title;
          settings = result.project.settings;
        }
      }
    }
    if (files.length === 0) return null;
    // De-duplicate names.
    const seen = new Set<string>();
    for (const f of files) {
      let n = f.name, i = 1;
      while (seen.has(n)) n = f.name.replace(/\.py$/, `_${i++}.py`);
      f.name = n;
      seen.add(n);
    }
    return normalizeProject({
      format: "b2op-hub-v3",
      version: "3.0.0",
      title,
      settings,
      files,
      openFileIds: [files[0].id],
      activeFileId: files[0].id,
    });
  } catch {
    return null;
  }
}

function legacyToFile(p: AnyProject): ProjectFile {
  const name = sanitizeFilename(p.title) + ".py";
  return p.type === "blocks"
    ? { id: crypto.randomUUID(), name, content: withBlocksHeader(p.workspace, ""), mode: "blocks" }
    : { id: crypto.randomUUID(), name, content: p.source, mode: "python" };
}

// ── Misc ──────────────────────────────────────────────────────────────────────

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
