import { EVENT_BLOCKS, HUB_BLOCKS } from "./defs/hub";
import { MOTOR_BLOCKS } from "./defs/motor";
import { SENSOR_BLOCKS } from "./defs/sensor";
import { ADVANCED_HUB_BLOCKS } from "./defs/advanced_hub";
import { ADVANCED_MOTOR_BLOCKS } from "./defs/advanced_motor";
import { LVGL_BLOCKS } from "./defs/lvgl";
import { NEOPIXEL_BLOCKS } from "./defs/neopixel";
import { REMOTE_COLOUR } from "./defs/remote";
import { controlSymbols, indicatorSymbols } from "../remote/registry";
import { RemoteType } from "../device/protocol";

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
  if (controls.length) out.push({ kind: "label", text: "Controls" });
  for (const s of controls) out.push({ kind: "block", type: "remote_get", fields: { NAME: s.name } });
  if (indicators.length) out.push({ kind: "label", text: "Indicators" });
  for (const s of indicators) {
    out.push({ kind: "block", type: "remote_set_indicator", fields: { NAME: s.name }, inputs: { VALUE: { shadow: VALUE_SHADOW[s.type] } } });
  }
  return out;
}

interface ToolboxDef {
  advanced?: boolean;
  type: string;
}

/**
 * Default number shadows per (blockType, inputName). When the block is dragged
 * from the flyout, these prefill as light-gray "shadow" number fields — user
 * can type over them, or drop a reporter block which replaces the shadow.
 */
const NUM_SHADOWS: Record<string, Record<string, number>> = {
  hub_led_rgb: { R: 255, G: 255, B: 255 },
  hub_wait: { SECONDS: 1 },
  motor_start_speed: { SPEED: 50 },
  motor_start_power: { POWER: 50 },
  motor_run_for_time: { MS: 1000, SPEED: 50 },
  motor_run_for_degrees: { DEG: 360, SPEED: 50 },
  motor_goto_position: { DEG: 0, SPEED: 50 },
  color_set_light: { L1: 100, L2: 100, L3: 100 },
  distance_set_light: { L1: 100, L2: 100, L3: 100, L4: 100 },
  motor_set_acc_time: { MS: 500 },
  motor_set_dec_time: { MS: 500 },
  basic_motor_power: { POWER: 50 },
  hub_lcd_backlight_duty: { DUTY: 255 },
  hub_lcd_fill: { COLOR: 0 },
  lvgl_label: { X: 10, Y: 10 },
  lvgl_rect: { X: 10, Y: 10, W: 40, H: 20 },
  lvgl_circle: { X: 40, Y: 40, D: 20 },
  lvgl_line: { X1: 0, Y1: 0, X2: 60, Y2: 40, WIDTH: 2 },
  neopixel_init: { NUM: 8 },
  neopixel_set_rgb: { INDEX: 0, R: 255, G: 0, B: 0 },
  neopixel_set_hsv: { INDEX: 0, H: 0, S: 1, V: 1 },
  neopixel_fill: { R: 255, G: 255, B: 255 },
  neopixel_rainbow: { START: 0, STEP: 0.125, SAT: 1, VAL: 1 },
};

const STR_SHADOWS: Record<string, Record<string, string>> = {
  lvgl_label: { TEXT: "hello" },
};

const VALUE_BLOCK_SHADOWS: Record<string, Record<string, { type: string; fields?: Record<string, string | number> }>> = {
  lvgl_screen_bg: { COLOR: { type: "lvgl_hex_color", fields: { HEX: "000000" } } },
  lvgl_rect: { COLOR: { type: "lvgl_hex_color", fields: { HEX: "FF0000" } } },
  lvgl_circle: { COLOR: { type: "lvgl_hex_color", fields: { HEX: "00FF00" } } },
  lvgl_line: { COLOR: { type: "lvgl_hex_color", fields: { HEX: "FFFFFF" } } },
};

function blockWithShadows(type: string) {
  const nums = NUM_SHADOWS[type];
  const strs = STR_SHADOWS[type];
  const values = VALUE_BLOCK_SHADOWS[type];
  if (!nums && !strs && !values) return { kind: "block", type };
  const inputs: Record<string, unknown> = {};
  if (nums) for (const [name, num] of Object.entries(nums)) {
    inputs[name] = { shadow: { type: "math_number", fields: { NUM: num } } };
  }
  if (strs) for (const [name, s] of Object.entries(strs)) {
    inputs[name] = { shadow: { type: "text", fields: { TEXT: s } } };
  }
  if (values) for (const [name, def] of Object.entries(values)) {
    inputs[name] = { shadow: def };
  }
  return { kind: "block", type, inputs };
}

