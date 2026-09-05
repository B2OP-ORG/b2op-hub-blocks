import type { PythonGenerator } from "blockly/python";
import { isLvglUsed } from "../setup";

const LOOP_BLOCKS = [
  "controls_whileUntil",
  "controls_repeat",
  "controls_repeat_ext",
  "controls_for",
  "controls_forEach",
];

/**
 * When LVGL is in use, append `lv.timer_handler()` to every loop body that
 * doesn't already contain one. Strips stray `pass` (Blockly emits it for
 * empty bodies) before appending. Skips injection if no LVGL block in scope.
 */
export function registerLoopSleepOverrides(gen: PythonGenerator): void {
  for (const type of LOOP_BLOCKS) {
    const orig = gen.forBlock[type];
    if (!orig) continue;
    gen.forBlock[type] = function (block, generator) {
      const g = generator ?? gen;
      const result = orig.call(this, block, g);
      const code = Array.isArray(result) ? result[0] : result;
      if (typeof code !== "string" || !code) return result;

      if (!isLvglUsed(g)) return result;

      const indent = g.INDENT;
      const lines = code.replace(/\n+$/, "").split("\n");
      const bodyStart = lines.findIndex((l) => l.startsWith(indent));
      if (bodyStart < 0) return result;

      const header = lines.slice(0, bodyStart);
      const body = lines.slice(bodyStart);
      const isTopLevel = (l: string) => l.startsWith(indent) && !l.startsWith(indent + indent);

      if (body.some((l) => isTopLevel(l) && l.includes("lv.timer_handler()"))) return result;

      const newBody = body.filter((l) => !(isTopLevel(l) && l.trim() === "pass"));
      newBody.push(`${indent}lv.timer_handler()`);

      return [...header, ...newBody].join("\n") + "\n";
    };
  }
}
