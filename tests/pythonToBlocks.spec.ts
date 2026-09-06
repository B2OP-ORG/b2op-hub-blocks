import { describe, expect, it, beforeEach } from "vitest";
import * as Blockly from "blockly/core";
import { registerAllBlocks } from "../src/blocks";
import { workspaceToPython } from "../src/codegen/pythonGen";
import { pythonToBlocks, type BlockSpec } from "../src/project/pythonToBlocks";

const VH = "# b2op-hub-blocks v2.0.0";

function translate(source: string): BlockSpec | undefined {
  return pythonToBlocks(source).main;
}

beforeEach(() => registerAllBlocks());

function underHat(chain: BlockSpec | undefined): object {
  const hat: Record<string, unknown> = { type: "when_program_starts" };
  if (chain) hat.inputs = { DO: { block: chain } };
  return { blocks: { languageVersion: 0, blocks: [hat] } };
}

function makeWorkspace(state: object): Blockly.Workspace {
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(state, ws);
  return ws;
}

/** Collect block types along the `.next` chain. */
function chainTypes(spec: BlockSpec | undefined): string[] {
  const out: string[] = [];
  let cur: BlockSpec | undefined = spec;
  while (cur) {
    out.push(cur.type);
    cur = cur.next?.block;
  }
  return out;
}

/** Round-trip: workspace → python → blocks → python. Both python outputs
 *  should be identical for pure hub/motor/sensor content (no ID-dependent
 *  LVGL widget names). */
function roundTrip(chain: BlockSpec): { first: string; second: string } {
  const ws1 = makeWorkspace(underHat(chain));
  const first = workspaceToPython(ws1);
  const converted = translate(first);
  const ws2 = makeWorkspace(underHat(converted));
  const second = workspaceToPython(ws2);
  return { first, second };
}