const STANDARD_CATEGORIES = [
  {
    kind: "category",
    name: "Logic",
    categorystyle: "logic_category",
    contents: [
      { kind: "block", type: "controls_if" },
      {
        kind: "block",
        type: "logic_compare",
        inputs: {
          A: { shadow: { type: "math_number", fields: { NUM: 0 } } },
          B: { shadow: { type: "math_number", fields: { NUM: 0 } } },
        },
      },
      { kind: "block", type: "logic_operation" },
      { kind: "block", type: "logic_negate" },
      { kind: "block", type: "logic_boolean" },
    ],
  },
  {
    kind: "category",
    name: "Math",
    categorystyle: "math_category",
    contents: [
      { kind: "block", type: "math_number" },
      {
        kind: "block",
        type: "math_arithmetic",
        inputs: {
          A: { shadow: { type: "math_number", fields: { NUM: 1 } } },
          B: { shadow: { type: "math_number", fields: { NUM: 1 } } },
        },
      },
      {
        kind: "block",
        type: "math_single",
        inputs: { NUM: { shadow: { type: "math_number", fields: { NUM: 9 } } } },
      },
      {
        kind: "block",
        type: "math_modulo",
        inputs: {
          DIVIDEND: { shadow: { type: "math_number", fields: { NUM: 64 } } },
          DIVISOR: { shadow: { type: "math_number", fields: { NUM: 10 } } },
        },
      },
      {
        kind: "block",
        type: "math_random_int",
        inputs: {
          FROM: { shadow: { type: "math_number", fields: { NUM: 1 } } },
          TO: { shadow: { type: "math_number", fields: { NUM: 100 } } },
        },
      },
    ],
  },
  {
    kind: "category",
    name: "Text",
    categorystyle: "text_category",
    contents: [
      { kind: "block", type: "text" },
      {
        kind: "block",
        type: "text_print",
        inputs: { TEXT: { shadow: { type: "text", fields: { TEXT: "hello" } } } },
      },
      { kind: "block", type: "text_length" },
    ],
  },
  {
    kind: "category",
    name: "Lists",
    categorystyle: "list_category",
    contents: ["lists_create_with", "lists_length", "lists_getIndex"].map((t) => ({ kind: "block", type: t })),
  },
  { kind: "category", name: "Variables", categorystyle: "variable_category", custom: "VARIABLE" },
  { kind: "category", name: "Functions", categorystyle: "procedure_category", custom: "PROCEDURE" },
];

function categoryOf(defs: readonly ToolboxDef[], name: string, colour: string, showAdvanced: boolean) {
  const contents = defs
    .filter((d) => showAdvanced || !d.advanced)
    .map((d) => blockWithShadows(d.type));
  return { kind: "category", name, colour, contents };
}

const LOOP_BLOCKS = [
  {
    kind: "block",
    type: "controls_repeat_ext",
    inputs: { TIMES: { shadow: { type: "math_number", fields: { NUM: 10 } } } },
  },
  { kind: "block", type: "controls_whileUntil" },
  {
    kind: "block",
    type: "controls_for",
    inputs: {
      FROM: { shadow: { type: "math_number", fields: { NUM: 1 } } },
      TO: { shadow: { type: "math_number", fields: { NUM: 10 } } },
      BY: { shadow: { type: "math_number", fields: { NUM: 1 } } },
    },
  },
];

export function buildToolbox(showAdvanced: boolean) {
  const screenCategory = showAdvanced ? [categoryOf(LVGL_BLOCKS, "Screen", "280", true)] : [];
  const neopixelCategory = showAdvanced ? [categoryOf(NEOPIXEL_BLOCKS, "NeoPixel", "120", true)] : [];
  const eventContents = EVENT_BLOCKS
    .filter((d) => showAdvanced || !(d as { advanced?: boolean }).advanced)
    .map((d) => blockWithShadows(d.type));
  const controlCategory = {
    kind: "category",
    name: "Control",
    colour: "45",
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
      { kind: "category", name: "Remote", colour: REMOTE_COLOUR, custom: REMOTE_CATEGORY },
      { kind: "sep" },
      controlCategory,
      ...STANDARD_CATEGORIES,
    ],
  };
}
