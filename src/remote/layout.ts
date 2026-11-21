// Remote controller layouts: the `.remote` project files edited in the
// remote controller tab. Pure data helpers (no React, no store).
//
// A layout is a canvas of widgets. Controls (slider, switch, button, joystick,
// text input) are host → hub values the program reads as `remote.<name>`;
// indicators (display, LED, gauge) show program messages sent with
// `remote.create_message(id, name, type)` / `remote.send(id, value)`.
// Controls and indicators share one id space and one set of names (like on
// the hub); a program may also set a control with `remote.send(id, value)`.
//
// A project has one layout today (DEFAULT_REMOTE_FILE), but everything here
// works on a list of files so more can be added later.

import { REMOTE_MAX_NAME, RemoteType, type RemoteValue } from "../device/protocol";

export const REMOTE_EXT = ".remote";
export const DEFAULT_REMOTE_FILE = "controller.remote";
export const LAYOUT_FORMAT = "b2op-remote";
export const LAYOUT_VERSION = 1;
/** Canvas grid (px): widgets snap to it while moved / resized. */
export const GRID = 8;

export type ControlKind = "slider" | "switch" | "button" | "joystick" | "text_input";
export type IndicatorKind = "display" | "led" | "gauge";
export type WidgetKind = ControlKind | IndicatorKind;
export type Role = "control" | "indicator";
/** Value type names as shown in the UI (map to RemoteType). */
export type ValueType = "int" | "float" | "bool" | "str";

export interface Widget {
  /** Stable key (not the protocol id). */
  uid: string;
  kind: WidgetKind;
  name: string;
  /** Protocol id (0..255): control id, or message id for indicators. Joystick: X axis. */
  id: number;
  /** Joystick only: id of the Y axis control. */
  idY?: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** slider / display / gauge: number type; display may also be "bool" / "str". */
  valueType?: ValueType;
  /** slider / gauge range, joystick ±range. */
  min?: number;
  max?: number;
  step?: number;
  /** slider: start value. */
  initial?: number;
  /** slider: return to `initial` when released. */
  springBack?: boolean;
  /** gauge: bar or dial. */
  style?: "bar" | "dial";
  /** led: colour when on. */
  color?: string;
}

export interface RemoteLayout {
  format: typeof LAYOUT_FORMAT;
  version: number;
  widgets: Widget[];
}

export const CONTROL_KINDS: ControlKind[] = ["slider", "switch", "button", "joystick", "text_input"];
export const INDICATOR_KINDS: IndicatorKind[] = ["display", "led", "gauge"];

export const KIND_LABEL: Record<WidgetKind, string> = {
  slider: "Slider",
  switch: "Switch",
  button: "Button",
  joystick: "Joystick",
  text_input: "Text input",
  display: "Display",
  led: "LED",
  gauge: "Gauge",
};

export function roleOf(kind: WidgetKind): Role {
  return (INDICATOR_KINDS as string[]).includes(kind) ? "indicator" : "control";
}

export function isRemoteFile(name: string): boolean {
  return name.toLowerCase().endsWith(REMOTE_EXT);
}

export function emptyLayout(): RemoteLayout {
  return { format: LAYOUT_FORMAT, version: LAYOUT_VERSION, widgets: [] };
}

export function serializeLayout(l: RemoteLayout): string {
  return JSON.stringify(l, null, 2) + "\n";
}

/** Parse a `.remote` file. Empty content = empty layout. Throws with a user-facing message. */
export function parseLayout(content: string): RemoteLayout {
  if (!content.trim()) return emptyLayout();
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    throw new Error(`Not valid JSON: ${(e as Error).message}`);
  }
  const r = raw as Partial<RemoteLayout> | null;
  if (!r || typeof r !== "object" || r.format !== LAYOUT_FORMAT || !Array.isArray(r.widgets)) {
    throw new Error("Not a remote controller layout.");
  }
  if (typeof r.version === "number" && r.version > LAYOUT_VERSION) {
    throw new Error(`Made by a newer version of the editor (layout v${r.version}).`);
  }
  const widgets = r.widgets.filter((w): w is Widget =>
    !!w && typeof w === "object" && typeof w.kind === "string" && w.kind in KIND_LABEL && typeof w.name === "string",
  ).map((w) => ({ ...defaultsFor(w.kind), ...w, uid: typeof w.uid === "string" && w.uid ? w.uid : newUid() }));
  return { format: LAYOUT_FORMAT, version: LAYOUT_VERSION, widgets };
}

