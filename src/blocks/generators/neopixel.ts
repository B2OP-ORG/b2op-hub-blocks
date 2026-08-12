import type { Block } from "blockly";
import { Order, type PythonGenerator } from "blockly/python";
import { needsLpf2, type Port } from "../setup";

const KEY_MACHINE_IMPORT = "machine_import";
const KEY_NEOPIXEL_IMPORT = "neopixel_import";
const KEY_NEOPIXEL_GLOBAL = "neopixel_global";
const KEY_NEOPIXEL_HSV = "neopixel_hsv_to_rgb";
const KEY_NEOPIXEL_RAINBOW = "neopixel_draw_rainbow";

function defs(gen: PythonGenerator): Record<string, string> {
  return (gen as unknown as { definitions_: Record<string, string> }).definitions_;
}

function needsNeopixel(gen: PythonGenerator): void {
  needsLpf2(gen);
  defs(gen)[KEY_MACHINE_IMPORT] = "import machine";
  defs(gen)[KEY_NEOPIXEL_IMPORT] = "from neopixel import NeoPixel";
  defs(gen)[KEY_NEOPIXEL_GLOBAL] = "leds = None";
}

const HSV_HELPER = [
  "def _neopixel_hsv_to_rgb(h, s, v):",
  "    h = h % 1.0",
  "    i = int(h * 6.0)",
  "    f = (h * 6.0) - i",
  "    p = v * (1.0 - s)",
  "    q = v * (1.0 - s * f)",
  "    t = v * (1.0 - s * (1.0 - f))",
  "    if i == 0: r, g, b = v, t, p",
  "    elif i == 1: r, g, b = q, v, p",
  "    elif i == 2: r, g, b = p, v, t",
  "    elif i == 3: r, g, b = p, q, v",
  "    elif i == 4: r, g, b = t, p, v",
  "    else: r, g, b = v, p, q",
  "    return (int(r * 255), int(g * 255), int(b * 255))",
].join("\n");

const RAINBOW_HELPER = [
  "def _neopixel_draw_rainbow(strip, start_hue, hue_increment, saturation, value):",
  "    n = strip.n if hasattr(strip, 'n') else len(strip)",
  "    for i in range(n):",
  "        r, g, b = _neopixel_hsv_to_rgb(start_hue + i * hue_increment, saturation, value)",
  "        strip[i] = (r, g, b)",
  "    strip.write()",
].join("\n");

function needsHsv(gen: PythonGenerator): void {
  defs(gen)[KEY_NEOPIXEL_HSV] = HSV_HELPER;
}

function needsRainbow(gen: PythonGenerator): void {
  needsHsv(gen);
  defs(gen)[KEY_NEOPIXEL_RAINBOW] = RAINBOW_HELPER;
}

export function registerNeopixelGenerators(gen: PythonGenerator): void {
  const val = (block: Block, name: string, def = "0") =>
    gen.valueToCode(block, name, Order.NONE) || def;

  gen.forBlock["neopixel_init"] = (block: Block) => {
    needsNeopixel(gen);
    const port = block.getFieldValue("PORT") as Port;
    const pin = block.getFieldValue("PIN");
    const num = val(block, "NUM", "8");
    return [
      `hub.ports.${port}.disable()`,
      `global leds`,
      `leds = NeoPixel(machine.Pin(hub.board.PORT_${port}_ID_${pin}), ${num})`,
      ``,
    ].join("\n");
  };

  gen.forBlock["neopixel_set_rgb"] = (block: Block) => {
    needsNeopixel(gen);
    const i = val(block, "INDEX", "0");
    const r = val(block, "R", "0");
    const g = val(block, "G", "0");
    const b = val(block, "B", "0");
    return `leds[${i}] = (${r}, ${g}, ${b})\n`;
  };

  gen.forBlock["neopixel_set_hsv"] = (block: Block) => {
    needsNeopixel(gen);
    needsHsv(gen);
    const i = val(block, "INDEX", "0");
    const h = val(block, "H", "0");
    const s = val(block, "S", "1");
    const v = val(block, "V", "1");
    return `leds[${i}] = _neopixel_hsv_to_rgb(${h}, ${s}, ${v})\n`;
  };

  gen.forBlock["neopixel_fill"] = (block: Block) => {
    needsNeopixel(gen);
    const r = val(block, "R", "0");
    const g = val(block, "G", "0");
    const b = val(block, "B", "0");
    return `leds.fill((${r}, ${g}, ${b}))\n`;
  };

  gen.forBlock["neopixel_clear"] = () => {
    needsNeopixel(gen);
    return `leds.fill((0, 0, 0))\nleds.write()\n`;
  };

  gen.forBlock["neopixel_rainbow"] = (block: Block) => {
    needsNeopixel(gen);
    needsRainbow(gen);
    const start = val(block, "START", "0");
    const step = val(block, "STEP", "0.125");
    const sat = val(block, "SAT", "1");
    const value = val(block, "VAL", "1");
    return `_neopixel_draw_rainbow(leds, ${start}, ${step}, ${sat}, ${value})\n`;
  };

  gen.forBlock["neopixel_write"] = () => {
    needsNeopixel(gen);
    return `leds.write()\n`;
  };

  gen.forBlock["neopixel_length"] = () => {
    needsNeopixel(gen);
    return [`leds.n`, Order.MEMBER];
  };
}
