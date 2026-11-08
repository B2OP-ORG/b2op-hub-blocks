export type ProjectType = "blocks" | "python";

export type LspMode = "off" | "worker" | "remote";

export const PROJECT_FORMAT = "b2op-hub-blocks";
export const PROJECT_VERSION = "2.0.0";

// ── Editor settings (global, persisted in localStorage) ──────────────────────

export type SidebarTabId = "explorer" | "projects" | "sdcard" | "device";
export const SIDEBAR_TAB_IDS: SidebarTabId[] = ["explorer", "projects", "sdcard", "device"];

export interface SidebarSettings {
  side: "left" | "right";
  /** Display order of the activity-bar icons. */
  tabOrder: SidebarTabId[];
  hiddenTabs: SidebarTabId[];
}

export interface MonacoSettings {
  fontSize: number;
  /** Empty string = Monaco's default monospace stack. */
  fontFamily: string;
  fontLigatures: boolean;
  /** 0 = automatic (derived from font size). */
  lineHeight: number;
  tabSize: number;
  insertSpaces: boolean;
  detectIndentation: boolean;
  wordWrap: "off" | "on" | "wordWrapColumn" | "bounded";
  wordWrapColumn: number;
  lineNumbers: "on" | "off" | "relative";
  minimap: boolean;
  minimapSide: "right" | "left";
  renderWhitespace: "none" | "boundary" | "selection" | "trailing" | "all";
  renderLineHighlight: "none" | "gutter" | "line" | "all";
  cursorStyle: "line" | "block" | "underline" | "line-thin" | "block-outline" | "underline-thin";
  cursorBlinking: "blink" | "smooth" | "phase" | "expand" | "solid";
  cursorSmoothCaretAnimation: "off" | "explicit" | "on";
  smoothScrolling: boolean;
  scrollBeyondLastLine: boolean;
  mouseWheelZoom: boolean;
  bracketPairColorization: boolean;
  bracketPairGuides: boolean;
  indentationGuides: boolean;
  autoClosingBrackets: "always" | "languageDefined" | "beforeWhitespace" | "never";
  autoClosingQuotes: "always" | "languageDefined" | "beforeWhitespace" | "never";
  folding: boolean;
  stickyScroll: boolean;
  quickSuggestions: boolean;
  suggestPreview: boolean;
  acceptSuggestionOnEnter: "on" | "smart" | "off";
  parameterHints: boolean;
}

export const DEFAULT_MONACO_SETTINGS: MonacoSettings = {
  fontSize: 13,
  fontFamily: "",
  fontLigatures: false,
  lineHeight: 0,
  tabSize: 4,
  insertSpaces: true,
  detectIndentation: true,
  wordWrap: "on",
  wordWrapColumn: 80,
  lineNumbers: "on",
  minimap: false,
  minimapSide: "right",
  renderWhitespace: "selection",
  renderLineHighlight: "line",
  cursorStyle: "line",
  cursorBlinking: "blink",
  cursorSmoothCaretAnimation: "off",
  smoothScrolling: false,
  scrollBeyondLastLine: false,
  mouseWheelZoom: false,
  bracketPairColorization: true,
  bracketPairGuides: false,
  indentationGuides: true,
  autoClosingBrackets: "languageDefined",
  autoClosingQuotes: "languageDefined",
  folding: true,
  stickyScroll: false,
  quickSuggestions: true,
  suggestPreview: true,
  acceptSuggestionOnEnter: "on",
  parameterHints: true,
};

export const DEFAULT_SIDEBAR_SETTINGS: SidebarSettings = {
  side: "left",
  tabOrder: [...SIDEBAR_TAB_IDS],
  hiddenTabs: [],
};

export interface EditorSettings {
  darkMode: boolean;
  showAdvanced: boolean;
  allowRoot: boolean;
  lspMode: LspMode;
  lspRemoteUrl: string;
  toolboxBlockScale: number;
  sidebar: SidebarSettings;
  monaco: MonacoSettings;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  darkMode: true,
  showAdvanced: true,
  allowRoot: false,
  lspMode: "worker",
  lspRemoteUrl: "ws://localhost:3001",
  toolboxBlockScale: 0.75,
  sidebar: DEFAULT_SIDEBAR_SETTINGS,
  monaco: DEFAULT_MONACO_SETTINGS,
};

/** Merge stored (possibly partial / older) settings over the defaults. */
export function mergeEditorSettings(raw: unknown): EditorSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<EditorSettings>;
  const sidebar = { ...DEFAULT_SIDEBAR_SETTINGS, ...(r.sidebar ?? {}) };
  // Keep only known tab ids; append any new ones a stored order lacks.
  const order = sidebar.tabOrder.filter((t) => SIDEBAR_TAB_IDS.includes(t));
  for (const t of SIDEBAR_TAB_IDS) if (!order.includes(t)) order.push(t);
  sidebar.tabOrder = order;
  sidebar.hiddenTabs = sidebar.hiddenTabs.filter((t) => SIDEBAR_TAB_IDS.includes(t));
  return {
    ...DEFAULT_EDITOR_SETTINGS,
    ...r,
    sidebar,
    monaco: { ...DEFAULT_MONACO_SETTINGS, ...(r.monaco ?? {}) },
  };
}

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

export type FileMode = "blocks" | "python";

export interface ProjectFile {
  id: string;
  /** Project-relative path using "/" separators, e.g. "main.py" or "lib/util.py". */
  name: string;
  /** Text content. Blocks files start with the BLOCKS_HEADER_PREFIX line. */
  content: string;
  /**
   * Editor mode. Absent = derived from content (blocks if a header is present).
   * Needed because a blocks file switched to Python keeps its header line.
   */
  mode?: FileMode;
}

