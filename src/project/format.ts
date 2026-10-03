export type ProjectType = "blocks" | "python";

export type LspMode = "off" | "worker" | "remote";

export const PROJECT_FORMAT = "b2op-hub-blocks";
export const PROJECT_VERSION = "2.0.0";

export interface ProjectSettings {
  showAdvanced: boolean;
  allowRoot: boolean;
  autoreloadInLive: boolean;
  lspMode: LspMode;
  lspRemoteUrl: string;
  /** Fixed scale for blocks in the flyout (toolbox). 1.0 = default Blockly size. */
  toolboxBlockScale: number;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  showAdvanced: false,
  allowRoot: false,
  autoreloadInLive: false,
  lspMode: "worker",
  lspRemoteUrl: "ws://localhost:3001",
  toolboxBlockScale: 0.75,
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
  if (p.format !== "b2op-hub-blocks" && p.format !== "lego-hub-blocks") return null;
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
