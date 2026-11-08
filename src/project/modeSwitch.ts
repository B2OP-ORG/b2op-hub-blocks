// Pure-ish helpers for Python ↔ Blocks translation checks. Blockly is loaded
// lazily so it stays out of the main bundle.

import { newBlocksProject, stripBlocksHeader } from "./format";
import { hasRawBlock, normalizePython, pythonToBlocks } from "./pythonToBlocks";

/** Blockly workspace JSON built from Python source (header ignored). */
export function workspaceFromPython(source: string): unknown {
  const { main, buttonHats, variables } = pythonToBlocks(source);
  const topBlocks: Record<string, unknown>[] = [];
  const programHat: Record<string, unknown> = { type: "when_program_starts", x: 40, y: 40 };
  if (main) programHat.inputs = { DO: { block: main } };
  topBlocks.push(programHat);
  buttonHats.forEach((h, i) => {
    const b: Record<string, unknown> = { type: "on_button_pressed", x: 320, y: 40 + i * 140, fields: { BTN: h.btn } };
    if (h.chain) b.inputs = { DO: { block: h.chain } };
    topBlocks.push(b);
  });
  const workspace: Record<string, unknown> = { blocks: { languageVersion: 0, blocks: topBlocks } };
  if (variables.length) workspace.variables = variables;
  return workspace;
}

export function emptyWorkspace(): unknown {
  return newBlocksProject().workspace;
}

/** Generate Python for a workspace JSON using a headless Blockly workspace. */
export async function pythonFromWorkspace(workspace: unknown): Promise<string> {
  const [Blockly, { workspaceToPython }] = await Promise.all([
    import("blockly/core"),
    import("../codegen/pythonGen"),
  ]);
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(workspace as object, ws);
    return workspaceToPython(ws);
  } finally {
    ws.dispose();
  }
}

export interface TranslationCheck {
  /** Some code only maps to raw-Python blocks. */
  hasRaw: boolean;
  /** Python regenerated from the translated blocks equals the source. */
  roundTripOk: boolean;
  workspace: unknown;
  regen: string;
}

/** Translate Python (header ignored) to blocks and check it round-trips. */
export async function checkTranslation(source: string): Promise<TranslationCheck> {
  const body = stripBlocksHeader(source);
  const workspace = workspaceFromPython(body);
  const { main, buttonHats } = pythonToBlocks(body);
  const hasRaw = hasRawBlock(main) || buttonHats.some((h) => hasRawBlock(h.chain));
  const regen = await pythonFromWorkspace(workspace);
  return { hasRaw, roundTripOk: samePython(regen, body), workspace, regen };
}

export function samePython(a: string, b: string): boolean {
  return normalizePython(stripBlocksHeader(a)) === normalizePython(stripBlocksHeader(b));
}
