// Scenes: LVGL screens laid out in the scene editor. Pure data helpers (no
// React, no store).
//
// A scene lives in an ordinary `<module>.py` project file whose first line is
// `# __scene__: <json>` (the editable SceneDoc) followed by the Python the
// scene editor generates from it (see codegen.ts). Programs `import <module>`
// and call `<module>.show()`; every widget is a module global (`label0`, …).

export const SCENE_FORMAT = "b2op-scene";
export const SCENE_VERSION = 1;
export const SCENE_HEADER_PREFIX = "# __scene__: ";
/** Hub LCD resolution (ST7735, landscape). */
export const SCREEN_W = 160;
export const SCREEN_H = 128;

export type SceneKind =
  // display
  | "label" | "panel" | "line" | "bar" | "arc" | "led" | "spinner" | "image" | "qrcode"
  | "chart" | "scale" | "table" | "textarea"
  // focusable (driven by the hub buttons)
  | "button" | "list" | "roller" | "dropdown" | "slider" | "checkbox" | "switch"
  | "scrollbox" | "tabview";

export type FontSize = 14 | 16 | 24;
export const FONT_SIZES: FontSize[] = [14, 16, 24];
export type TextAlign = "left" | "center" | "right";
/** LVGL label long modes, in lv_label_long_mode_t order. */
export const LONG_MODES = ["wrap", "dots", "scroll", "circular", "clip"] as const;
export type LongMode = (typeof LONG_MODES)[number];

export interface SceneWidget {
  /** Stable key (not shown). */
  uid: string;
  kind: SceneKind;
  /** Python identifier: the module global holding the widget. */
  name: string;
  /** Container widget uid (panel / scrollbox / tabview); absent = scene root. */
  parent?: string;
  /** tabview parent only: index of the tab the widget sits on. */
  tab?: number;
  /** Position relative to the parent's top-left corner (LCD pixels). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Start hidden (show it from code). */
  hidden?: boolean;

  // ── Appearance (absent = LVGL theme default) ──
  /** Text / indicator / line / LED colour, "#rrggbb". */
  color?: string;
  /** Background colour, "#rrggbb". */
  bg?: string;
  border?: number;
  borderColor?: string;
  radius?: number;
  font?: FontSize;
  align?: TextAlign;

  // ── Kind-specific ──
  /** label / button / checkbox / textarea text; qrcode data. */
  text?: string;
  longMode?: LongMode;
  /** bar / arc / slider / scale range; chart y range. */
  min?: number;
  max?: number;
  /** bar / arc / slider value; roller / dropdown / tabview selected index. */
  value?: number;
  /** checkbox / switch checked; led on. */
  checked?: boolean;
  /** list / roller / dropdown options; tabview tab names. */
  items?: string[];
  /** list only: LVGL symbol name per item ("" = none), e.g. "PLAY". */
  icons?: string[];
  /** line: points relative to the widget position. */
  points?: [number, number][];
  /** line width / arc width. */
  width?: number;
  /** image: PNG path (relative to the scene file, or absolute like /sd/x.png). */
  src?: string;
  /** chart: initial values (one series). */
  values?: number[];
  chartType?: "line" | "bar";
  /** scale: total ticks / major tick every n. */
  ticks?: number;
  majorEvery?: number;
  /** table: cell text, row-major. */
  cells?: string[][];
  /** tabview: tab bar height. */
  barSize?: number;
}

export interface SceneDoc {
  format: typeof SCENE_FORMAT;
  version: number;
  /** Scene background, "#rrggbb". */
  bg: string;
  widgets: SceneWidget[];
}

export const KIND_LABEL: Record<SceneKind, string> = {
  label: "Label",
  panel: "Panel",
  line: "Line",
  bar: "Bar",
  arc: "Arc",
  led: "LED",
  spinner: "Spinner",
  image: "Image",
  qrcode: "QR code",
  chart: "Chart",
  scale: "Scale",
  table: "Table",
  textarea: "Text box",
  button: "Button",
  list: "Menu list",
  roller: "Roller",
  dropdown: "Dropdown",
  slider: "Slider",
  checkbox: "Checkbox",
  switch: "Switch",
  scrollbox: "Scroll box",
  tabview: "Tabs",
};