describe("pythonToBlocks", () => {
  it("returns undefined for empty source", () => {
    expect(translate("")).toBeUndefined();
    expect(translate("\n\n\n")).toBeUndefined();
  });

  it("returns raw_python for source without version header", () => {
    const chain = translate("hub.imu.reset()\n");
    expect(chain?.type).toBe("raw_python");
  });

  it("skips import preamble after version header", () => {
    const src = `${VH}\nimport hub, lpf2\nfrom lpf2 import devices\n`;
    const chain = translate(src);
    expect(chain).toBeUndefined();
  });

  it("recognizes hub_led_color", () => {
    const src = `${VH}\nimport hub, lpf2\n\nhub.led.setColorIdx(lpf2.color.RED)\n`;
    const chain = translate(src);
    expect(chain?.type).toBe("hub_led_color");
    expect(chain?.fields?.COLOR).toBe("RED");
  });

  it("recognizes hub_led_rgb with numeric literals", () => {
    const src = `${VH}\nhub.led.setColor(10, 20, 30)\n`;
    const chain = translate(src);
    expect(chain?.type).toBe("hub_led_rgb");
    expect(chain?.inputs?.R.shadow?.fields?.NUM).toBe("10");
    expect(chain?.inputs?.G.shadow?.fields?.NUM).toBe("20");
    expect(chain?.inputs?.B.shadow?.fields?.NUM).toBe("30");
  });

  it("recognizes bare hub statement blocks", () => {
    const src = `${VH}\nhub.imu.reset()\nhub.powerOff()\n`;
    expect(chainTypes(translate(src))).toEqual(["hub_imu_reset", "hub_poweroff"]);
  });

  it("wraps unknown code in a raw_python block", () => {
    const src = `${VH}\nsome_var = compute(other_var)\n`;
    const chain = translate(src);
    expect(chain?.type).toBe("raw_python");
    expect(chain?.data).toBe("some_var = compute(other_var)");
  });

  it("intersperses raw blocks between recognized ones", () => {
    const src = [
      VH,
      "hub.imu.reset()",
      "weird_call_no_known_form(1, 2, 3)",
      "hub.powerOff()",
      "",
    ].join("\n");
    const types = chainTypes(translate(src));
    expect(types).toEqual(["hub_imu_reset", "raw_python", "hub_poweroff"]);
  });

  it("recognizes motor block after typed-device setup", () => {
    const src = [
      VH,
      "import hub, lpf2",
      "from lpf2 import devices",
      "dev_a = hub.ports.A.device()",
      "if not isinstance(dev_a, devices.motor):",
      '    raise TypeError("Port A: expected motor")',
      "dev_a.startPower(50)",
      "",
    ].join("\n");
    const chain = translate(src);
    expect(chain?.type).toBe("motor_start_power");
    expect(chain?.fields?.PORT).toBe("A");
    expect(chain?.inputs?.POWER.shadow?.fields?.NUM).toBe("50");
  });

  it("recognizes motor_stop when startPower(0)", () => {
    const src = [
      VH,
      "dev_b = hub.ports.B.device()",
      "if not isinstance(dev_b, devices.motor):",
      '    raise TypeError("Port B: expected motor")',
      "dev_b.startPower(0)",
    ].join("\n");
    const chain = translate(src);
    expect(chain?.type).toBe("motor_stop");
    expect(chain?.fields?.PORT).toBe("B");
  });

  it("recognizes basic_motor_power via basic_motor kind", () => {
    const src = [
      VH,
      "dev_c = hub.ports.C.device()",
      "if not isinstance(dev_c, devices.basic_motor):",
      '    raise TypeError("Port C: expected basic_motor")',
      "dev_c.startPower(75)",
    ].join("\n");
    const chain = translate(src);
    expect(chain?.type).toBe("basic_motor_power");
    expect(chain?.fields?.PORT).toBe("C");
    expect(chain?.inputs?.POWER.shadow?.fields?.NUM).toBe("75");
  });

  it("recognizes color_set_light after color_sensor setup", () => {
    const src = [
      VH,
      "dev_d = hub.ports.D.device()",
      "if not isinstance(dev_d, devices.color_sensor):",
      '    raise TypeError("Port D: expected color_sensor")',
      "dev_d.setLight(10, 20, 30)",
    ].join("\n");
    const chain = translate(src);
    expect(chain?.type).toBe("color_set_light");
    expect(chain?.fields?.PORT).toBe("D");
    expect(chain?.inputs?.L2.shadow?.fields?.NUM).toBe("20");
  });

  it("recognizes distance_set_light (4-arg setLight) after distance_sensor setup", () => {
    const src = [
      VH,
      "dev_a = hub.ports.A.device()",
      "if not isinstance(dev_a, devices.distance_sensor):",
      '    raise TypeError("Port A: expected distance_sensor")',
      "dev_a.setLight(10, 20, 30, 40)",
    ].join("\n");
    const chain = translate(src);
    expect(chain?.type).toBe("distance_set_light");
    expect(chain?.inputs?.L4.shadow?.fields?.NUM).toBe("40");
  });

  it("preserves setup group when device also has untranslatable use", () => {
    const src = [
      VH,
      "dev_a = hub.ports.A.device()",
      "if not isinstance(dev_a, devices.color_sensor):",
      '    raise TypeError("Port A: expected color_sensor")',
      "dev_a.setMode(devices.color_sensor.MODE_COLOR)",
      "print(dev_a.getColorIdx())",
      "dev_a.setLight(1, 2, 3)",
    ].join("\n");
    const chain = translate(src);
    expect(chain?.type).toBe("raw_python");
    expect(chain?.data).toContain("dev_a = hub.ports.A.device()");
    expect(chain?.data).toContain("print(dev_a.getColorIdx())");
    expect(chain?.data).toContain("dev_a.setLight(1, 2, 3)");
  });

  it("independent ports: keeps raw for one, translates the other", () => {
    const src = [
      VH,
      // Port A: untranslatable use — must stay raw
      "dev_a = hub.ports.A.device()",
      "if not isinstance(dev_a, devices.color_sensor):",
      '    raise TypeError("Port A: expected color_sensor")',
      "print(dev_a.getColorIdx())",
      // Port B: clean motor use — translates
      "dev_b = hub.ports.B.device()",
      "if not isinstance(dev_b, devices.motor):",
      '    raise TypeError("Port B: expected motor")',
      "dev_b.startSpeed(60)",
    ].join("\n");
    const types = chainTypes(translate(src));
    expect(types).toContain("raw_python");
    expect(types).toContain("motor_start_speed");
  });

  it("recognizes motor_set_acc_time with profile", () => {
    const src = [
      VH,
      "dev_a = hub.ports.A.device()",
      "if not isinstance(dev_a, devices.motor):",
      '    raise TypeError("Port A: expected motor")',
      "dev_a.setAccTime(500, 1)",
    ].join("\n");
    const chain = translate(src);
    expect(chain?.type).toBe("motor_set_acc_time");
    expect(chain?.fields?.PROFILE).toBe("1");
    expect(chain?.inputs?.MS.shadow?.fields?.NUM).toBe("500");
  });

  it("recognizes hub_log_level and hub_lcd_backlight", () => {
    const src = `${VH}\nhub.log.setLevel(2)\nhub.lcd.on()\n`;
    const types = chainTypes(translate(src));
    expect(types).toEqual(["hub_log_level", "hub_lcd_backlight"]);
  });

  it("translates simple assignment to variables_set", () => {
    const src = `${VH}\nx = 42\n`;
    const chain = translate(src);
    expect(chain?.type).toBe("variables_set");
    const varField = chain?.fields?.VAR as { id: string };
    expect(varField.id).toBe("x");
    expect(chain?.inputs?.VALUE.block?.type).toBe("math_number");
  });

  it("translates print(...) to text_print", () => {
    const src = `${VH}\nprint("hi")\n`;
    const chain = translate(src);
    expect(chain?.type).toBe("text_print");
    expect(chain?.inputs?.TEXT.block?.type).toBe("text");
    expect(chain?.inputs?.TEXT.block?.fields?.TEXT).toBe("hi");
  });

  it("translates arithmetic expressions with precedence", () => {
    const src = `${VH}\nx = 1 + 2 * 3\n`;
    const chain = translate(src);
    const add = chain?.inputs?.VALUE.block;
    expect(add?.type).toBe("math_arithmetic");
    expect(add?.fields?.OP).toBe("ADD");
    expect(add?.inputs?.A.block?.type).toBe("math_number");
    const mul = add?.inputs?.B.block;
    expect(mul?.type).toBe("math_arithmetic");
    expect(mul?.fields?.OP).toBe("MULTIPLY");
  });

  it("translates comparison + boolean ops", () => {
    const src = `${VH}\nx = a > 0 and b < 10\n`;
    const chain = translate(src);
    const val = chain?.inputs?.VALUE.block;
    expect(val?.type).toBe("logic_operation");
    expect(val?.fields?.OP).toBe("AND");
    expect(val?.inputs?.A.block?.type).toBe("logic_compare");
    expect(val?.inputs?.A.block?.fields?.OP).toBe("GT");
    expect(val?.inputs?.B.block?.fields?.OP).toBe("LT");
  });

  it("translates not / logic_negate", () => {
    const src = `${VH}\nx = not True\n`;
    const chain = translate(src);
    const val = chain?.inputs?.VALUE.block;
    expect(val?.type).toBe("logic_negate");
    expect(val?.inputs?.BOOL.block?.type).toBe("logic_boolean");
    expect(val?.inputs?.BOOL.block?.fields?.BOOL).toBe("TRUE");
  });

  it("translates modulo and power", () => {
    const src = `${VH}\nx = a % b\ny = a ** 2\n`;
    const chain = translate(src);
    expect(chain?.inputs?.VALUE.block?.type).toBe("math_modulo");
    const next = chain?.next?.block;
    const pow = next?.inputs?.VALUE.block;
    expect(pow?.type).toBe("math_arithmetic");
    expect(pow?.fields?.OP).toBe("POWER");
  });

  it("translates list literal", () => {
    const src = `${VH}\nx = [1, 2, 3]\n`;
    const chain = translate(src);
    const list = chain?.inputs?.VALUE.block;
    expect(list?.type).toBe("lists_create_with");
    expect((list?.extraState as { itemCount: number }).itemCount).toBe(3);
    expect(list?.inputs?.ADD0.block?.fields?.NUM).toBe("1");
    expect(list?.inputs?.ADD2.block?.fields?.NUM).toBe("3");
  });

  it("translates len() to lists_length", () => {
    const src = `${VH}\nn = len(items)\n`;
    const chain = translate(src);
    expect(chain?.inputs?.VALUE.block?.type).toBe("lists_length");
  });

  it("translates unary minus via math_single NEG", () => {
    const src = `${VH}\nx = -a\n`;
    const chain = translate(src);
    const val = chain?.inputs?.VALUE.block;
    expect(val?.type).toBe("math_single");
    expect(val?.fields?.OP).toBe("NEG");
  });

  it("translates if/elif/else with extraState", () => {
    const src = [
      VH,
      "if x > 0:",
      "    y = 1",
      "elif x < 0:",
      "    y = -1",
      "else:",
      "    y = 0",
    ].join("\n");
    const chain = translate(src);
    expect(chain?.type).toBe("controls_if");
    const es = chain?.extraState as { elseIfCount: number; hasElse: boolean };
    expect(es.elseIfCount).toBe(1);
    expect(es.hasElse).toBe(true);
    expect(chain?.inputs?.IF0.block?.type).toBe("logic_compare");
    expect(chain?.inputs?.DO0.block?.type).toBe("variables_set");
    expect(chain?.inputs?.IF1.block?.fields?.OP).toBe("LT");
    expect(chain?.inputs?.ELSE.block?.type).toBe("variables_set");
  });

  it("translates while loop", () => {
    const src = `${VH}\nwhile x < 10:\n    x = x + 1\n`;
    const chain = translate(src);
    expect(chain?.type).toBe("controls_whileUntil");
    expect(chain?.fields?.MODE).toBe("WHILE");
    expect(chain?.inputs?.BOOL.block?.type).toBe("logic_compare");
    expect(chain?.inputs?.DO.block?.type).toBe("variables_set");
  });

  it("translates for range(N) to controls_repeat_ext", () => {
    const src = `${VH}\nfor i in range(5):\n    print(i)\n`;
    const chain = translate(src);
    expect(chain?.type).toBe("controls_repeat_ext");
    expect(chain?.inputs?.TIMES.block?.fields?.NUM).toBe("5");
    expect(chain?.inputs?.DO.block?.type).toBe("text_print");
  });

  it("translates for range(A, B) to controls_for with inclusive TO", () => {
    const src = `${VH}\nfor i in range(1, 10):\n    print(i)\n`;
    const chain = translate(src);
    expect(chain?.type).toBe("controls_for");
    expect(chain?.inputs?.FROM.block?.fields?.NUM).toBe("1");
    const to = chain?.inputs?.TO.block;
    expect(to?.type).toBe("math_arithmetic");
    expect(to?.fields?.OP).toBe("MINUS");
    expect(to?.inputs?.A.block?.fields?.NUM).toBe("10");
    expect(to?.inputs?.B.block?.fields?.NUM).toBe("1");
  });

  it("declares variables encountered in the source", () => {
    const src = `${VH}\nx = 5\ny = x + 1\n`;
    const result = pythonToBlocks(src);
    const varNames = result.variables.map((v) => v.name).sort();
    expect(varNames).toEqual(["x", "y"]);
  });
});

