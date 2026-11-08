export type ProjectType = "blocks" | "python";

export type LspMode = "off" | "worker" | "remote";

export const PROJECT_FORMAT = "b2op-hub-blocks";
export const PROJECT_VERSION = "2.0.0";

// ── Editor settings (global, persisted in localStorage) ──────────────────────

export interface EditorSettings {
  showAdvanced: boolean;
  allowRoot: boolean;
  lspMode: LspMode;
  lspRemoteUrl: string;
  toolboxBlockScale: number;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  showAdvanced: false,
  allowRoot: false,
  lspMode: "worker",
  lspRemoteUrl: "ws://localhost:3001",
  toolboxBlockScale: 0.75,
};

// ── Project settings (per-file, saved inside project JSON) ───────────────────

export interface ProjectSettings {
  /** When true, Run executes generated Python in Pyodide and sends KIND_CMD frames to the device. */
  liveMode: boolean;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  liveMode: false,
};

export interface BlocksProject {
  format: "b2op-hub-blocks";
  version: string;
  type: "blocks";
  title: string;
  createdAt: string;
  settings: ProjectSettings;
  workspace: unknown; // Blockly JSON serialization
}

export interface PythonProject {
  format: "b2op-hub-blocks";
  version: string;
  type: "python";
  title: string;
  createdAt: string;
  settings: ProjectSettings;
  source: string;
}

export type AnyProject = BlocksProject | PythonProject;

/** Parse and validate a project from unknown JSON. Returns null if not a recognised format. */
export function parseProject(raw: unknown): { project: AnyProject; stale: boolean } | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  // Accept old format name so stale detection works for pre-rename projects.
  if (p.format !== "b2op-hub-blocks" && p.format !== "b2op-hub-blocks") return null;
  if (p.type !== "blocks" && p.type !== "python") return null;
  const project = p as unknown as AnyProject;
  const stale = p.format !== "b2op-hub-blocks" || project.version !== PROJECT_VERSION;
  project.settings = { ...DEFAULT_SETTINGS, ...(project.settings ?? {}) };
  return { project, stale };
}

export function newBlocksProject(title = "Untitled"): BlocksProject {
  return {
    format: "b2op-hub-blocks",
    version: PROJECT_VERSION,
    type: "blocks",
    title,
    createdAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS },
    workspace: {
      blocks: {
        languageVersion: 0,
        blocks: [
          { type: "when_program_starts", x: 40, y: 40 },
        ],
      },
    },
  };
}

export function newPythonProject(title = "Untitled"): PythonProject {
  return {
    format: "b2op-hub-blocks",
    version: PROJECT_VERSION,
    type: "python",
    title,
    createdAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS },
    source: "",
  };
}

// ── Multi-file project ────────────────────────────────────────────────────────

export interface ProjectFile {
  id: string;
  name: string;    // "main.py"
  content: string; // may start with BLOCKS_HEADER_RE match
}

export const BLOCKS_HEADER_RE = /^# __blocks__: (.+)/;

export function getBlocksWorkspace(file: ProjectFile): unknown | null {
  const m = file.content.match(BLOCKS_HEADER_RE);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

export function fileToProject(file: ProjectFile, settings: ProjectSettings, createdAt: string): AnyProject {
  const title = file.name.replace(/\.py$/, "");
  const workspace = getBlocksWorkspace(file);
  if (workspace !== null) {
    return { format: "b2op-hub-blocks", version: PROJECT_VERSION, type: "blocks", title, createdAt, settings, workspace };
  }
  return { format: "b2op-hub-blocks", version: PROJECT_VERSION, type: "python", title, createdAt, settings, source: file.content };
}

export function projectToFileContent(project: AnyProject, currentPythonPreview: string): string {
  if (project.type === "blocks") {
    return `# __blocks__: ${JSON.stringify(project.workspace)}\n${currentPythonPreview}`;
  }
  return project.source;
}

export interface MultiFileProject {
  format: "b2op-hub-v3";
  version: "3.0.0";
  title: string;
  createdAt: string;
  settings: ProjectSettings;
  files: ProjectFile[];
}

export function newMultiFileProject(title = "Untitled"): MultiFileProject {
  return {
    format: "b2op-hub-v3",
    version: "3.0.0",
    title,
    createdAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS },
    files: [{ id: crypto.randomUUID(), name: "main.py", content: "" }],
  };
}
