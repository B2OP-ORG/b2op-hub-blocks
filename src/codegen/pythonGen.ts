import type { Block, Workspace } from "blockly";
import { pythonGenerator } from "blockly/python";
import { registerAllBlocks } from "../blocks";
import { resetSetup } from "../blocks/setup";
import { PROJECT_FORMAT, PROJECT_VERSION } from "../project/format";

registerAllBlocks();

const DEFS_SEPARATOR = "\n\n\n";
const PROGRAM_HAT = "when_program_starts";
const BUTTON_HAT = "on_button_pressed";
const VALID_BUTTONS = new Set(["center", "up", "down", "left", "right"]);
const PROC_TYPES = new Set(["procedures_defnoreturn", "procedures_defreturn"]);

const VERSION_HEADER = `# ${PROJECT_FORMAT} v${PROJECT_VERSION}`;

function indentBody(text: string): string {
  const t = text.replace(/\s+$/, "");
  if (!t) return "    pass";
  return t
    .split("\n")
    .map((l) => (l.length ? "    " + l : l))
    .join("\n");
}

/**
 * Emit Python for a workspace. All blocks chained under `when_program_starts`
 * become top-level statements. Button hats become `@hub.buttons.on()` decorated
 * functions, emitted before the main body. Procedure defs become top-level `def`s
 * via Blockly's normal definitions_ machinery. Orphan blocks are ignored.
 *
 * Output is prefixed with `# b2op-hub-blocks v2.0.0` so pythonToBlocks() can
 * reject old / external Python gracefully.
 */
export function workspaceToPython(workspace: Workspace): string {
  resetSetup();
  const gen = pythonGenerator;
  gen.init(workspace);

  for (const top of workspace.getTopBlocks(true)) {
    if (PROC_TYPES.has(top.type)) gen.blockToCode(top);
  }

  const mainBodies: string[] = [];
  const buttonDefs: string[] = [];
  const buttonCounts: Record<string, number> = {};

  for (const top of workspace.getTopBlocks(true)) {
    if (top.type === PROGRAM_HAT) {
      const child: Block | null = top.getInputTargetBlock("DO");
      if (child) {
        const code = gen.blockToCode(child);
        const text = Array.isArray(code) ? code[0] : code;
        if (text) mainBodies.push(text);
      }
    } else if (top.type === BUTTON_HAT) {
      const btn = top.getFieldValue("BTN");
      if (!VALID_BUTTONS.has(btn)) continue;
      const child: Block | null = top.getInputTargetBlock("DO");
      const code = child ? gen.blockToCode(child) : "";
      const body = Array.isArray(code) ? code[0] : code;
      const n = (buttonCounts[btn] = (buttonCounts[btn] ?? 0) + 1);
      const suffix = n === 1 ? "" : `_${n}`;
      const name = `_on_btn_${btn}${suffix}`;
      buttonDefs.push(`@hub.buttons.on("${btn}")\ndef ${name}():\n${indentBody(body)}`);
    }
  }

  if (buttonDefs.length) {
    (gen as unknown as { definitions_: Record<string, string> }).definitions_["hub_lpf2_import"] = "import hub, lpf2";
  }

  const emitParts: string[] = [];
  for (const def of buttonDefs) emitParts.push(def);
  if (mainBodies.length) {
    emitParts.push(mainBodies.join("").replace(/\s+$/, ""));
  }

  const body = emitParts.join("\n\n\n").replace(/\s+$/, "");
  const combined = gen.finish("");
  (gen as unknown as { definitions_: Record<string, string> }).definitions_ = {};

  const sepIdx = combined.indexOf(DEFS_SEPARATOR);
  const preamble = sepIdx >= 0 ? combined.slice(0, sepIdx) : combined.trimEnd();

  const parts: string[] = [VERSION_HEADER];
  if (preamble) parts.push(preamble);
  if (body) parts.push(body);
  return parts.join("\n\n") + "\n";
}