export const DISPLAY_KINDS: SceneKind[] = [
  "label", "panel", "line", "bar", "arc", "led", "spinner", "image", "qrcode", "chart", "scale", "table", "textarea",
];
export const INPUT_KINDS: SceneKind[] = [
  "button", "list", "roller", "dropdown", "slider", "checkbox", "switch", "scrollbox", "tabview",
];
/** Kinds that can hold child widgets. */
export const CONTAINER_KINDS: SceneKind[] = ["panel", "scrollbox", "tabview"];
/** Kinds that report events to `<module>.on(name, cb)`. */
export const EVENT_KINDS: SceneKind[] = ["button", "list", "roller", "dropdown", "slider", "checkbox", "switch", "tabview"];
/** Kinds with a number value (`set value` / `value of` blocks). */
export const VALUE_KINDS: SceneKind[] = ["bar", "arc", "slider", "roller", "dropdown", "tabview", "list"];
/** Kinds with on/off state. */
export const CHECK_KINDS: SceneKind[] = ["checkbox", "switch", "led"];
/** Kinds with a text. */
export const TEXT_KINDS: SceneKind[] = ["label", "button", "checkbox", "textarea", "qrcode"];
/** Kinds with an option list. */
export const ITEM_KINDS: SceneKind[] = ["list", "roller", "dropdown"];

export const isContainer = (k: SceneKind) => CONTAINER_KINDS.includes(k);

/** What `<module>.on(name, cb)` passes to `cb`, per kind. */
export function eventArgs(kind: SceneKind): ("index" | "text" | "value")[] {
  switch (kind) {
    case "button": return [];
    case "list": case "roller": case "dropdown": case "tabview": return ["index", "text"];
    case "slider": case "checkbox": case "switch": return ["value"];
    default: return [];
  }
}

/** LVGL symbols usable as list item icons (lv.SYMBOL.<name>). */
export const SYMBOLS = [
  "", "PLAY", "PAUSE", "STOP", "PREV", "NEXT", "LEFT", "RIGHT", "UP", "DOWN", "OK", "CLOSE", "PLUS", "MINUS",
  "SETTINGS", "HOME", "POWER", "REFRESH", "LIST", "EDIT", "TRASH", "SAVE", "FILE", "DIRECTORY", "IMAGE", "AUDIO",
  "VIDEO", "VOLUME_MAX", "MUTE", "BELL", "WARNING", "CHARGE", "BATTERY_FULL", "BLUETOOTH", "WIFI", "USB", "GPS",
  "EYE_OPEN", "LOOP", "SHUFFLE", "BULLET",
];

// ── Header (scene file = header line + generated Python) ──────────────────────

export function isSceneContent(content: string): boolean {
  return content.startsWith(SCENE_HEADER_PREFIX);
}

export interface SplitScene {
  doc: SceneDoc | null;
  /** Problem parsing the header, when it is present but broken. */
  error: string | null;
  body: string;
}

export function splitSceneHeader(content: string): SplitScene {
  if (!isSceneContent(content)) return { doc: null, error: null, body: content };
  const nl = content.indexOf("\n");
  const header = (nl === -1 ? content : content.slice(0, nl)).replace(/\r$/, "");
  const body = nl === -1 ? "" : content.slice(nl + 1);
  try {
    return { doc: parseScene(header.slice(SCENE_HEADER_PREFIX.length)), error: null, body };
  } catch (e) {
    return { doc: null, error: (e as Error).message, body };
  }
}

export function withSceneHeader(doc: SceneDoc, body: string): string {
  return `${SCENE_HEADER_PREFIX}${JSON.stringify(doc)}\n${body}`;
}

// ── Parse / serialize ─────────────────────────────────────────────────────────

export function emptyScene(): SceneDoc {
  return { format: SCENE_FORMAT, version: SCENE_VERSION, bg: "#000000", widgets: [] };
}

