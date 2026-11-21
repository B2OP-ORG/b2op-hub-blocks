import * as Blockly from "blockly/core";
import * as En from "blockly/msg/en";
import "blockly/blocks";
import { pythonGenerator } from "blockly/python";
import { EVENT_BLOCKS, HUB_BLOCKS } from "./defs/hub";
import { MOTOR_BLOCKS } from "./defs/motor";
import { SENSOR_BLOCKS } from "./defs/sensor";
import { ADVANCED_HUB_BLOCKS } from "./defs/advanced_hub";
import { ADVANCED_MOTOR_BLOCKS } from "./defs/advanced_motor";
import { LVGL_BLOCKS } from "./defs/lvgl";
import { NEOPIXEL_BLOCKS } from "./defs/neopixel";
import { RAW_BLOCKS } from "./defs/raw";
import { REMOTE_BLOCKS, registerRemoteField } from "./defs/remote";
import { SCENE_BLOCKS, registerSceneField } from "./defs/scene";
import { registerHubGenerators } from "./generators/hub";
import { registerMotorGenerators } from "./generators/motor";
import { registerSensorGenerators } from "./generators/sensor";
import { registerAdvancedHubGenerators } from "./generators/advanced_hub";
import { registerAdvancedMotorGenerators } from "./generators/advanced_motor";
import { registerLvglGenerators } from "./generators/lvgl";
import { registerNeopixelGenerators } from "./generators/neopixel";
import { registerRawGenerators } from "./generators/raw";
import { registerRemoteGenerators } from "./generators/remote";
import { registerSceneGenerators } from "./generators/scene";
import { registerLoopSleepOverrides } from "./generators/loops";
import { registerTextGenerators, relaxTextInputs } from "./generators/text";

let registered = false;

/** Register all custom block defs + Python generators. Idempotent. */
export function registerAllBlocks(): void {
  if (registered) return;
  registered = true;
  Blockly.setLocale(En as unknown as { [key: string]: string });
  registerRemoteField();
  registerSceneField();
  const defs = [
    ...EVENT_BLOCKS,
    ...HUB_BLOCKS,
    ...MOTOR_BLOCKS,
    ...SENSOR_BLOCKS,
    ...ADVANCED_HUB_BLOCKS,
    ...ADVANCED_MOTOR_BLOCKS,
    ...LVGL_BLOCKS,
    ...NEOPIXEL_BLOCKS,
    ...RAW_BLOCKS,
    ...REMOTE_BLOCKS,
    ...SCENE_BLOCKS,
  ];
  Blockly.defineBlocksWithJsonArray(defs as unknown as object[]);
  // Strip the leading/trailing quote glyphs from the built-in `text` block by
  // replacing Blockly's "text_quotes" extension with a no-op. Extension is
  // applied per-instance during init; unregistering the original prevents the
  // quote image fields from being inserted.
  if (Blockly.Extensions.isRegistered("text_quotes")) {
    Blockly.Extensions.unregister("text_quotes");
  }
  Blockly.Extensions.register("text_quotes", function () { /* no quotes */ });
  relaxTextInputs();
  // Python convention (PEP 8): 4-space indent everywhere in generated code.
  pythonGenerator.INDENT = "    ";
  registerHubGenerators(pythonGenerator);
  registerMotorGenerators(pythonGenerator);
  registerSensorGenerators(pythonGenerator);
  registerAdvancedHubGenerators(pythonGenerator);
  registerAdvancedMotorGenerators(pythonGenerator);
  registerLvglGenerators(pythonGenerator);
  registerNeopixelGenerators(pythonGenerator);
  registerRawGenerators(pythonGenerator);
  registerRemoteGenerators(pythonGenerator);
  registerSceneGenerators(pythonGenerator);
  registerLoopSleepOverrides(pythonGenerator);
  registerTextGenerators(pythonGenerator);
}

export { pythonGenerator };
