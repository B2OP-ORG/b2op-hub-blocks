import * as Blockly from "blockly/core";
import { CONTROL_COLOUR, EVENT_BLOCKS, HUB_BLOCKS } from "./defs/hub";
import { MOTOR_BLOCKS } from "./defs/motor";
import { SENSOR_BLOCKS } from "./defs/sensor";
import { ADVANCED_HUB_BLOCKS } from "./defs/advanced_hub";
import { ADVANCED_MOTOR_BLOCKS } from "./defs/advanced_motor";
import { LVGL_BLOCKS } from "./defs/lvgl";
import { NEOPIXEL_BLOCKS } from "./defs/neopixel";
import { REMOTE_COLOUR } from "./defs/remote";
import { REMOTE_GET_BLOCK, remoteValueKind, type RemoteValueKind } from "./remoteKinds";
import { controlSymbols, indicatorSymbols } from "../remote/registry";
import type { RemoteSymbol } from "../remote/layout";
import { RemoteType } from "../device/protocol";
import { SCENE_BLOCKS, SCENE_COLOUR, SCENE_FIELD_KINDS, type SceneFieldKinds } from "./defs/scene";
import { sceneList } from "../scene/registry";
import type { SceneKind } from "../scene/model";

/** Dynamic toolbox category: blocks for the project's scenes. */
export const SCENE_CATEGORY = "SCENES";
/** Flyout button key for "Create scene…". */
export const SCENE_CREATE_BUTTON = "CREATE_SCENE";

/** Dynamic toolbox category: blocks for the project's remote controller names. */
export const REMOTE_CATEGORY = "REMOTE_CONTROLLER";
/** Flyout button key for "Create remote name…". */
export const REMOTE_CREATE_BUTTON = "CREATE_REMOTE_NAME";

const VALUE_SHADOW: Record<RemoteType, { type: string; fields: Record<string, string | number> }> = {
  [RemoteType.Int]: { type: "math_number", fields: { NUM: 0 } },
  [RemoteType.Float]: { type: "math_number", fields: { NUM: 0 } },
  [RemoteType.Bool]: { type: "logic_boolean", fields: { BOOL: "TRUE" } },
  [RemoteType.Str]: { type: "text", fields: { TEXT: "" } },
};

/** Flyout contents of the Remote category (rebuilt every time it opens). */
export function remoteFlyout(): object[] {
  const out: object[] = [{ kind: "button", text: "Create remote name…", callbackkey: REMOTE_CREATE_BUTTON }];
  const controls = controlSymbols();
  const indicators = indicatorSymbols();
  if (!controls.length && !indicators.length) {
    out.push({ kind: "label", text: "Add controls in the remote controller tab." });
    return out;
  }
  const groups: [RemoteValueKind, string][] = [["number", "Number controls"], ["bool", "On/off controls"], ["text", "Text controls"]];
  for (const [kind, label] of groups) {
    const syms = controls.filter((s) => remoteValueKind(s.type) === kind);
    if (!syms.length) continue;
    out.push({ kind: "label", text: label });
    for (const s of syms) out.push({ kind: "block", type: REMOTE_GET_BLOCK[kind], fields: { NAME: s.name } });
  }
  const setBlock = (s: RemoteSymbol) =>
    ({ kind: "block", type: "remote_set_indicator", fields: { NAME: s.name }, inputs: { VALUE: { shadow: VALUE_SHADOW[s.type] } } });
  if (indicators.length) out.push({ kind: "label", text: "Indicators" });
  for (const s of indicators) out.push(setBlock(s));
  // Controls share the id space with indicators: the program may set them too.
  if (controls.length) out.push({ kind: "label", text: "Set controls" });
  for (const s of controls) out.push(setBlock(s));
  return out;
}

