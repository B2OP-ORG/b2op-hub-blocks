import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { registerAllBlocks } from "../src/blocks";
import { workspaceToPython } from "../src/codegen/pythonGen";
import { DISPLAY_KINDS, INPUT_KINDS, SCENE_HEADER_PREFIX, emptyScene, makeWidget, nameProblem, parseScene, splitSceneHeader, uniqueName, withSceneHeader, moduleNameProblem, type SceneDoc, type SceneKind } from "../src/scene/model";
import { absolutePos, isOutside, clampedPos, qrLayout, drawnSize } from "../src/scene/geometry";
import { sceneToPython } from "../src/scene/codegen";
import { isSceneFile, projectScenes } from "../src/scene/project";
import { setScenes } from "../src/scene/registry";
import { sceneFlyout } from "../src/blocks/toolbox";

function docWith(...kinds: SceneKind[]): SceneDoc {
  const doc = emptyScene();
  for (const k of kinds) doc.widgets.push(makeWidget(k, 0, 0, doc));
  return doc;
}

describe("scene model", () => {
  it("round-trips through the file header", () => {
    const doc = docWith("label", "list");
    const content = withSceneHeader(doc, sceneToPython(doc, "menu"));
    expect(content.startsWith(SCENE_HEADER_PREFIX)).toBe(true);
    const split = splitSceneHeader(content);
    expect(split.error).toBeNull();
    expect(split.doc).toEqual(doc);
    expect(split.body).toBe(sceneToPython(doc, "menu"));
  });

  it("reports a broken header and drops unknown kinds / dangling parents", () => {
    expect(splitSceneHeader(`${SCENE_HEADER_PREFIX}{oops\nx = 1\n`).error).toMatch(/JSON/);
    const doc = parseScene(JSON.stringify({
      format: "b2op-scene", version: 1, bg: "#000000",
      widgets: [{ kind: "nope", name: "a" }, { kind: "label", name: "l", parent: "missing", x: 1, y: 2, w: 3, h: 4 }],
    }));
    expect(doc.widgets).toHaveLength(1);
    expect(doc.widgets[0].parent).toBeUndefined();
    expect(doc.widgets[0].text).toBe("Text");
  });

  it("names widgets label0, label1, … and validates names", () => {
    const doc = docWith("label", "label", "button");
    expect(doc.widgets.map((w) => w.name)).toEqual(["label0", "label1", "button0"]);
    expect(uniqueName("label", doc)).toBe("label2");
    expect(nameProblem("label0", doc)).toMatch(/already/);
    expect(nameProblem("show", doc)).toMatch(/scene module/);
    expect(nameProblem("button0_label", doc)).toMatch(/already/);
    expect(nameProblem("2x", doc)).toMatch(/letters/);
    expect(nameProblem("_x", doc)).toMatch(/letters/);
    expect(nameProblem("title", doc)).toBeNull();
    expect(moduleNameProblem("lvgl")).toMatch(/built-in/);
    expect(moduleNameProblem("menu")).toBeNull();
  });

  it("detects scene files and lists their widgets", () => {
    const doc = docWith("label", "slider");
    const files = [
      { id: "1", name: "menu.py", content: withSceneHeader(doc, "") },
      { id: "2", name: "main.py", content: "print(1)\n" },
      { id: "3", name: "ui/game.py", content: withSceneHeader(emptyScene(), "") },
    ];
    expect(isSceneFile(files[0])).toBe(true);
    expect(isSceneFile(files[1])).toBe(false);
    const scenes = projectScenes(files);
    expect(scenes.map((s) => s.module)).toEqual(["menu", "ui.game"]);
    expect(scenes[0].widgets).toEqual([{ name: "label0", kind: "label" }, { name: "slider0", kind: "slider" }]);
  });

  it("computes absolute positions through containers", () => {
    const doc = emptyScene();
    const tv = makeWidget("tabview", 0, 0, doc);
    doc.widgets.push(tv);
    const lbl = makeWidget("label", 5, 6, doc, tv.uid, 1);
    doc.widgets.push(lbl);
    expect(absolutePos(doc, lbl)).toEqual({ x: 5, y: 6 + (tv.barSize ?? 20) });
  });
});