describe("round-trip (blocks → python → blocks → python)", () => {
  it("preserves motor_start_power exactly", () => {
    const { first, second } = roundTrip({
      type: "motor_start_power",
      fields: { PORT: "A" },
      inputs: { POWER: { block: { type: "math_number", fields: { NUM: 50 } } } },
    });
    expect(second).toBe(first);
  });

  it("preserves motor_stop exactly", () => {
    const { first, second } = roundTrip({
      type: "motor_stop",
      fields: { PORT: "B" },
    });
    expect(second).toBe(first);
  });

  it("preserves basic_motor_power exactly", () => {
    const { first, second } = roundTrip({
      type: "basic_motor_power",
      fields: { PORT: "C" },
      inputs: { POWER: { block: { type: "math_number", fields: { NUM: 75 } } } },
    });
    expect(second).toBe(first);
  });

  it("preserves motor_run_for_degrees exactly", () => {
    const { first, second } = roundTrip({
      type: "motor_run_for_degrees",
      fields: { PORT: "A" },
      inputs: {
        DEG: { block: { type: "math_number", fields: { NUM: 360 } } },
        SPEED: { block: { type: "math_number", fields: { NUM: 50 } } },
      },
    });
    expect(second).toBe(first);
  });

  it("preserves motor_set_acc_time exactly", () => {
    const { first, second } = roundTrip({
      type: "motor_set_acc_time",
      fields: { PORT: "A", PROFILE: "1" },
      inputs: { MS: { block: { type: "math_number", fields: { NUM: 500 } } } },
    });
    expect(second).toBe(first);
  });

  it("preserves color_set_light exactly", () => {
    const { first, second } = roundTrip({
      type: "color_set_light",
      fields: { PORT: "D" },
      inputs: {
        L1: { block: { type: "math_number", fields: { NUM: 10 } } },
        L2: { block: { type: "math_number", fields: { NUM: 20 } } },
        L3: { block: { type: "math_number", fields: { NUM: 30 } } },
      },
    });
    expect(second).toBe(first);
  });

  it("preserves distance_set_light exactly", () => {
    const { first, second } = roundTrip({
      type: "distance_set_light",
      fields: { PORT: "B" },
      inputs: {
        L1: { block: { type: "math_number", fields: { NUM: 10 } } },
        L2: { block: { type: "math_number", fields: { NUM: 20 } } },
        L3: { block: { type: "math_number", fields: { NUM: 30 } } },
        L4: { block: { type: "math_number", fields: { NUM: 40 } } },
      },
    });
    expect(second).toBe(first);
  });

  it("preserves hub_led_color exactly", () => {
    const { first, second } = roundTrip({
      type: "hub_led_color",
      fields: { COLOR: "RED" },
    });
    expect(second).toBe(first);
  });

  it("preserves hub_led_rgb exactly", () => {
    const { first, second } = roundTrip({
      type: "hub_led_rgb",
      inputs: {
        R: { block: { type: "math_number", fields: { NUM: 10 } } },
        G: { block: { type: "math_number", fields: { NUM: 20 } } },
        B: { block: { type: "math_number", fields: { NUM: 30 } } },
      },
    });
    expect(second).toBe(first);
  });

  it("preserves a mixed motor + sensor chain exactly", () => {
    const chain: BlockSpec = {
      type: "motor_start_speed",
      fields: { PORT: "A" },
      inputs: { SPEED: { block: { type: "math_number", fields: { NUM: 40 } } } },
      next: {
        block: {
          type: "color_set_light",
          fields: { PORT: "B" },
          inputs: {
            L1: { block: { type: "math_number", fields: { NUM: 10 } } },
            L2: { block: { type: "math_number", fields: { NUM: 20 } } },
            L3: { block: { type: "math_number", fields: { NUM: 30 } } },
          },
          next: {
            block: {
              type: "hub_led_color",
              fields: { COLOR: "BLUE" },
            },
          },
        },
      },
    };
    const { first, second } = roundTrip(chain);
    expect(second).toBe(first);
  });
});