/** Flyout contents of the Scenes category (rebuilt every time it opens). */
export function sceneFlyout(): object[] {
  const out: object[] = [{ kind: "button", text: "Create scene…", callbackkey: SCENE_CREATE_BUTTON }];
  const scenes = sceneList();
  if (!scenes.length) {
    out.push({ kind: "label", text: "Make a scene (a screen layout) to use it here." });
    return out;
  }
  const first = scenes[0].module;
  const widgets = scenes.flatMap((s) => s.widgets.map((w) => ({ ref: `${s.module}.${w.name}`, kind: w.kind })));
  /** First widget the field accepts, or null (block left out). */
  const pick = (kinds: SceneFieldKinds) => {
    const allowed = SCENE_FIELD_KINDS[kinds] as readonly SceneKind[] | null;
    return widgets.find((w) => !allowed || allowed.includes(w.kind))?.ref ?? null;
  };
  const block = (type: string) =>
    blockWithShadows(([...SCENE_BLOCKS, ...LVGL_BLOCKS] as readonly ToolboxDef[]).find((d) => d.type === type) ?? { type }) as object;
  const withWidget = (type: string, kinds: SceneFieldKinds, extra: Record<string, unknown> = {}) => {
    const ref = pick(kinds);
    if (ref) out.push({ ...block(type), ...extra, fields: { ...(extra.fields as object ?? {}), WIDGET: ref } });
  };

  out.push({ kind: "label", text: "Scenes" });
  out.push({ ...block("scene_show"), fields: { SCENE: first } });
  out.push({ ...block("scene_hide"), fields: { SCENE: first } });
  out.push({ ...block("scene_is_shown"), fields: { SCENE: first } });
  out.push(block("lvgl_update_screen"));
  if (!widgets.length) {
    out.push({ kind: "label", text: "Add widgets to a scene to change them from blocks." });
    return out;
  }
  out.push({ kind: "label", text: "Widgets" });
  withWidget("scene_set_text", "text");
  withWidget("scene_set_value", "setValue");
  withWidget("scene_get_value", "getValue");
  withWidget("scene_selected_text", "choice");
  withWidget("scene_set_items", "items", {
    inputs: { ITEMS: { block: { type: "lists_create_with", extraState: { itemCount: 2 }, inputs: { ADD0: { shadow: { type: "text", fields: { TEXT: "A" } } }, ADD1: { shadow: { type: "text", fields: { TEXT: "B" } } } } } } },
  });
  withWidget("scene_set_checked", "check");
  withWidget("scene_is_checked", "checked");
  withWidget("scene_chart_add", "chart");
  withWidget("scene_chart_points", "chart");
  withWidget("scene_set_color", "any");
  withWidget("scene_set_visible", "any");
  withWidget("scene_move", "any");
  withWidget("scene_focus", "focus");
  if (pick("event")) {
    out.push({ kind: "label", text: "Events (hub buttons)" });
    withWidget("scene_on_event", "event");
    out.push(block("scene_event_index"), block("scene_event_text"), block("scene_event_value"));
  }
  return out;
}

interface ToolboxDef {
  advanced?: boolean;
  type: string;
  args0?: readonly { type: string; name?: string; check?: string | readonly string[] }[];
}

/** Serialized shadow block (Blockly JSON state). */
export interface ShadowState {
  type: string;
  fields?: Record<string, string | number>;
}

const num = (n: number): ShadowState => ({ type: "math_number", fields: { NUM: n } });
const str = (s: string): ShadowState => ({ type: "text", fields: { TEXT: s } });
const bool = (b = true): ShadowState => ({ type: "logic_boolean", fields: { BOOL: b ? "TRUE" : "FALSE" } });
const color = (c: string): ShadowState => ({ type: "color_literal", fields: { COLOR: c } });

/**
 * Default shadow per (blockType, inputName). Used for toolbox blocks and by the
 * auto-shadow listener when an input ends up empty (mutator-added input, block
 * loaded from an older project). Inputs not listed fall back to
 * `shadowForCheck()`.
 */