export interface UploadState {
  /** Name of the device the hashes refer to. */
  device: string;
  /** path → hashContent() of what was last uploaded. */
  hashes: Record<string, string>;
}

export interface MultiFileProject {
  format: "b2op-hub-v3";
  version: "3.0.0";
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
  files: ProjectFile[];
  /** Explicit (possibly empty) folders, project-relative, no trailing slash. */
  folders: string[];
  openFileIds: string[];
  activeFileId: string;
  upload: UploadState | null;
}

export const BLOCKS_HEADER_PREFIX = "# __blocks__: ";
export const BLOCKS_HEADER_RE = /^# __blocks__: (.+)/;

export interface SplitContent {
  workspace: unknown | null;
  /** The header line (without newline), or null when absent / unparsable. */
  header: string | null;
  /** Content after the header line (the whole content when there is no header). */
  body: string;
}

export function splitBlocksHeader(content: string): SplitContent {
  if (!content.startsWith(BLOCKS_HEADER_PREFIX)) return { workspace: null, header: null, body: content };
  const nl = content.indexOf("\n");
  const header = nl === -1 ? content : content.slice(0, nl);
  try {
    const workspace = JSON.parse(header.slice(BLOCKS_HEADER_PREFIX.length));
    return { workspace, header: header.replace(/\r$/, ""), body: nl === -1 ? "" : content.slice(nl + 1) };
  } catch {
    return { workspace: null, header: null, body: content };
  }
}

export function withBlocksHeader(workspace: unknown, body: string): string {
  return `${BLOCKS_HEADER_PREFIX}${JSON.stringify(workspace)}\n${body}`;
}

/** Content with the blocks header (if any) removed. */
export function stripBlocksHeader(content: string): string {
  return splitBlocksHeader(content).body;
}

export function getBlocksWorkspace(file: Pick<ProjectFile, "content">): unknown | null {
  return splitBlocksHeader(file.content).workspace;
}

export function fileMode(file: ProjectFile): FileMode {
  if (file.mode) return file.mode;
  return getBlocksWorkspace(file) !== null ? "blocks" : "python";
}

export function baseName(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

/** Monaco language id for a project file. */
export function languageForFile(name: string): string {
  return /\.pyi?$/i.test(name) ? "python" : "plaintext";
}

export function fileToProject(file: ProjectFile, settings: ProjectSettings, createdAt: string): AnyProject {
  const title = baseName(file.name).replace(/\.py$/, "");
  if (fileMode(file) === "blocks") {
    const workspace = getBlocksWorkspace(file) ?? newBlocksProject().workspace;
    return { format: "b2op-hub-blocks", version: PROJECT_VERSION, type: "blocks", title, createdAt, settings, workspace };
  }
  return { format: "b2op-hub-blocks", version: PROJECT_VERSION, type: "python", title, createdAt, settings, source: file.content };
}

export function projectToFileContent(project: AnyProject, currentPythonPreview: string): string {
  if (project.type === "blocks") return withBlocksHeader(project.workspace, currentPythonPreview);
  return project.source;
}

/** 32-bit FNV-1a over UTF-16 code units, hex. Cheap change detection for uploads. */
export function hashContent(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + ":" + s.length.toString(36);
}

export function newMainFile(kind: FileMode): ProjectFile {
  return kind === "blocks"
    ? { id: crypto.randomUUID(), name: "main.py", content: withBlocksHeader(newBlocksProject().workspace, ""), mode: "blocks" }
    : { id: crypto.randomUUID(), name: "main.py", content: "", mode: "python" };
}

export function newMultiFileProject(title = "Untitled", kind: FileMode = "blocks"): MultiFileProject {
  const main = newMainFile(kind);
  const now = new Date().toISOString();
  return {
    format: "b2op-hub-v3",
    version: "3.0.0",
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    settings: { ...DEFAULT_SETTINGS },
    files: [main],
    folders: [],
    openFileIds: [main.id],
    activeFileId: main.id,
    upload: null,
  };
}

/** Fill defaults for projects stored by older versions (pre multi-project). */
export function normalizeProject(raw: unknown): MultiFileProject | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<MultiFileProject>;
  if (p.format !== "b2op-hub-v3" || !Array.isArray(p.files)) return null;
  const files = p.files.filter((f) => f && typeof f.id === "string" && typeof f.name === "string")
    .map((f) => ({ ...f, content: typeof f.content === "string" ? f.content : "" }));
  const ids = new Set(files.map((f) => f.id));
  const openFileIds = (Array.isArray(p.openFileIds) ? p.openFileIds : []).filter((id) => ids.has(id));
  const activeFileId = p.activeFileId && ids.has(p.activeFileId) ? p.activeFileId : (openFileIds[0] ?? files[0]?.id ?? "");
  if (activeFileId && !openFileIds.includes(activeFileId)) openFileIds.push(activeFileId);
  const now = new Date().toISOString();
  return {
    format: "b2op-hub-v3",
    version: "3.0.0",
    id: typeof p.id === "string" ? p.id : crypto.randomUUID(),
    title: typeof p.title === "string" && p.title.trim() ? p.title : "Untitled",
    createdAt: p.createdAt ?? now,
    updatedAt: p.updatedAt ?? p.createdAt ?? now,
    settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
    files,
    folders: Array.isArray(p.folders) ? p.folders.filter((x) => typeof x === "string") : [],
    openFileIds,
    activeFileId,
    upload: p.upload && typeof p.upload === "object" ? p.upload : null,
  };
}