/** Parse the header JSON. Throws with a user-facing message. */
export function parseScene(json: string): SceneDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`Not valid JSON: ${(e as Error).message}`);
  }
  const r = raw as Partial<SceneDoc> | null;
  if (!r || typeof r !== "object" || r.format !== SCENE_FORMAT || !Array.isArray(r.widgets)) {
    throw new Error("Not a scene.");
  }
  if (typeof r.version === "number" && r.version > SCENE_VERSION) {
    throw new Error(`Made by a newer version of the editor (scene v${r.version}).`);
  }
  const widgets = r.widgets
    .filter((w): w is SceneWidget =>
      !!w && typeof w === "object" && typeof w.kind === "string" && w.kind in KIND_LABEL && typeof w.name === "string")
    .map((w) => ({ ...defaultsFor(w.kind), ...w, uid: typeof w.uid === "string" && w.uid ? w.uid : newUid() }));
  // Drop dangling parents (container deleted by hand-editing).
  const uids = new Set(widgets.map((w) => w.uid));
  for (const w of widgets) if (w.parent && !uids.has(w.parent)) delete w.parent;
  return { format: SCENE_FORMAT, version: SCENE_VERSION, bg: typeof r.bg === "string" ? r.bg : "#000000", widgets };
}

export function tryParseScene(json: string): SceneDoc | null {
  try { return parseScene(json); } catch { return null; }
}

export function newUid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/** Kind-specific defaults (size + options). */
export function defaultsFor(kind: SceneKind): Partial<SceneWidget> {
  switch (kind) {
    case "label": return { w: 80, h: 16, text: "Text", color: "#ffffff" };
    case "panel": return { w: 60, h: 40, bg: "#2196f3", radius: 4, border: 0 };
    case "line": return { w: 60, h: 20, points: [[0, 0], [60, 20]], width: 2, color: "#ffffff" };
    case "bar": return { w: 100, h: 10, min: 0, max: 100, value: 50 };
    case "arc": return { w: 60, h: 60, min: 0, max: 100, value: 50, width: 6 };
    case "led": return { w: 16, h: 16, color: "#ff0000", checked: true };
    case "spinner": return { w: 32, h: 32 };
    case "image": return { w: 32, h: 32, src: "image.png" };
    case "qrcode": return { w: 64, h: 64, text: "https://example.com" };
    case "chart": return { w: 120, h: 60, min: 0, max: 100, values: [10, 40, 30, 70, 50], chartType: "line" };
    case "scale": return { w: 120, h: 24, min: 0, max: 100, ticks: 11, majorEvery: 5 };
    case "table": return { w: 140, h: 60, cells: [["A", "1"], ["B", "2"]] };
    case "textarea": return { w: 140, h: 48, text: "Line 1\nLine 2" };
    case "button": return { w: 60, h: 24, text: "OK" };
    case "list": return { w: 120, h: 80, items: ["Start", "Settings", "About"], icons: ["PLAY", "SETTINGS", ""] };
    case "roller": return { w: 80, h: 60, items: ["One", "Two", "Three"], value: 0 };
    case "dropdown": return { w: 100, h: 24, items: ["Low", "Medium", "High"], value: 0 };
    case "slider": return { w: 100, h: 8, min: 0, max: 100, value: 50 };
    case "checkbox": return { w: 80, h: 20, text: "Enable", checked: false };
    case "switch": return { w: 40, h: 20, checked: false };
    case "scrollbox": return { w: 120, h: 80, border: 1 };
    case "tabview": return { w: 160, h: 128, items: ["Tab 1", "Tab 2"], value: 0, barSize: 20 };
  }
}

// ── Names ─────────────────────────────────────────────────────────────────────

const PY_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
  "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal",
  "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);

/** Globals every generated scene module defines itself. */
export const MODULE_NAMES = new Set([
  "lv", "root", "group", "show", "hide", "is_shown", "on", "set_items", "selected_index", "selected_text", "set_qr",
]);