/** Parse, or null when the content is broken. */
export function tryParseLayout(content: string): RemoteLayout | null {
  try { return parseLayout(content); } catch { return null; }
}

function newUid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/** Kind-specific defaults (size + options). */
export function defaultsFor(kind: WidgetKind): Partial<Widget> {
  switch (kind) {
    case "slider": return { w: 240, h: 72, valueType: "int", min: -100, max: 100, step: 1, initial: 0, springBack: false };
    case "switch": return { w: 128, h: 64 };
    case "button": return { w: 128, h: 64 };
    case "joystick": return { w: 168, h: 192, max: 100 };
    case "text_input": return { w: 240, h: 64 };
    case "display": return { w: 160, h: 64, valueType: "float" };
    case "led": return { w: 104, h: 72, color: "#22c55e" };
    case "gauge": return { w: 216, h: 88, valueType: "float", min: 0, max: 100, style: "bar" };
  }
}

// ── Symbols ───────────────────────────────────────────────────────────────────

/** One `remote` name a layout defines. */
export interface RemoteSymbol {
  name: string;
  id: number;
  type: RemoteType;
  role: Role;
  kind: WidgetKind;
  /** Project file (path) that defines it. */
  file: string;
  /** Widget that defines it. */
  uid: string;
}

export function remoteTypeOf(v: ValueType): RemoteType {
  return v === "int" ? RemoteType.Int : v === "float" ? RemoteType.Float : v === "bool" ? RemoteType.Bool : RemoteType.Str;
}

export function valueTypeOf(t: RemoteType): ValueType {
  return t === RemoteType.Int ? "int" : t === RemoteType.Float ? "float" : t === RemoteType.Bool ? "bool" : "str";
}

/** Joystick axis control names. */
export function joystickNames(name: string): [string, string] {
  return [`${name}_x`, `${name}_y`];
}

/** The remote names (controls / indicators) a widget defines. */
export function widgetSymbols(w: Widget, file: string): RemoteSymbol[] {
  const base = { role: roleOf(w.kind), kind: w.kind, file, uid: w.uid };
  switch (w.kind) {
    case "slider": return [{ ...base, name: w.name, id: w.id, type: w.valueType === "float" ? RemoteType.Float : RemoteType.Int }];
    case "switch":
    case "button": return [{ ...base, name: w.name, id: w.id, type: RemoteType.Bool }];
    case "text_input": return [{ ...base, name: w.name, id: w.id, type: RemoteType.Str }];
    case "joystick": {
      const [nx, ny] = joystickNames(w.name);
      return [
        { ...base, name: nx, id: w.id, type: RemoteType.Int },
        { ...base, name: ny, id: w.idY ?? w.id + 1, type: RemoteType.Int },
      ];
    }
    case "display": return [{ ...base, name: w.name, id: w.id, type: remoteTypeOf(w.valueType ?? "float") }];
    case "led": return [{ ...base, name: w.name, id: w.id, type: RemoteType.Bool }];
    case "gauge": return [{ ...base, name: w.name, id: w.id, type: w.valueType === "int" ? RemoteType.Int : RemoteType.Float }];
  }
}

export function layoutSymbols(l: RemoteLayout, file: string): RemoteSymbol[] {
  return l.widgets.flatMap((w) => widgetSymbols(w, file));
}

/** Every remote name defined by the project's `.remote` files (broken files are skipped). */
export function projectSymbols(files: { name: string; content: string }[]): RemoteSymbol[] {
  return files
    .filter((f) => isRemoteFile(f.name))
    .flatMap((f) => {
      const l = tryParseLayout(f.content);
      return l ? layoutSymbols(l, f.name) : [];
    });
}

// ── Validation ───────────────────────────────────────────────────────────────

const PY_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
  "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal",
  "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);
/** Names the `remote` module itself defines: `remote.<name>` is not the control. */
export const REMOTE_MODULE_NAMES = new Set(["get", "items", "age_ms", "send", "create_message", "INT", "FLOAT", "BOOL", "STR"]);

/** True when `remote.<name>` reads the control (valid identifier, not a module name). */
export function isAttrName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !name.startsWith("_") && !PY_KEYWORDS.has(name) && !REMOTE_MODULE_NAMES.has(name);
}

const utf8Len = (s: string) => new TextEncoder().encode(s).length;

