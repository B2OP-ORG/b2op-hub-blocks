import { describe, expect, it, beforeEach } from "vitest";
import * as Blockly from "blockly/core";
import { registerAllBlocks } from "../src/blocks";
import { buildToolbox } from "../src/blocks/toolbox";
import { autoShadowListener, fillAllShadows } from "../src/blocks/autoShadow";
import { workspaceToPython } from "../src/codegen/pythonGen";

beforeEach(() => {
  registerAllBlocks();
});

interface Item { kind: string; type?: string; inputs?: object; contents?: Item[]; name?: string; colour?: string }

function toolboxBlocks(): Item[] {
  const out: Item[] = [];
  const walk = (items: Item[]) => {
    for (const it of items) {
      if (it.kind === "block") out.push(it);
      if (it.contents) walk(it.contents);
    }
  };
  walk((buildToolbox(true) as { contents: Item[] }).contents);
  return out;
}

function underProgramHat(inner: object): object {
  return { blocks: { languageVersion: 0, blocks: [{ type: "when_program_starts", inputs: { DO: { block: inner } } }] } };
}

function pyOf(inner: object): string {
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(underProgramHat(inner), ws);
  return workspaceToPython(ws);
}

describe("toolbox defaults", () => {
  it("has no standalone number / text / boolean literal blocks", () => {
    const types = toolboxBlocks().map((b) => b.type);
    expect(types).not.toContain("math_number");
    expect(types).not.toContain("text");
    expect(types).not.toContain("logic_boolean");
  });

  it("prefills every non-list value input of every toolbox block", () => {
    const ws = new Blockly.Workspace();
    for (const item of toolboxBlocks()) {
      const block = Blockly.serialization.blocks.append({ type: item.type!, inputs: item.inputs } as Blockly.serialization.blocks.State, ws);
      for (const input of block.inputList) {
        const conn = input.connection;
        if (!conn || conn.type !== Blockly.ConnectionType.INPUT_VALUE) continue;
        if (conn.getCheck()?.includes("Array")) continue;
        expect(conn.targetBlock(), `${item.type}.${input.name}`).not.toBeNull();
      }
    }
  });

  it("uses color words as LVGL color defaults", () => {
    const rect = toolboxBlocks().find((b) => b.type === "lvgl_rect")!;
    expect((rect.inputs as Record<string, { shadow: { type: string } }>).COLOR.shadow.type).toBe("color_literal");
  });

  it("has string operations in the Text category", () => {
    const text = (buildToolbox(false) as { contents: Item[] }).contents.find((c) => c.name === "Text")!;
    const types = text.contents!.map((b) => b.type);
    for (const t of ["text_join", "text_length", "text_indexOf", "text_getSubstring", "text_changeCase", "text_replace"]) {
      expect(types).toContain(t);
    }
  });

  it("colours Control blocks like the Control category", () => {
    const control = (buildToolbox(false) as { contents: Item[] }).contents.find((c) => c.name === "Control")!;
    const ws = new Blockly.Workspace();
    for (const item of control.contents!) {
      if (item.type!.startsWith("controls_")) continue; // themed via loop_blocks style
      const b = ws.newBlock(item.type!);
      expect(b.getColour(), item.type).toBe(Blockly.utils.colour.hueToHex(Number(control.colour)));
    }
  });
});

describe("auto shadows", () => {
  it("fills empty inputs by check, with explicit defaults first", () => {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(underProgramHat({
      type: "controls_if",
      extraState: { elseIfCount: 1 },
      next: { block: { type: "lvgl_rect" } },
    }), ws);
    fillAllShadows(ws);
    const ifBlock = ws.getBlocksByType("controls_if", false)[0];
    expect(ifBlock.getInputTargetBlock("IF0")?.type).toBe("logic_boolean");
    expect(ifBlock.getInputTargetBlock("IF1")?.type).toBe("logic_boolean");
    const rect = ws.getBlocksByType("lvgl_rect", false)[0];
    expect(rect.getInputTargetBlock("COLOR")?.type).toBe("color_literal");
    expect(rect.getInputTargetBlock("W")?.getFieldValue("NUM")).toBe(40);
  });
});

describe("auto shadow listener", () => {
  it("fills inputs of new blocks and inputs added by a mutation", async () => {
    const ws = new Blockly.Workspace();
    ws.addChangeListener(autoShadowListener(ws));
    const block = Blockly.serialization.blocks.append({ type: "text_join", extraState: { itemCount: 2 } }, ws, { recordUndo: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(block.getInputTargetBlock("ADD0")?.type).toBe("text");
    Blockly.Events.setGroup(true);
    const before = Blockly.Xml.domToText(Blockly.Xml.blockToDom(block));
    block.loadExtraState!({ itemCount: 3 });
    Blockly.Events.fire(new (Blockly.Events.get(Blockly.Events.BLOCK_CHANGE))(block, "mutation", null, before, Blockly.Xml.domToText(Blockly.Xml.blockToDom(block))));
    Blockly.Events.setGroup(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(block.getInputTargetBlock("ADD2")?.type).toBe("text");
  });
});

describe("text inputs", () => {
  it("wraps a number given to the LVGL label in str()", () => {
    const py = pyOf({
      type: "lvgl_label",
      inputs: { TEXT: { block: { type: "math_number", fields: { NUM: 42 } } } },
    });
    expect(py).toContain(".set_text(str(42))");
  });

  it("does not wrap a string", () => {
    const py = pyOf({
      type: "lvgl_label",
      inputs: { TEXT: { block: { type: "text", fields: { TEXT: "hi" } } } },
    });
    expect(py).toContain(".set_text('hi')");
  });

  it("wraps arithmetic and variables in str() for built-in text blocks", () => {
    const py = pyOf({
      type: "text_print",
      inputs: {
        TEXT: {
          block: {
            type: "text_replace",
            inputs: {
              TEXT: { block: { type: "math_arithmetic", fields: { OP: "ADD" }, inputs: { A: { block: { type: "math_number", fields: { NUM: 1 } } }, B: { block: { type: "math_number", fields: { NUM: 2 } } } } } },
              FROM: { block: { type: "text", fields: { TEXT: "3" } } },
              TO: { block: { type: "math_number", fields: { NUM: 4 } } },
            },
          },
        },
      },
    });
    expect(py).toContain("str(1 + 2).replace('3', str(4))");
  });

  it("accepts numbers in String-only inputs", () => {
    const ws = new Blockly.Workspace();
    const b = ws.newBlock("text_reverse");
    expect(b.getInput("TEXT")!.connection!.getCheck()).toEqual(["String", "Number"]);
  });

  it("emits MicroPython-safe title case and reverse", () => {
    const title = pyOf({
      type: "text_print",
      inputs: { TEXT: { block: { type: "text_changeCase", fields: { CASE: "TITLECASE" }, inputs: { TEXT: { block: { type: "text", fields: { TEXT: "ab" } } } } } } },
    });
    expect(title).not.toContain(".title()");
    expect(title).toContain("text_to_title_case('ab')");
    const rev = pyOf({
      type: "text_print",
      inputs: { TEXT: { block: { type: "text_reverse", inputs: { TEXT: { block: { type: "text", fields: { TEXT: "ab" } } } } } } },
    });
    expect(rev).not.toContain("[::-1]");
    expect(rev).toContain("text_reverse('ab')");
  });
});