/** Extra module globals a widget brings along (besides its own name). */
export function helperGlobals(w: Pick<SceneWidget, "kind" | "name">): string[] {
  switch (w.kind) {
    case "button": return [`${w.name}_label`];
    case "chart": return [`${w.name}_series`];
    case "image": return [`${w.name}_dsc`];
    case "tabview": return [`${w.name}_tabs`];
    case "line": return [`${w.name}_points`];
    case "list": return [`${w.name}_buttons`];
    default: return [];
  }
}

export function isIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !PY_KEYWORDS.has(name);
}

/** Problem with a widget name inside `doc` (ignoring widget `uid`), or null. */
export function nameProblem(name: string, doc: SceneDoc, uid?: string, kind?: SceneKind): string | null {
  if (!name) return "Name is empty.";
  if (!isIdentifier(name) || name.startsWith("_")) return "Use letters, digits and _ (not starting with a digit or _, not a Python keyword).";
  if (MODULE_NAMES.has(name)) return `"${name}" is used by the scene module itself.`;
  const taken = new Set<string>(MODULE_NAMES);
  for (const w of doc.widgets) {
    if (w.uid === uid) continue;
    taken.add(w.name);
    for (const h of helperGlobals(w)) taken.add(h);
  }
  if (taken.has(name)) return "Another widget already uses this name.";
  if (kind && helperGlobals({ kind, name }).some((h) => taken.has(h))) return "Clashes with a helper of another widget.";
  return null;
}

/** Module name problem for a scene file name (without .py), or null. */
export function moduleNameProblem(name: string): string | null {
  if (!name) return "Name is empty.";
  if (!isIdentifier(name)) return "Use letters, digits and _ (not starting with a digit, not a Python keyword).";
  if (["hub", "lpf2", "lvgl", "remote", "time", "sys", "math", "main"].includes(name)) return `"${name}" would hide a built-in module.`;
  return null;
}

/** `<kind>0`, `<kind>1`, … — first one free in `doc`. */
export function uniqueName(kind: SceneKind, doc: SceneDoc): string {
  for (let n = 0; ; n++) {
    const name = `${kind}${n}`;
    if (!nameProblem(name, doc, undefined, kind)) return name;
  }
}

export function makeWidget(kind: SceneKind, x: number, y: number, doc: SceneDoc, parent?: string, tab?: number): SceneWidget {
  const w = {
    uid: newUid(),
    kind,
    name: uniqueName(kind, doc),
    x: Math.round(x),
    y: Math.round(y),
    w: 0,
    h: 0,
    ...defaultsFor(kind),
  } as SceneWidget;
  if (parent) w.parent = parent;
  if (tab !== undefined) w.tab = tab;
  return w;
}

// ── Tree helpers ──────────────────────────────────────────────────────────────

export function childrenOf(doc: SceneDoc, parent: string | undefined, tab?: number): SceneWidget[] {
  return doc.widgets.filter((w) => w.parent === parent && (tab === undefined || (w.tab ?? 0) === tab));
}

/** `uid` and every widget nested inside it. */
export function subtree(doc: SceneDoc, uid: string): Set<string> {
  const out = new Set([uid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const w of doc.widgets) if (w.parent && out.has(w.parent) && !out.has(w.uid)) { out.add(w.uid); grew = true; }
  }
  return out;
}

/** Widgets ordered parents-first, keeping the document (z-) order otherwise. */
export function creationOrder(doc: SceneDoc): SceneWidget[] {
  const out: SceneWidget[] = [];
  const visit = (parent: string | undefined) => {
    for (const w of doc.widgets) if (w.parent === parent) { out.push(w); if (isContainer(w.kind)) visit(w.uid); }
  };
  visit(undefined);
  return out;
}

/** "#rrggbb" → "0xRRGGBB" (invalid → fallback). */
export function hexColor(c: string | undefined, fallback = "0x000000"): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(c ?? "");
  return m ? `0x${m[1].toUpperCase()}` : fallback;
}

/** Python module path of a scene file: "scenes/menu.py" → "scenes.menu". */
export function moduleOfPath(path: string): string {
  return path.replace(/\.py$/i, "").split("/").join(".");
}