/** Problem with a widget name, or null. */
export function nameProblem(name: string, kind: WidgetKind): string | null {
  if (!name) return "Name is empty.";
  const names = kind === "joystick" ? joystickNames(name) : [name];
  if (names.some((n) => utf8Len(n) > REMOTE_MAX_NAME)) return `Name is too long (max ${REMOTE_MAX_NAME} bytes${kind === "joystick" ? " with _x / _y" : ""}).`;
  if (!isAttrName(name)) return "Use letters, digits and _ (not starting with a digit or _, not a Python keyword or a remote function name).";
  return null;
}

/**
 * Problems across all symbols: duplicate names / ids. Controls and
 * indicators share one id space and one set of names (like on the hub).
 */
export function symbolConflicts(symbols: RemoteSymbol[]): { names: Set<string>; ids: Set<number> } {
  const names = new Set<string>();
  const ids = new Set<number>();
  const seenN = new Map<string, number>();
  const seenI = new Map<number, number>();
  for (const s of symbols) {
    seenN.set(s.name, (seenN.get(s.name) ?? 0) + 1);
    seenI.set(s.id, (seenI.get(s.id) ?? 0) + 1);
  }
  for (const [k, c] of seenN) if (c > 1) names.add(k);
  for (const [k, c] of seenI) if (c > 1) ids.add(k);
  return { names, ids };
}

/** True when `s` has a duplicate name or id in `conflicts`. */
export function symbolConflicted(conflicts: ReturnType<typeof symbolConflicts>, s: RemoteSymbol): boolean {
  return conflicts.names.has(s.name) || conflicts.ids.has(s.id);
}

/** Smallest id (0..255) not in `used`, or -1. */
export function freeId(used: Iterable<number>, from = 0): number {
  const u = new Set(used);
  for (let i = from; i < 256; i++) if (!u.has(i)) return i;
  return -1;
}

/** Name based on `base` not in `taken` (base, base2, base3, …). */
export function uniqueSymbolName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}${n}`)) return `${base}${n}`;
}

const DEFAULT_NAME: Record<WidgetKind, string> = {
  slider: "speed", switch: "light", button: "go", joystick: "stick", text_input: "text",
  display: "value", led: "lamp", gauge: "level",
};

/**
 * New widget at (x, y) with a unique name and free id(s). `symbols` = every
 * symbol of the project (so names / ids stay unique across layouts and
 * across controls / indicators).
 */
export function makeWidget(kind: WidgetKind, x: number, y: number, symbols: RemoteSymbol[], name?: string): Widget {
  const takenNames = new Set(symbols.map((s) => s.name));
  const usedIds = symbols.map((s) => s.id);
  const id = freeId(usedIds);
  const w: Widget = {
    uid: newUid(),
    kind,
    name: name ?? uniqueSymbolName(DEFAULT_NAME[kind], takenNames),
    id: Math.max(id, 0),
    x: snap(x),
    y: snap(y),
    w: 0,
    h: 0,
    ...defaultsFor(kind),
  } as Widget;
  if (kind === "joystick") w.idY = Math.max(freeId([...usedIds, w.id]), 0);
  return w;
}

/** Snap to the grid. Positions may be negative (widgets placed left of / above the home view). */
export function snap(v: number): number {
  return Math.round(v / GRID) * GRID || 0;
}

/** Top-left spot below every widget (for widgets added from elsewhere). */
export function freeSpot(l: RemoteLayout): { x: number; y: number } {
  const bottom = l.widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
  return { x: 16, y: snap(bottom + 16) };
}

// ── Values ────────────────────────────────────────────────────────────────────

/** Value a control starts at in run mode. */
export function initialValue(s: RemoteSymbol, w?: Widget): RemoteValue {
  if (w?.kind === "slider") return w.initial ?? 0;
  return s.type === RemoteType.Bool ? false : s.type === RemoteType.Str ? "" : 0;
}

/**
 * What an indicator shows in preview mode, where no program sends values:
 * a plausible sample so the layout can be judged filled in.
 */
export function previewIndicatorValue(w: Widget): RemoteValue | undefined {
  switch (w.kind) {
    case "led": return true;
    case "gauge": {
      const min = w.min ?? 0, max = w.max ?? 100;
      const v = min + (max - min) * 0.65;
      return w.valueType === "int" ? Math.round(v) : Math.round(v * 10) / 10;
    }
    case "display":
      switch (w.valueType) {
        case "int": return 42;
        case "bool": return true;
        case "str": return "Hello";
        default: return 12.5;
      }
    default: return undefined;
  }
}