describe("scene bounds", () => {
  it("flags widgets outside the screen and pulls them back in", () => {
    const doc = emptyScene();
    const w = makeWidget("label", 300, 10, doc);
    doc.widgets.push(w);
    expect(isOutside(doc, w)).toBe(true);
    expect(clampedPos(doc, w)).toEqual({ x: 160 - w.w, y: 10 });
    expect(isOutside(doc, { ...w, ...clampedPos(doc, w) })).toBe(false);
    const panel = makeWidget("panel", 0, 0, doc);
    doc.widgets.push(panel);
    const child = makeWidget("led", 100, 0, doc, panel.uid);
    expect(isOutside(doc, child)).toBe(true);
    expect(clampedPos(doc, child).x).toBe(panel.w - child.w);
  });
});

describe("QR code size", () => {
  it("matches LVGL's module count and draws whole modules only", () => {
    // 2 bytes → version 1 (21 modules); a 64 px box would leave 1 light px (21 * 3 = 63).
    expect(qrLayout("hi", 64)).toEqual({ modules: 21, scale: 3, px: 63 });
    // LVGL grows the version while the scale still fits: 19 bytes in 64 px → version 3.
    expect(qrLayout("https://example.com", 64)).toEqual({ modules: 29, scale: 2, px: 58 });
    const doc = emptyScene();
    const qr = { ...makeWidget("qrcode", 0, 0, doc), text: "hi", w: 64, h: 64 };
    expect(drawnSize(qr)).toEqual({ w: 63, h: 63 });
    const py = sceneToPython({ ...doc, widgets: [qr] }, "s");
    expect(py).toContain('_qr["qrcode0"] = (qrcode0, 64)');
    expect(py).toContain('set_qr("qrcode0", "hi")');
    expect(py).toContain("qr.set_size((17 + 4 * v) * scale)");
  });
});

describe("scene codegen", () => {
  const all = docWith(...DISPLAY_KINDS, ...INPUT_KINDS);
  const py = sceneToPython(all, "menu");

  it("never restarts LVGL and indents with 4 spaces", () => {
    expect(py).not.toContain("hub.lcd.init");
    expect(py).not.toContain("\t");
    for (const line of py.split("\n")) {
      const indent = /^ */.exec(line)![0].length;
      expect(indent % 4).toBe(0);
    }
    expect(py).toMatch(/^import lvgl as lv$/m);
    expect(py).not.toMatch(/^import hub/m);
  });

  it("builds the scene hidden in a full-screen container", () => {
    expect(py).toContain("root = lv.obj(lv.screen_active())");
    expect(py).toContain("root.set_size(160, 128)");
    expect(py).toContain("root.add_flag(lv.obj.FLAG.HIDDEN)");
    expect(py).toContain("group = lv.group_create()");
    expect(py).toMatch(/def show\(\):[\s\S]*group\.set_default\(\)/);
  });

  it("creates every widget kind as a module global", () => {
    for (const w of all.widgets) expect(py).toMatch(new RegExp(`^${w.name} = lv\\.`, "m"));
    expect(py).toContain("button0_label = lv.label(button0)");
    expect(py).toContain("list0_buttons = _fill_list(list0, \"list0\", [\"Start\", \"Settings\", \"About\"], [\"PLAY\", \"SETTINGS\", \"\"])");
    expect(py).toContain("roller0.set_options(\"One\\nTwo\\nThree\", 0)");
    expect(py).toContain("chart0_series = chart0.add_series(");
  });

  it("puts focusable widgets in the scene group and wires events", () => {
    for (const n of ["button0", "roller0", "dropdown0", "slider0", "checkbox0", "switch0", "scrollbox0"]) expect(py).toContain(`group.add_obj(${n})`);
    expect(py).not.toContain("group.add_obj(label0)");
    expect(py).toContain('button0.add_event_cb(lambda e: _emit("button0"), lv.EVENT.CLICKED, None)');
    expect(py).toContain('slider0.add_event_cb(lambda e: _emit("slider0", slider0.get_value()), lv.EVENT.VALUE_CHANGED, None)');
    expect(py).toMatch(/elif name == "roller0":\n {8}roller0\.set_options/);
  });

  it("creates children in their container (tab pages too)", () => {
    const doc = emptyScene();
    const tv = makeWidget("tabview", 0, 0, doc);
    doc.widgets.push(tv);
    const panel = makeWidget("panel", 0, 0, doc, tv.uid, 1);
    doc.widgets.push(panel);
    doc.widgets.unshift(makeWidget("label", 1, 1, doc, panel.uid));
    const out = sceneToPython(doc, "s");
    expect(out).toContain("panel0 = lv.obj(tabview0_tabs[1])");
    expect(out).toContain("label0 = lv.label(panel0)");
    // parent created before child even though the label comes first in the list
    expect(out.indexOf("panel0 = lv.obj")).toBeLessThan(out.indexOf("label0 = lv.label"));
  });
});

