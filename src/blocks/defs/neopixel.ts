import { PORT_DROPDOWN } from "./hub";

const PIN_DROPDOWN = [["1", "1"], ["2", "2"]] as const;

/**
 * NeoPixel (WS2812) blocks. Single global strip `leds`. Init disables the
 * underlying port so the pin can be repurposed as a NeoPixel data line.
 */
export const NEOPIXEL_BLOCKS = [
  {
    type: "neopixel_init",
    message0: "init NeoPixels on port %1 pin %2 count %3",
    args0: [
      { type: "field_dropdown", name: "PORT", options: [...PORT_DROPDOWN] },
      { type: "field_dropdown", name: "PIN", options: [...PIN_DROPDOWN] },
      { type: "input_value", name: "NUM", check: "Number" },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 120,
    advanced: true,
    inputsInline: true,
    tooltip: "Disables the port and creates a NeoPixel strip on the chosen pin. Place in setup.",
  },
  {
    type: "neopixel_set_rgb",
    message0: "set NeoPixel %1 to R %2 G %3 B %4",
    args0: [
      { type: "input_value", name: "INDEX", check: "Number" },
      { type: "input_value", name: "R", check: "Number" },
      { type: "input_value", name: "G", check: "Number" },
      { type: "input_value", name: "B", check: "Number" },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 120,
    advanced: true,
    inputsInline: true,
  },
  {
    type: "neopixel_set_hsv",
    message0: "set NeoPixel %1 to hue %2 sat %3 val %4",
    args0: [
      { type: "input_value", name: "INDEX", check: "Number" },
      { type: "input_value", name: "H", check: "Number" },
      { type: "input_value", name: "S", check: "Number" },
      { type: "input_value", name: "V", check: "Number" },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 120,
    advanced: true,
    inputsInline: true,
    tooltip: "Hue/saturation/value each 0.0-1.0. Hue wraps.",
  },
  {
    type: "neopixel_fill",
    message0: "fill NeoPixels R %1 G %2 B %3",
    args0: [
      { type: "input_value", name: "R", check: "Number" },
      { type: "input_value", name: "G", check: "Number" },
      { type: "input_value", name: "B", check: "Number" },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 120,
    advanced: true,
    inputsInline: true,
  },
  {
    type: "neopixel_clear",
    message0: "clear NeoPixels",
    previousStatement: null,
    nextStatement: null,
    colour: 120,
    advanced: true,
    tooltip: "Fill all pixels black and write.",
  },
  {
    type: "neopixel_rainbow",
    message0: "rainbow NeoPixels start hue %1 step %2 sat %3 val %4",
    args0: [
      { type: "input_value", name: "START", check: "Number" },
      { type: "input_value", name: "STEP", check: "Number" },
      { type: "input_value", name: "SAT", check: "Number" },
      { type: "input_value", name: "VAL", check: "Number" },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 120,
    advanced: true,
    inputsInline: true,
    tooltip: "Draw HSV rainbow across the strip. Values 0.0-1.0.",
  },
  {
    type: "neopixel_write",
    message0: "update NeoPixels",
    previousStatement: null,
    nextStatement: null,
    colour: 120,
    advanced: true,
    tooltip: "Push buffered pixel values to the strip.",
  },
  {
    type: "neopixel_length",
    message0: "NeoPixel count",
    output: "Number",
    colour: 120,
    advanced: true,
  },
] as const;
