import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { registerAllBlocks } from "../src/blocks";
import { workspaceToPython } from "../src/codegen/pythonGen";
import { DISPLAY_KINDS, INPUT_KINDS, SCENE_HEADER_PREFIX, emptyScene, makeWidget, nameProblem, parseScene, splitSceneHeader, uniqueName, withSceneHeader, moduleNameProblem, type SceneDoc, type SceneKind, type SceneWidget } from "../src/scene/model";
import { absolutePos, isOutside, clampedPos, qrLayout, drawnSize, normalizeLine, simplifyPoints, arcStretch, sweepOf, triangulate, lvArcCircle, effectiveCrop, dragCropEdge } from "../src/scene/geometry";
import { sceneToPython } from "../src/scene/codegen";
import { isSceneFile, projectScenes, resolveSceneSrc, sceneSrcFor } from "../src/scene/project";
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
    // Absent options stay absent (= LVGL default), they aren't refilled from the kind defaults.
    expect(doc.widgets[0].text).toBeUndefined();
    expect(doc.widgets[0].w).toBe(3);
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
    expect(py).toMatch(/group\.set_default\(\)\n    if group\.get_focused\(\) is None:\n        group\.focus_next\(\)/);
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

describe("scene shapes and styles", () => {
  it("keeps cleared defaults cleared across a reload (e.g. no fill)", () => {
    const doc = docWith("rect", "label");
    delete doc.widgets[0].bg;
    delete doc.widgets[1].color;
    const back = splitSceneHeader(withSceneHeader(doc, "")).doc!;
    expect(back.widgets[0].bg).toBeUndefined();
    expect(back.widgets[1].color).toBeUndefined();
    expect(sceneToPython(back, "s")).toContain("rect0.set_style_bg_opa(lv.OPA.TRANSP, 0)");
    // A missing size still gets the kind's default.
    const raw = JSON.parse(JSON.stringify(doc));
    delete raw.widgets[0].w;
    expect(parseScene(JSON.stringify(raw)).widgets[0].w).toBe(40);
  });

  const one = (patch: Partial<SceneWidget>, kind: SceneKind) => {
    const doc = docWith(kind);
    Object.assign(doc.widgets[0], patch);
    return sceneToPython(doc, "s");
  };

  it("draws rectangles, circles and arc strokes with plain LVGL objects", () => {
    const rect = one({}, "rect");
    expect(rect).toContain("rect0 = lv.obj(root)");
    expect(rect).toContain("rect0.remove_flag(lv.obj.FLAG.SCROLLABLE)");
    expect(rect).toContain("rect0.set_style_bg_color(lv.color_hex(0x2196F3), 0)");
    expect(one({ bg: undefined }, "rect")).toContain("rect0.set_style_bg_opa(lv.OPA.TRANSP, 0)");
    expect(one({}, "ellipse")).toContain("ellipse0.set_style_radius(lv.RADIUS_CIRCLE, 0)");
    const arc = one({ w: 60, h: 20 }, "arcline");
    expect(arc).toContain("arcline0 = lv.arc(root)");
    // A 20 px square arc stretched 3× wide (256 = 1×).
    expect(arc).toContain("arcline0.set_size(20, 20)");
    expect(arc).toContain("arcline0.set_style_transform_scale_x(768, 0)");
    expect(arc).not.toContain("transform_scale_y");
    expect(arc).toContain("arcline0.set_bg_angles(180, 0)");
    expect(arc).toContain("arcline0.set_style_arc_opa(lv.OPA.TRANSP, lv.PART.INDICATOR)");
    expect(arc).toContain("arcline0.set_style_arc_color(lv.color_hex(0xFFFFFF), 0)");
    // Gauges stretch only when asked to.
    expect(one({ w: 60, h: 30 }, "arc")).toContain("arc0.set_size(60, 30)");
    expect(one({ w: 60, h: 30, stretch: true }, "arc")).toContain("arc0.set_style_transform_scale_x(512, 0)");
  });

  it("sets arc angles, mode, track colour and rounding", () => {
    const py = one({ startAngle: 180, endAngle: 0, arcMode: "symmetrical", bg: "#112233", rounded: false }, "arc");
    expect(py).toContain("arc0.set_bg_angles(180, 0)");
    expect(py).toContain("arc0.set_mode(1)  # symmetrical");
    expect(py).toContain("arc0.set_style_arc_color(lv.color_hex(0x112233), 0)");
    expect(py).toContain("arc0.set_style_arc_rounded(False, lv.PART.INDICATOR)");
    // Untouched arcs keep LVGL's defaults.
    expect(one({}, "arc")).not.toMatch(/set_bg_angles|set_mode|set_rotation/);
  });

  it("styles lines, bars, spinners, text and opacity", () => {
    const line = one({ dashWidth: 4, dashGap: 2, rounded: false }, "line");
    expect(line).toContain("line0.set_style_line_dash_width(4, 0)");
    expect(line).toContain("line0.set_style_line_dash_gap(2, 0)");
    expect(line).toContain("line0.set_style_line_rounded(False, 0)");
    expect(one({ barMode: "symmetrical" }, "bar")).toContain("bar0.set_mode(1)  # symmetrical");
    expect(one({ spinTime: 2000, spinArc: 90 }, "spinner")).toContain("spinner0.set_anim_params(2000, 90)");
    const label = one({ letterSpace: 2, lineSpace: 3, opacity: 50 }, "label");
    expect(label).toContain("label0.set_style_text_letter_space(2, 0)");
    expect(label).toContain("label0.set_style_text_line_space(3, 0)");
    expect(label).toContain("label0.set_style_opa(128, 0)");
    expect(one({ opacity: 100 }, "label")).not.toContain("set_style_opa");
  });

  it("follows lv_draw_arc's angle rules and stretches with transforms", () => {
    expect(sweepOf(180, 0)).toBe(180);
    expect(sweepOf(0, 360)).toBe(360);
    expect(sweepOf(90, 90)).toBe(0); // LVGL draws nothing
    expect(arcStretch({ kind: "arcline", w: 40, h: 40 })).toEqual({ s: 40, sx: 256, sy: 256 });
    expect(arcStretch({ kind: "arcline", w: 30, h: 45 })).toEqual({ s: 30, sx: 256, sy: 384 });
    expect(arcStretch({ kind: "arc", w: 30, h: 45 })).toBeNull();
  });

  it("closes and fills lines with triangles", () => {
    const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(triangulate(square).length).toBe(12); // 2 triangles
    const concave: [number, number][] = [[0, 0], [20, 0], [20, 20], [10, 5], [0, 20]];
    const t = triangulate(concave);
    expect(t.length).toBe(18); // 3 triangles
    let area = 0;
    for (let i = 0; i < t.length; i += 6) area += Math.abs((t[i + 2] - t[i]) * (t[i + 5] - t[i + 1]) - (t[i + 4] - t[i]) * (t[i + 3] - t[i + 1])) / 2;
    expect(area).toBe(250); // 400 minus the 150 notch
    const py = one({ points: square, closed: true, bg: "#ff0000" }, "line");
    expect(py).toContain('line0_points = [{"x": 0, "y": 0}, {"x": 10, "y": 0}, {"x": 10, "y": 10}, {"x": 0, "y": 10}, {"x": 0, "y": 0}]');
    expect(py).toMatch(/^line0_tris = \((\d+, ){11}\d+\)$/m);
    expect(py).toContain("line0.add_event_cb(lambda e: _fill_tris(e, line0_tris, lv.color_hex(0xFF0000)), lv.EVENT.DRAW_MAIN_BEGIN, None)");
    expect(py).toContain("def _fill_tris(e, tris, color):");
    expect(one({ points: square, closed: true }, "line")).not.toContain("_fill_tris");
  });

  it("puts lv_arc circles in the top-left corner of their box", () => {
    expect(lvArcCircle({ w: 100, h: 41 })).toEqual({ cx: 20, cy: 20, r: 20 });
    expect(lvArcCircle({ w: 30, h: 80 })).toEqual({ cx: 15, cy: 15, r: 15 });
  });

  it("crops arcs with a clipping container", () => {
    const doc = docWith("arc");
    Object.assign(doc.widgets[0], { x: 10, y: 20, w: 60, h: 60, crop: { x: 0, y: 0, w: 60, h: 30 } });
    const py = sceneToPython(doc, "s");
    expect(py).toContain("arc0_clip = lv.obj(root)");
    expect(py).toContain("arc0_clip.set_pos(10, 20)");
    expect(py).toContain("arc0_clip.set_size(60, 30)");
    expect(py).toContain("arc0 = lv.arc(arc0_clip)");
    expect(py).toContain("arc0.set_pos(0, 0)");
    expect(py.indexOf("arc0_clip = lv.obj")).toBeLessThan(py.indexOf("arc0 = lv.arc"));
    // A window covering everything is no crop; edges stay inside the box.
    expect(effectiveCrop({ kind: "arc", w: 60, h: 60, crop: { x: 0, y: 0, w: 60, h: 60 } })).toBeUndefined();
    expect(effectiveCrop({ kind: "arc", w: 60, h: 60, crop: { x: 50, y: -5, w: 30, h: 10 } })).toEqual({ x: 50, y: 0, w: 10, h: 10 });
    expect(dragCropEdge({ kind: "arc", w: 60, h: 60, crop: { x: 0, y: 0, w: 60, h: 30 } }, 3, 0, 100)).toEqual({ x: 0, y: 0, w: 60, h: 60 });
    expect(nameProblem("arc0_clip", doc)).toBe("Another widget already uses this name.");
  });

  it("keeps line points at the origin and simplifies pen strokes", () => {
    expect(normalizeLine({ x: 10, y: 10, points: [[-5, 2], [5, -3]] as [number, number][] }))
      .toEqual({ x: 5, y: 7, points: [[0, 5], [10, 0]] });
    const w = { x: 1, y: 2, points: [[0, 0], [3, 4]] as [number, number][] };
    expect(normalizeLine(w)).toBe(w);
    const stroke: [number, number][] = Array.from({ length: 21 }, (_, i) => [i, i < 10 ? 0 : i - 10 + 0.2]);
    const s = simplifyPoints(stroke, 0.8);
    expect(s[0]).toEqual([0, 0]);
    expect(s[s.length - 1]).toEqual([20, 10]);
    expect(s.length).toBeLessThanOrEqual(4);
  });

  it("resolves image paths relative to the scene", () => {
    expect(resolveSceneSrc("scenes/menu.py", "images/a.png")).toBe("scenes/images/a.png");
    expect(resolveSceneSrc("menu.py", "images/a.png")).toBe("images/a.png");
    expect(resolveSceneSrc("scenes/menu.py", "../logo.png")).toBe("logo.png");
    expect(resolveSceneSrc("menu.py", "../logo.png")).toBeNull();
    expect(resolveSceneSrc("menu.py", "/sd/x.png")).toBeNull();
    expect(sceneSrcFor("scenes/menu.py", "scenes/images/a.png")).toBe("images/a.png");
    expect(sceneSrcFor("scenes/menu.py", "logo.png")).toBe("../logo.png");
    expect(sceneSrcFor("menu.py", "images/a.png")).toBe("images/a.png");
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

  it("skips deleted / not yet created scenes and widgets", () => {
    const py = run([
      main({
        type: "scene_show", fields: { SCENE: "gone" },
        next: { block: { type: "scene_set_text", fields: { WIDGET: "gone.label0" }, inputs: { TEXT: text("Hi") },
          next: { block: { type: "scene_set_text", fields: { WIDGET: "menu.label9" }, inputs: { TEXT: text("Hi") },
            next: { block: { type: "text_print", inputs: { TEXT: { block: { type: "scene_get_value", fields: { WIDGET: "menu.bar9" } } } } } } } } } },
      }),
      { type: "scene_on_event", fields: { WIDGET: "menu.button9" }, inputs: { DO: { block: { type: "text_print", inputs: { TEXT: text("x") } } } } },
    ]);
    expect(py).not.toMatch(/^import (gone|menu)$/m);
    expect(py).toContain('pass  # scene "gone" not found');
    expect(py).toContain('pass  # scene widget "gone.label0" not found');
    expect(py).toContain('pass  # scene widget "menu.label9" not found');
    expect(py).toContain("print(0)");
    expect(py).not.toContain("_on_menu_button9");
    expect(py).not.toContain("menu.on(");
  });

  it("offers blocks for the project's scenes in the flyout", () => {
    const fly = sceneFlyout() as { type?: string; fields?: Record<string, string> }[];
    expect(fly.find((b) => b.type === "scene_show")?.fields?.SCENE).toBe("menu");
    expect(fly.find((b) => b.type === "scene_set_text")?.fields?.WIDGET).toBe("menu.label0");
    expect(fly.find((b) => b.type === "scene_on_event")?.fields?.WIDGET).toBe("menu.button0");
    expect(fly.some((b) => b.type === "scene_chart_add")).toBe(false);
  });
});
