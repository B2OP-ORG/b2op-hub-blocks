import { describe, expect, it, beforeEach } from "vitest";
import * as Blockly from "blockly/core";
import { registerAllBlocks } from "../src/blocks";
import { workspaceToPython } from "../src/codegen/pythonGen";

beforeEach(() => {
  registerAllBlocks();
});

function underProgramHat(inner: object): object {
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

describe("workspaceToPython", () => {
  it("emits only version header for empty workspace", () => {
    const ws = new Blockly.Workspace();
    const py = workspaceToPython(ws);
    expect(py.trim()).toBe("# b2op-hub-blocks v2.0.0");
  });

  it("ignores blocks not attached to a hat", () => {
    const ws = makeWorkspace({
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: "motor_start_power",
            fields: { PORT: "A" },
            inputs: { POWER: { block: { type: "math_number", fields: { NUM: 50 } } } },
          },
        ],
      },
    });
    const py = workspaceToPython(ws);
    expect(py).not.toContain("startPower");
  });

  it("emits program body at top level under when_program_starts", () => {
    const ws = makeWorkspace(
      underProgramHat({
        type: "motor_start_power",
        fields: { PORT: "A" },
        inputs: { POWER: { block: { type: "math_number", fields: { NUM: 50 } } } },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).toContain("# b2op-hub-blocks v2.0.0");
    expect(py).toContain("import hub, lpf2");
    expect(py).toContain("from lpf2 import devices");
    expect(py).toContain("dev_a.startPower(50)");
    expect(py).not.toContain("def setup():");
    expect(py).not.toContain('@on("setup")');
  });

  it("emits hub.powerOff() at top level", () => {
    const ws = makeWorkspace(
      underProgramHat({ type: "hub_poweroff" }),
    );
    const py = workspaceToPython(ws);
    expect(py).toContain("hub.powerOff()");
    expect(py).not.toContain("def loop():");
  });

  it("emits two when_program_starts bodies concatenated", () => {
    const ws = makeWorkspace({
      blocks: {
        languageVersion: 0,
        blocks: [
          { type: "when_program_starts", inputs: { DO: { block: { type: "hub_imu_reset" } } } },
          { type: "when_program_starts", inputs: { DO: { block: { type: "hub_poweroff" } } } },
        ],
      },
    });
    const py = workspaceToPython(ws);
    expect(py).toContain("hub.imu.reset()");
    expect(py).toContain("hub.powerOff()");
  });

  it("dedupes device setup across multiple sensor reads", () => {
    const ws = makeWorkspace(
      underProgramHat({
        type: "text_print",
        inputs: { TEXT: { block: { type: "distance_get", fields: { PORT: "C" } } } },
        next: {
          block: {
            type: "text_print",
            inputs: { TEXT: { block: { type: "distance_get", fields: { PORT: "C" } } } },
          },
        },
      }),
    );
    const py = workspaceToPython(ws);
    const occurrences = py.match(/dev_c = hub\.ports\.C\.device\(\)/g) ?? [];
    expect(occurrences.length).toBe(1);
  });

  it("warns on port-kind collision", () => {
    const ws = makeWorkspace(
      underProgramHat({
        type: "text_print",
        inputs: { TEXT: { block: { type: "color_get_color", fields: { PORT: "A" } } } },
        next: {
          block: {
            type: "text_print",
            inputs: { TEXT: { block: { type: "distance_get", fields: { PORT: "A" } } } },
          },
        },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).toMatch(/# WARN: port A used as color_sensor and distance_sensor/);
  });

  it("emits time.sleep() for hub_wait", () => {
    const ws = makeWorkspace(
      underProgramHat({
        type: "hub_wait",
        inputs: { SECONDS: { block: { type: "math_number", fields: { NUM: 1 } } } },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).toContain("time.sleep(1)");
    expect(py).not.toContain("hub.sleep");
  });

  it("emits lpf2.color.RED for color literal block", () => {
    const ws = makeWorkspace(
      underProgramHat({
        type: "text_print",
        inputs: { TEXT: { block: { type: "color_literal", fields: { COLOR: "RED" } } } },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).toContain("lpf2.color.RED");
  });

  it("emits hub.led.setColorIdx for hub_led_color", () => {
    const ws = makeWorkspace(
      underProgramHat({
        type: "hub_led_color",
        fields: { COLOR: "BLUE" },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).toContain("hub.led.setColorIdx(lpf2.color.BLUE)");
  });

  it("emits hub.led.setColor for hub_led_rgb", () => {
    const ws = makeWorkspace(
      underProgramHat({
        type: "hub_led_rgb",
        inputs: {
          R: { block: { type: "math_number", fields: { NUM: 255 } } },
          G: { block: { type: "math_number", fields: { NUM: 0 } } },
          B: { block: { type: "math_number", fields: { NUM: 128 } } },
        },
      }),
    );
    const py = workspaceToPython(ws);
    expect(py).toContain("hub.led.setColor(255, 0, 128)");
  });
});