describe("scene blocks", () => {
  beforeEach(() => {
    registerAllBlocks();
    setScenes([{
      module: "menu", fileId: "1", path: "menu.py",
      widgets: [
        { name: "label0", kind: "label" }, { name: "button0", kind: "button" }, { name: "list0", kind: "list" },
        { name: "bar0", kind: "bar" }, { name: "slider0", kind: "slider" }, { name: "led0", kind: "led" },
      ],
    }]);
  });
  afterEach(() => setScenes([]));

  const run = (blocks: object[]) => {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks } }, ws);
    return workspaceToPython(ws);
  };
  const main = (inner: object) => ({ type: "when_program_starts", inputs: { DO: { block: inner } } });
  const text = (t: string) => ({ block: { type: "text", fields: { TEXT: t } } });
  const num = (n: number) => ({ block: { type: "math_number", fields: { NUM: n } } });

  it("imports the scene and calls it", () => {
    const py = run([main({
      type: "scene_show", fields: { SCENE: "menu" },
      next: { block: { type: "scene_set_text", fields: { WIDGET: "menu.label0" }, inputs: { TEXT: text("Hi") },
        next: { block: { type: "scene_set_text", fields: { WIDGET: "menu.button0" }, inputs: { TEXT: text("Go") },
          next: { block: { type: "scene_set_value", fields: { WIDGET: "menu.bar0" }, inputs: { VALUE: num(5) } } } } } } },
    })]);
    expect(py).toMatch(/^import menu$/m);
    expect(py).toMatch(/^import lvgl as lv$/m);
    expect(py).not.toContain("hub.lcd.init");
    expect(py).toContain("menu.show()");
    expect(py).toContain("menu.label0.set_text('Hi')");
    expect(py).toContain("menu.button0_label.set_text('Go')");
    expect(py).toContain("menu.bar0.set_value(int(5), False)");
  });

  it("emits an event handler registered with <module>.on()", () => {
    const py = run([
      { type: "scene_on_event", fields: { WIDGET: "menu.list0" }, inputs: { DO: { block: { type: "text_print", inputs: { TEXT: { block: { type: "scene_event_text" } } } } } } },
      { type: "scene_on_event", fields: { WIDGET: "menu.slider0" }, inputs: { DO: { block: { type: "text_print", inputs: { TEXT: { block: { type: "scene_event_index" } } } } } } },
    ]);
    expect(py).toMatch(/def _on_menu_list0\(ev_index, ev_text\):\n {4}print\(ev_text\)/);
    expect(py).toContain('menu.on("list0", _on_menu_list0)');
    expect(py).toMatch(/def _on_menu_slider0\(ev_value\):\n {4}ev_index = ev_value\n {4}print\(ev_index\)/);
    expect(py).not.toContain("import hub");
    expect(py.indexOf("def _on_menu_list0")).toBeLessThan(py.indexOf('menu.on("list0"'));
  });

  it("drives an LED and keeps user variables off the module name", () => {
    const py = run([main({ type: "scene_set_checked", fields: { WIDGET: "menu.led0" }, inputs: { STATE: { block: { type: "logic_boolean", fields: { BOOL: "FALSE" } } } } })]);
    expect(py).toMatch(/if False:\n {4}menu\.led0\.on\(\)\nelse:\n {4}menu\.led0\.off\(\)/);
  });

  it("offers blocks for the project's scenes in the flyout", () => {
    const fly = sceneFlyout() as { type?: string; fields?: Record<string, string> }[];
    expect(fly.find((b) => b.type === "scene_show")?.fields?.SCENE).toBe("menu");
    expect(fly.find((b) => b.type === "scene_set_text")?.fields?.WIDGET).toBe("menu.label0");
    expect(fly.find((b) => b.type === "scene_on_event")?.fields?.WIDGET).toBe("menu.button0");
    expect(fly.some((b) => b.type === "scene_chart_add")).toBe(false);
  });
});
