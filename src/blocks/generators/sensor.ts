import type { Block } from "blockly";
import { Order, type PythonGenerator } from "blockly/python";
import { type Port, registerDevice } from "../setup";

export function registerSensorGenerators(gen: PythonGenerator): void {
  const port = (block: Block) => block.getFieldValue("PORT") as Port;
  const val = (block: Block, name: string, def = "0") =>
    gen.valueToCode(block, name, Order.NONE) || def;

  // Color sensor — device uses internal mode combo; no manual setMode() needed.
  gen.forBlock["color_get_color"] = (block: Block) => {
    const p = port(block);
    const v = registerDevice(gen, p, "color_sensor");
    return [`${v}.getColorIdx()`, Order.FUNCTION_CALL];
  };

  gen.forBlock["color_get_reflectivity"] = (block: Block) => {
    const p = port(block);
    const v = registerDevice(gen, p, "color_sensor");
    return [`${v}.getReflectivity()`, Order.FUNCTION_CALL];
  };

  gen.forBlock["color_get_rgb"] = (block: Block) => {
    const p = port(block);
    const v = registerDevice(gen, p, "color_sensor");
    return [`${v}.getRGB()`, Order.FUNCTION_CALL];
  };

  gen.forBlock["color_set_light"] = (block: Block) => {
    const p = port(block);
    const v = registerDevice(gen, p, "color_sensor");
    return `${v}.setLight(${val(block, "L1")}, ${val(block, "L2")}, ${val(block, "L3")})\n`;
  };

  gen.forBlock["distance_get"] = (block: Block) => {
    const p = port(block);
    const v = registerDevice(gen, p, "distance_sensor");
    return [`${v}.getDistance()`, Order.FUNCTION_CALL];
  };

  gen.forBlock["distance_set_light"] = (block: Block) => {
    const p = port(block);
    const v = registerDevice(gen, p, "distance_sensor");
    return `${v}.setLight(${val(block, "L1")}, ${val(block, "L2")}, ${val(block, "L3")}, ${val(block, "L4")})\n`;
  };

  gen.forBlock["color_distance_get_color"] = (block: Block) => {
    const p = port(block);
    const v = registerDevice(gen, p, "color_distance_sensor");
    return [`${v}.getColorIdx()`, Order.FUNCTION_CALL];
  };

  gen.forBlock["color_distance_get_distance"] = (block: Block) => {
    const p = port(block);
    const v = registerDevice(gen, p, "color_distance_sensor");
    return [`${v}.getDistance()`, Order.FUNCTION_CALL];
  };
}
