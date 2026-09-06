import type { Block } from "blockly";
import { Order, type PythonGenerator } from "blockly/python";
import { needsLvgl } from "../setup";

/** Unique-per-block symbol so multiple widgets can coexist. */
function widgetVar(prefix: string, block: Block): string {
  // Blockly IDs contain chars like `!`; sanitize to identifier-safe form.
  const safe = block.id.replace(/[^A-Za-z0-9]/g, "_").slice(0, 10);
  return `_${prefix}_${safe}`;
}

/** RGB fallbacks for lpf2 color enum. lpf2.color.* are 0..10 indices, not RGB. */
const LPF2_TO_RGB: Record<string, string> = {
  BLACK: "0x000000",
  PINK: "0xFF69B4",
  PURPLE: "0x800080",
  BLUE: "0x0000FF",
  LIGHTBLUE: "0xADD8E6",
  CYAN: "0x00FFFF",
  GREEN: "0x00FF00",
  YELLOW: "0xFFFF00",
  ORANGE: "0xFFA500",
  RED: "0xFF0000",
  WHITE: "0xFFFFFF",
  NONE: "0x000000",
};

const LPF2_COLOR_RE = /^lpf2\.color\.([A-Z]+)$/;

/**
 * If the expression is a bare `lpf2.color.X` (index 0..10), translate to
 * the equivalent 24-bit hex — LVGL expects an RGB int, not a small enum.
 * Anything else (variable, arithmetic) passes through unchanged.
 */
function coerceColor(expr: string, fallback: string): string {
  const e = (expr || fallback).trim();
  const m = LPF2_COLOR_RE.exec(e);
  return m ? LPF2_TO_RGB[m[1]] ?? fallback : e;
}

export function registerLvglGenerators(gen: PythonGenerator): void {
  const val = (block: Block, name: string, def = "0") =>
    gen.valueToCode(block, name, Order.NONE) || def;

  const color = (block: Block, fallback: string) =>
    coerceColor(val(block, "COLOR"), fallback);

  gen.forBlock["lvgl_screen_bg"] = (block: Block) => {
    needsLvgl(gen);
    return `_scr.set_style_bg_color(lv.color_hex(${color(block, "0x000000")}), 0)\n`;
  };

  gen.forBlock["lvgl_clear_screen"] = () => {
    needsLvgl(gen);
    return `_scr.clean()\n`;
  };

  gen.forBlock["lvgl_label"] = (block: Block) => {
    needsLvgl(gen);
    const v = widgetVar("lbl", block);
    return [
      `${v} = lv.label(_scr)`,
      `${v}.set_text(${val(block, "TEXT", '""')})`,
      `${v}.set_pos(${val(block, "X", "0")}, ${val(block, "Y", "0")})`,
      ``,
    ].join("\n");
  };

  gen.forBlock["lvgl_rect"] = (block: Block) => {
    needsLvgl(gen);
    const v = widgetVar("rect", block);
    return [
      `${v} = lv.obj(_scr)`,
      `${v}.set_pos(${val(block, "X", "0")}, ${val(block, "Y", "0")})`,
      `${v}.set_size(${val(block, "W", "20")}, ${val(block, "H", "20")})`,
      `${v}.set_style_bg_color(lv.color_hex(${color(block, "0xFFFFFF")}), 0)`,
      `${v}.set_style_border_width(0, 0)`,
      `${v}.set_style_radius(0, 0)`,
      `${v}.set_style_pad_all(0, 0)`,
      ``,
    ].join("\n");
  };

  gen.forBlock["lvgl_circle"] = (block: Block) => {
    needsLvgl(gen);
    const v = widgetVar("circ", block);
    const d = val(block, "D", "20");
    return [
      `${v} = lv.obj(_scr)`,
      `${v}.set_pos(${val(block, "X", "0")}, ${val(block, "Y", "0")})`,
      `${v}.set_size(${d}, ${d})`,
      `${v}.set_style_bg_color(lv.color_hex(${color(block, "0xFFFFFF")}), 0)`,
      `${v}.set_style_border_width(0, 0)`,
      `${v}.set_style_radius(lv.RADIUS_CIRCLE, 0)`,
      `${v}.set_style_pad_all(0, 0)`,
      ``,
    ].join("\n");
  };

  gen.forBlock["lvgl_line"] = (block: Block) => {
    needsLvgl(gen);
    const v = widgetVar("line", block);
    const pts = `${v}_pts`;
    return [
      `${v} = lv.line(_scr)`,
      `${pts} = [{"x": ${val(block, "X1", "0")}, "y": ${val(block, "Y1", "0")}}, {"x": ${val(block, "X2", "10")}, "y": ${val(block, "Y2", "10")}}]`,
      `${v}.set_points(${pts}, 2)`,
      `${v}.set_style_line_color(lv.color_hex(${color(block, "0xFFFFFF")}), 0)`,
      `${v}.set_style_line_width(${val(block, "WIDTH", "1")}, 0)`,
      ``,
    ].join("\n");
  };

  gen.forBlock["lvgl_update_screen"] = () => {
    needsLvgl(gen);
    return `lv.timer_handler()\n`;
  };

  gen.forBlock["lvgl_hex_color"] = (block: Block) => {
    const hex = block.getFieldValue("HEX").replace(/^#/, "").replace(/^0x/i, "");
    const n = parseInt(hex, 16);
    return [`0x${(isNaN(n) ? 0 : n).toString(16).padStart(6, "0").toUpperCase()}`, Order.ATOMIC];
  };
}
