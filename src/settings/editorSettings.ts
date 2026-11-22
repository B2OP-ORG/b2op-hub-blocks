/** Global editor settings (persisted in localStorage, not part of a project). */

import { DEFAULT_PANEL_LAYOUT, normalizePanelLayout } from "./panelLayout";

export type LspMode = "off" | "worker" | "remote";

// ── Editor settings (global, persisted in localStorage) ──────────────────────

export type SidebarTabId = "explorer" | "projects" | "sdcard" | "device" | "docs" | "examples";
export const SIDEBAR_TAB_IDS: SidebarTabId[] = ["explorer", "projects", "sdcard", "device", "docs", "examples"];

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

/** When a running program is reloaded after its files change. */
export type AutoReloadMode = "off" | "delay" | "focus";

export interface AutoReloadRule {
  /** off = never; delay = `delaySec` after the last change; focus = when leaving the editor. */
  mode: AutoReloadMode;
  delaySec: number;
}

/** Auto-reload per kind of file: blocks files, scene files, other Python files. */
export interface AutoReloadSettings {
  blocks: AutoReloadRule;
  scenes: AutoReloadRule;
  python: AutoReloadRule;
}

export const DEFAULT_AUTO_RELOAD: AutoReloadSettings = {
  blocks: { mode: "off", delaySec: 1 },
  scenes: { mode: "off", delaySec: 1 },
  python: { mode: "off", delaySec: 2 },
};

/**
 * Scene / remote editors: rotating a widget by its corner handle snaps to
 * `near` degree steps while the pointer is within `distance` screen px of the
 * widget, and to the finer `far` steps further out.
 */
export interface RotateSnapSettings {
  near: number;
  far: number;
  distance: number;
}

export const DEFAULT_ROTATE_SNAP: RotateSnapSettings = { near: 15, far: 1, distance: 80 };

export interface EditorSettings {
  darkMode: boolean;
  showAdvanced: boolean;
  allowRoot: boolean;
  lspMode: LspMode;
  lspRemoteUrl: string;
  toolboxBlockScale: number;
  /** USB connections: ask the hub to echo all BLE traffic to the console (debug). */
  bleEchoOverUsb: boolean;
  sidebar: SidebarSettings;
  monaco: MonacoSettings;
  /** Reload the running program when its files change. */
  autoReload: AutoReloadSettings;
  /** Scene / remote editors: tool panels around the canvas (see panelLayout.ts). */
  panelLayout: string;
  /** Scene / remote editors: snapping of the rotate handle. */
  rotateSnap: RotateSnapSettings;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  darkMode: true,
  showAdvanced: true,
  allowRoot: false,
  lspMode: "worker",
  lspRemoteUrl: "ws://localhost:3001",
  toolboxBlockScale: 0.75,
  bleEchoOverUsb: false,
  sidebar: DEFAULT_SIDEBAR_SETTINGS,
  monaco: DEFAULT_MONACO_SETTINGS,
  autoReload: DEFAULT_AUTO_RELOAD,
  panelLayout: DEFAULT_PANEL_LAYOUT,
  rotateSnap: DEFAULT_ROTATE_SNAP,
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
    autoReload: {
      blocks: { ...DEFAULT_AUTO_RELOAD.blocks, ...(r.autoReload?.blocks ?? {}) },
      scenes: { ...DEFAULT_AUTO_RELOAD.scenes, ...(r.autoReload?.scenes ?? {}) },
      python: { ...DEFAULT_AUTO_RELOAD.python, ...(r.autoReload?.python ?? {}) },
    },
    panelLayout: normalizePanelLayout(r.panelLayout ?? DEFAULT_PANEL_LAYOUT),
    rotateSnap: { ...DEFAULT_ROTATE_SNAP, ...(r.rotateSnap ?? {}) },
  };
}