const INPUT_DEFAULTS: Record<string, Record<string, ShadowState>> = {
  // Hub / control
  hub_led_color: { COLOR: color("BLUE") },
  hub_led_rgb: { R: num(255), G: num(255), B: num(255) },
  hub_wait: { SECONDS: num(1) },
  hub_lcd_backlight_duty: { DUTY: num(255) },
  hub_lcd_fill: { COLOR: num(0) },
  // Scenes
  scene_set_text: { TEXT: str("Hello") },
  scene_set_value: { VALUE: num(50) },
  scene_set_checked: { STATE: bool() },
  scene_set_color: { COLOR: color("RED") },
  scene_move: { X: num(10), Y: num(10) },
  scene_chart_add: { VALUE: num(50) },
  scene_chart_points: { COUNT: num(20) },
  // Motor
  motor_start_speed: { SPEED: num(50) },
  motor_start_power: { POWER: num(50) },
  motor_run_for_time: { MS: num(1000), SPEED: num(50) },
  motor_run_for_degrees: { DEG: num(360), SPEED: num(50) },
  motor_goto_position: { DEG: num(0), SPEED: num(50) },
  motor_set_acc_time: { MS: num(500) },
  motor_set_dec_time: { MS: num(500) },
  basic_motor_power: { POWER: num(50) },
  // Sensor
  color_set_light: { L1: num(100), L2: num(100), L3: num(100) },
  distance_set_light: { L1: num(100), L2: num(100), L3: num(100), L4: num(100) },
  // Screen
  lvgl_screen_bg: { COLOR: color("BLACK") },
  lvgl_label: { TEXT: str("hello"), X: num(10), Y: num(10) },
  lvgl_rect: { X: num(10), Y: num(10), W: num(40), H: num(20), COLOR: color("RED") },
  lvgl_circle: { X: num(40), Y: num(40), D: num(20), COLOR: color("GREEN") },
  lvgl_line: { X1: num(0), Y1: num(0), X2: num(60), Y2: num(40), COLOR: color("WHITE"), WIDTH: num(2) },
  // NeoPixel
  neopixel_init: { NUM: num(8) },
  neopixel_set_rgb: { INDEX: num(0), R: num(255), G: num(0), B: num(0) },
  neopixel_set_hsv: { INDEX: num(0), H: num(0), S: num(1), V: num(1) },
  neopixel_fill: { R: num(255), G: num(255), B: num(255) },
  neopixel_rainbow: { START: num(0), STEP: num(0.125), SAT: num(1), VAL: num(1) },
  // Loops
  controls_repeat_ext: { TIMES: num(10) },
  controls_whileUntil: { BOOL: bool() },
  controls_for: { FROM: num(1), TO: num(10), BY: num(1) },
  // Logic
  controls_if: { IF0: bool() },
  logic_compare: { A: num(0), B: num(0) },
  logic_operation: { A: bool(), B: bool() },
  logic_negate: { BOOL: bool() },
  // Math
  math_arithmetic: { A: num(1), B: num(1) },
  math_single: { NUM: num(9) },
  math_modulo: { DIVIDEND: num(64), DIVISOR: num(10) },
  math_random_int: { FROM: num(1), TO: num(100) },
  math_change: { DELTA: num(1) },
  // Text
  text_print: { TEXT: str("hello") },
  text_join: { ADD0: str("hello "), ADD1: str("world") },
  text_append: { TEXT: str("text") },
  text_length: { VALUE: str("abc") },
  text_isEmpty: { VALUE: str("") },
  text_indexOf: { VALUE: str("hello"), FIND: str("l") },
  text_charAt: { VALUE: str("abc"), AT: num(1) },
  text_getSubstring: { STRING: str("hello world"), AT1: num(1), AT2: num(5) },
  text_changeCase: { TEXT: str("abc") },
  text_trim: { TEXT: str("  abc  ") },
  text_count: { TEXT: str("banana"), SUB: str("a") },
  text_replace: { TEXT: str("banana"), FROM: str("a"), TO: str("o") },
  text_reverse: { TEXT: str("abc") },
  // Lists
  lists_create_with: { ADD0: num(1), ADD1: num(2), ADD2: num(3) },
  lists_getIndex: { AT: num(1) },
  // Variables
  variables_set: { VALUE: num(0) },
};

/**
 * Shadow for an input from its connection check: Number → 0, String → "",
 * Boolean → true (first match in check order). Untyped inputs get
 * `untyped`'s shadow; inputs that take lists get none (no literal list shadow).
 */
function shadowForCheck(check: readonly string[] | null | undefined, untyped: "Number" | "String"): ShadowState | null {
  const kinds = check && check.length ? check : [untyped];
  if (kinds.includes("Array")) return null;
  for (const k of kinds) {
    if (k === "Number") return num(0);
    if (k === "String") return str("");
    if (k === "Boolean") return bool();
  }
  return null;
}

/** Default shadow for `blockType`'s value input `inputName`, or null for none. */
export function defaultShadow(blockType: string, inputName: string, check: readonly string[] | null | undefined): ShadowState | null {
  const explicit = INPUT_DEFAULTS[blockType]?.[inputName];
  if (explicit) return explicit;
  return shadowForCheck(check, blockType.startsWith("text_") ? "String" : "Number");
}

/** Toolbox entry for a built-in block, prefilled with its INPUT_DEFAULTS shadows. */
function tb(type: string) {
  const defaults = INPUT_DEFAULTS[type];
  if (!defaults) return { kind: "block", type };
  const inputs: Record<string, unknown> = {};
  for (const [name, shadow] of Object.entries(defaults)) inputs[name] = { shadow };
  return { kind: "block", type, inputs };
}

