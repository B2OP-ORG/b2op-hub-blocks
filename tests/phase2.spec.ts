import { describe, expect, it, beforeEach } from "vitest";
import * as Blockly from "blockly/core";
import { registerAllBlocks } from "../src/blocks";
import { workspaceToPython } from "../src/codegen/pythonGen";

beforeEach(() => registerAllBlocks());

function underHat(inner: object): object {
  return {
    blocks: {
      languageVersion: 0,
      blocks: [{ type: "when_program_starts", inputs: { DO: { block: inner } } }],
    },
  };
}

function makeWorkspace(state: object): Blockly.Workspace {
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(state, ws);
  return ws;
}

describe("Phase 2 blocks", () => {
  it("emits hub.imu.acceleration.x", () => {
    const ws = makeWorkspace(
      underHat({
        type: "text_print",
        inputs: { TEXT: { block: { type: "hub_imu_accel", fields: { AXIS: "x" } } } },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).toContain("hub.imu.acceleration.x");
  });

  it("emits hub.log.setLevel(1)", () => {
    const ws = makeWorkspace(underHat({ type: "hub_log_level", fields: { LEVEL: "1" } }));
    const py = workspaceToPython(ws);
    expect(py).toContain("hub.log.setLevel(1)");
  });

  it("emits LCD backlight on", () => {
    const ws = makeWorkspace(underHat({ type: "hub_lcd_backlight", fields: { STATE: "on" } }));
    const py = workspaceToPython(ws);
    expect(py).toContain("hub.lcd.on()");
  });

  it("emits motor setAccTime with profile", () => {
    const ws = makeWorkspace(
      underHat({
        type: "motor_set_acc_time",
        fields: { PORT: "A", PROFILE: "1" },
        inputs: { MS: { block: { type: "math_number", fields: { NUM: 500 } } } },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).toContain("isinstance(dev_a, devices.encoder_motor)");
    expect(py).toContain("dev_a.setAccTime(500, 1)");
  });

  it("emits basic_motor_power via typed-device startPower", () => {
    const ws = makeWorkspace(
      underHat({
        type: "basic_motor_power",
        fields: { PORT: "B" },
        inputs: { POWER: { block: { type: "math_number", fields: { NUM: 75 } } } },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).toContain("isinstance(dev_b, devices.basic_motor)");
    expect(py).toContain("dev_b.startPower(75)");
  });

  it("LVGL setup includes import and screen_active", () => {
    const ws = makeWorkspace(underHat({ type: "lvgl_clear_screen" }));
    const py = workspaceToPython(ws);
    expect(py).toContain("import lvgl as lv");
    expect(py).toContain("_scr = lv.screen_active()");
    expect(py).toContain("_scr.clean()");
  });

  it("LVGL label emits create + set_text + set_pos", () => {
    const ws = makeWorkspace(
      underHat({
        type: "lvgl_label",
        inputs: {
          TEXT: { block: { type: "text", fields: { TEXT: "hi" } } },
          X: { block: { type: "math_number", fields: { NUM: 10 } } },
          Y: { block: { type: "math_number", fields: { NUM: 20 } } },
        },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).toMatch(/_lbl_\w+ = lv\.label\(_scr\)/);
    expect(py).toContain(`.set_text('hi')`);
    expect(py).toContain(`.set_pos(10, 20)`);
  });

  it("lvgl_rect emits filled rectangle", () => {
    const ws = makeWorkspace(
      underHat({
        type: "lvgl_rect",
        inputs: {
          X: { block: { type: "math_number", fields: { NUM: 5 } } },
          Y: { block: { type: "math_number", fields: { NUM: 6 } } },
          W: { block: { type: "math_number", fields: { NUM: 40 } } },
          H: { block: { type: "math_number", fields: { NUM: 20 } } },
          COLOR: { block: { type: "lvgl_hex_color", fields: { HEX: "ff0000" } } },
        },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).toMatch(/_rect_\w+ = lv\.obj\(_scr\)/);
    expect(py).toContain(".set_pos(5, 6)");
    expect(py).toContain(".set_size(40, 20)");
    expect(py).toContain("lv.color_hex(0xFF0000)");
    expect(py).toContain(".set_style_border_width(0, 0)");
  });

  it("lvgl_circle emits square-sized obj with RADIUS_CIRCLE", () => {
    const ws = makeWorkspace(
      underHat({
        type: "lvgl_circle",
        inputs: {
          X: { block: { type: "math_number", fields: { NUM: 0 } } },
          Y: { block: { type: "math_number", fields: { NUM: 0 } } },
          D: { block: { type: "math_number", fields: { NUM: 30 } } },
          COLOR: { block: { type: "lvgl_hex_color", fields: { HEX: "00ff00" } } },
        },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).toContain(".set_size(30, 30)");
    expect(py).toContain(".set_style_radius(lv.RADIUS_CIRCLE, 0)");
    expect(py).toContain("lv.color_hex(0x00FF00)");
  });

  it("lvgl_line emits point list + line_color + line_width", () => {
    const ws = makeWorkspace(
      underHat({
        type: "lvgl_line",
        inputs: {
          X1: { block: { type: "math_number", fields: { NUM: 0 } } },
          Y1: { block: { type: "math_number", fields: { NUM: 0 } } },
          X2: { block: { type: "math_number", fields: { NUM: 50 } } },
          Y2: { block: { type: "math_number", fields: { NUM: 25 } } },
          COLOR: { block: { type: "lvgl_hex_color", fields: { HEX: "ffffff" } } },
          WIDTH: { block: { type: "math_number", fields: { NUM: 3 } } },
        },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).toMatch(/_line_\w+ = lv\.line\(_scr\)/);
    expect(py).toContain(`{"x": 0, "y": 0}`);
    expect(py).toContain(`{"x": 50, "y": 25}`);
    expect(py).toContain(".set_style_line_width(3, 0)");
    expect(py).toContain("lv.color_hex(0xFFFFFF)");
  });

  it("lvgl_update_screen emits lv.timer_handler()", () => {
    const ws = makeWorkspace(underHat({ type: "lvgl_update_screen" }));
    const py = workspaceToPython(ws);
    expect(py).toContain("lv.timer_handler()");
    expect(py).not.toContain("task_handler");
    expect(py).not.toContain("while True");
  });

  it("auto-injects lv.timer_handler() at end of loop when LVGL used", () => {
    const ws = makeWorkspace(
      underHat({
        type: "controls_whileUntil",
        fields: { MODE: "WHILE" },
        inputs: {
          BOOL: { block: { type: "logic_boolean", fields: { BOOL: "TRUE" } } },
          DO: { block: { type: "lvgl_clear_screen" } },
        },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).toMatch(/while True:\s*\n\s*_scr\.clean\(\)\s*\n\s*lv\.timer_handler\(\)/);
  });

  it("skips auto-inject when lvgl_update_screen already present in loop", () => {
    const ws = makeWorkspace(
      underHat({
        type: "controls_whileUntil",
        fields: { MODE: "WHILE" },
        inputs: {
          BOOL: { block: { type: "logic_boolean", fields: { BOOL: "TRUE" } } },
          DO: { block: { type: "lvgl_update_screen" } },
        },
      }),
    );
    const py = workspaceToPython(ws);
    const count = (py.match(/lv\.timer_handler\(\)/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("does NOT inject lv.timer_handler() when no LVGL blocks", () => {
    const ws = makeWorkspace(
      underHat({
        type: "controls_whileUntil",
        fields: { MODE: "WHILE" },
        inputs: {
          BOOL: { block: { type: "logic_boolean", fields: { BOOL: "TRUE" } } },
          DO: { block: { type: "hub_imu_reset" } },
        },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).not.toContain("lv.timer_handler()");
  });

  it("coerces lpf2.color.PURPLE to RGB hex in LVGL color slot", () => {
    const ws = makeWorkspace(
      underHat({
        type: "lvgl_rect",
        inputs: {
          X: { block: { type: "math_number", fields: { NUM: 0 } } },
          Y: { block: { type: "math_number", fields: { NUM: 0 } } },
          W: { block: { type: "math_number", fields: { NUM: 10 } } },
          H: { block: { type: "math_number", fields: { NUM: 10 } } },
          COLOR: { block: { type: "color_literal", fields: { COLOR: "PURPLE" } } },
        },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).toContain("lv.color_hex(0x800080)");
    expect(py).not.toContain("lpf2.color.PURPLE");
  });

  it("lvgl_hex_color normalizes hex", () => {
    const ws = makeWorkspace(
      underHat({
        type: "lvgl_screen_bg",
        inputs: {
          COLOR: { block: { type: "lvgl_hex_color", fields: { HEX: "ff0080" } } },
        },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).toContain("lv.color_hex(0xFF0080)");
  });
});
