import * as Blockly from "blockly/core";
import type { Block, Input } from "blockly";
import { Order, type PythonGenerator } from "blockly/python";

/** Check given to text inputs: strings, and numbers (converted with str()). */
const TEXT_INPUT_CHECK = ["String", "Number"];

function isTextInput(input: Input | null): boolean {
  const check = input?.connection?.getCheck();
  return !!check && check.includes("String") && !check.includes("Array");
}

/** Whether `block` provably outputs a string (so no str() is needed). */
function outputsString(block: Block): boolean {
  const check = block.outputConnection?.getCheck();
  return !!check && check.length > 0 && check.every((c) => c === "String");
}

/**
 * Let every String-only value input also accept numbers. Wraps the `init` of
 * every registered block type (built-in and custom), so call it after all
 * blocks are defined.
 */
export function relaxTextInputs(): void {
  for (const def of Object.values(Blockly.Blocks)) {
    const init = (def as { init?: () => void }).init;
    if (typeof init !== "function") continue;
    (def as { init: () => void }).init = function (this: Block) {
      init.call(this);
      for (const input of this.inputList) {
        const check = input.connection?.getCheck();
        if (check && check.length === 1 && check[0] === "String") input.setCheck(TEXT_INPUT_CHECK);
      }
    };
  }
}

/**
 * Text inputs (check includes "String", not "Array") get `str(...)` around any
 * value that isn't provably a string: numbers, variables, remote values, …
 * Done at the valueToCode level so it covers custom and built-in generators.
 */
function wrapValueToCode(gen: PythonGenerator): void {
  const orig = gen.valueToCode.bind(gen);
  gen.valueToCode = (block: Block, name: string, outerOrder: number): string => {
    const target = block.getInputTargetBlock(name);
    if (!target || outputsString(target) || !isTextInput(block.getInput(name))) {
      return orig(block, name, outerOrder);
    }
    const code = orig(block, name, Order.NONE);
    return code ? `str(${code})` : code;
  };
}

export function registerTextGenerators(gen: PythonGenerator): void {
  wrapValueToCode(gen);

  // MicroPython's str has no title() and may not support slice steps:
  // replace Blockly's title-case and reverse with portable helpers.
  const changeCase = gen.forBlock["text_changeCase"];
  gen.forBlock["text_changeCase"] = function (block, g) {
    if (block.getFieldValue("CASE") !== "TITLECASE") return changeCase.call(this, block, g);
    const fn = gen.provideFunction_("text_to_title_case", [
      `def ${gen.FUNCTION_NAME_PLACEHOLDER_}(s):`,
      `    return " ".join([w[:1].upper() + w[1:].lower() for w in s.split(" ")])`,
    ]);
    const text = gen.valueToCode(block, "TEXT", Order.NONE) || "''";
    return [`${fn}(${text})`, Order.FUNCTION_CALL];
  };

  gen.forBlock["text_reverse"] = (block: Block) => {
    const fn = gen.provideFunction_("text_reverse", [
      `def ${gen.FUNCTION_NAME_PLACEHOLDER_}(s):`,
      `    return "".join([s[i] for i in range(len(s) - 1, -1, -1)])`,
    ]);
    const text = gen.valueToCode(block, "TEXT", Order.NONE) || "''";
    return [`${fn}(${text})`, Order.FUNCTION_CALL];
  };
}
