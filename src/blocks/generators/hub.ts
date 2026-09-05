import type { Block } from "blockly";
import { Order, type PythonGenerator } from "blockly/python";
import { needsLpf2, needsTime } from "../setup";

export function registerHubGenerators(gen: PythonGenerator): void {
  gen.forBlock["when_program_starts"] = () => "";
  gen.forBlock["on_button_pressed"] = () => "";

  gen.forBlock["hub_wait"] = (block: Block) => {
    needsTime(gen);
    const s = gen.valueToCode(block, "SECONDS", Order.NONE) || "0";
    return `time.sleep(${s})\n`;
  };

  gen.forBlock["hub_quit"] = () => {
    needsLpf2(gen);
    return "hub.exit()\n";
  };

  gen.forBlock["hub_led_color"] = (block: Block) => {
    needsLpf2(gen);
    const color = block.getFieldValue("COLOR");
    return `hub.led.setColorIdx(lpf2.color.${color})\n`;
  };

  gen.forBlock["hub_led_rgb"] = (block: Block) => {
    needsLpf2(gen);
    const r = gen.valueToCode(block, "R", Order.NONE) || "0";
    const g = gen.valueToCode(block, "G", Order.NONE) || "0";
    const b = gen.valueToCode(block, "B", Order.NONE) || "0";
    return `hub.led.setColor(${r}, ${g}, ${b})\n`;
  };

  gen.forBlock["hub_button_pressed"] = (block: Block) => {
    needsLpf2(gen);
    const btn = block.getFieldValue("BTN");
    return [`hub.buttons.${btn}()`, Order.FUNCTION_CALL];
  };

  gen.forBlock["hub_imu_axis"] = (block: Block) => {
    needsLpf2(gen);
    const axis = block.getFieldValue("AXIS");
    return [`hub.imu.${axis}`, Order.MEMBER];
  };

  gen.forBlock["hub_imu_reset"] = () => {
    needsLpf2(gen);
    return "hub.imu.reset()\n";
  };

  gen.forBlock["hub_poweroff"] = () => {
    needsLpf2(gen);
    return "hub.powerOff()\n";
  };

  gen.forBlock["color_literal"] = (block: Block) => {
    needsLpf2(gen);
    const color = block.getFieldValue("COLOR");
    return [`lpf2.color.${color}`, Order.MEMBER];
  };
}