/** Toolbox entry for a custom JSON-defined block: every value input gets a shadow. */
function blockWithShadows(def: ToolboxDef) {
  const inputs: Record<string, unknown> = {};
  for (const arg of def.args0 ?? []) {
    if (arg.type !== "input_value" || !arg.name) continue;
    const check = arg.check === undefined ? null : typeof arg.check === "string" ? [arg.check] : arg.check;
    const shadow = defaultShadow(def.type, arg.name, check);
    if (shadow) inputs[arg.name] = { shadow };
  }
  return Object.keys(inputs).length ? { kind: "block", type: def.type, inputs } : { kind: "block", type: def.type };
}

const STANDARD_CATEGORIES = [
  {
    kind: "category",
    name: "Logic",
    categorystyle: "logic_category",
    contents: ["controls_if", "logic_compare", "logic_operation", "logic_negate"].map(tb),
  },
  {
    kind: "category",
    name: "Math",
    categorystyle: "math_category",
    contents: ["math_arithmetic", "math_single", "math_modulo", "math_random_int"].map(tb),
  },
  {
    kind: "category",
    name: "Text",
    categorystyle: "text_category",
    contents: [
      "text_print",
      "text_join",
      "text_append",
      "text_length",
      "text_isEmpty",
      "text_indexOf",
      "text_charAt",
      "text_getSubstring",
      "text_changeCase",
      "text_trim",
      "text_count",
      "text_replace",
      "text_reverse",
    ].map(tb),
  },
  {
    kind: "category",
    name: "Lists",
    categorystyle: "list_category",
    contents: ["lists_create_with", "lists_length", "lists_getIndex"].map(tb),
  },
  { kind: "category", name: "Variables", categorystyle: "variable_category", custom: "VARIABLE" },
  { kind: "category", name: "Functions", categorystyle: "procedure_category", custom: "PROCEDURE" },
];

/**
 * Variables flyout: Blockly's own contents, with default shadows added (the
 * stock `set variable to` has an empty input).
 */
export function variablesFlyout(workspace: Blockly.WorkspaceSvg): Blockly.utils.toolbox.FlyoutItemInfoArray {
  const items = Blockly.Variables.flyoutCategory(workspace, false) as Blockly.utils.toolbox.FlyoutItemInfoArray;
  return items.map((item) => {
    if (item.kind !== "block" || !("type" in item) || !item.type) return item;
    const defaults = INPUT_DEFAULTS[item.type];
    if (!defaults) return item;
    const inputs: Record<string, unknown> = { ...((item as { inputs?: Record<string, unknown> }).inputs ?? {}) };
    for (const [name, shadow] of Object.entries(defaults)) inputs[name] ??= { shadow };
    return { ...item, inputs } as Blockly.utils.toolbox.FlyoutItemInfo;
  });
}

function categoryOf(defs: readonly ToolboxDef[], name: string, colour: string, showAdvanced: boolean) {
  const contents = defs
    .filter((d) => showAdvanced || !d.advanced)
    .map(blockWithShadows);
  return { kind: "category", name, colour, contents };
}

const LOOP_BLOCKS = ["controls_repeat_ext", "controls_whileUntil", "controls_for"].map(tb);

export function buildToolbox(showAdvanced: boolean) {
  const screenCategory = showAdvanced ? [categoryOf(LVGL_BLOCKS, "Screen", "280", true)] : [];
  const neopixelCategory = showAdvanced ? [categoryOf(NEOPIXEL_BLOCKS, "NeoPixel", "120", true)] : [];
  const eventContents = EVENT_BLOCKS
    .filter((d) => showAdvanced || !(d as { advanced?: boolean }).advanced)
    .map(blockWithShadows);
  const controlCategory = {
    kind: "category",
    name: "Control",
    colour: CONTROL_COLOUR,
    contents: [...eventContents, ...LOOP_BLOCKS],
  };
  return {
    kind: "categoryToolbox",
    contents: [
      categoryOf([...HUB_BLOCKS, ...ADVANCED_HUB_BLOCKS], "Hub", "210", showAdvanced),
      categoryOf([...MOTOR_BLOCKS, ...ADVANCED_MOTOR_BLOCKS], "Motor", "160", showAdvanced),
      categoryOf(SENSOR_BLOCKS, "Sensor", "260", showAdvanced),
      ...screenCategory,
      ...neopixelCategory,
      { kind: "category", name: "Scenes", colour: SCENE_COLOUR, custom: SCENE_CATEGORY },
      { kind: "category", name: "Remote", colour: REMOTE_COLOUR, custom: REMOTE_CATEGORY },
      { kind: "sep" },
      controlCategory,
      ...STANDARD_CATEGORIES,
    ],
  };
}
