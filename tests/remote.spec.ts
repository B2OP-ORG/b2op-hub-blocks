import { describe, expect, it, beforeEach } from "vitest";
import * as Blockly from "blockly/core";
import { registerAllBlocks } from "../src/blocks";
import { workspaceToPython } from "../src/codegen/pythonGen";
import { checkTranslation, workspaceFromPython } from "../src/codegen/translate";
import { remoteFlyout } from "../src/blocks/toolbox";
import { migrateWorkspaceState } from "../src/blocks/migrate";
import { RemoteType } from "../src/device/protocol";
import {
  DEFAULT_REMOTE_FILE, emptyLayout, isAttrName, layoutSymbols, makeWidget, nameProblem, parseLayout,
  projectSymbols, serializeLayout, symbolConflicts, type RemoteLayout,
} from "../src/remote/layout";
import { setRemoteSymbols } from "../src/remote/registry";
import { remoteStubText } from "../src/remote/stub";
import { FieldRemoteName } from "../src/blocks/defs/remote";

function layout(...kinds: Parameters<typeof makeWidget>[0][]): RemoteLayout {
  const l = emptyLayout();
  for (const k of kinds) l.widgets.push(makeWidget(k, 0, 0, layoutSymbols(l, DEFAULT_REMOTE_FILE)));
  return l;
}

function run(state: object): string {
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(state, ws);
  try { return workspaceToPython(ws); } finally { ws.dispose(); }
}

const prog = (inner: object) => ({
  blocks: { languageVersion: 0, blocks: [{ type: "when_program_starts", inputs: { DO: { block: inner } } }] },
});

describe("remote layout", () => {
  it("round-trips through JSON and fills defaults", () => {
    const l = layout("slider", "joystick", "gauge");
    const back = parseLayout(serializeLayout(l));
    expect(back).toEqual(l);
    const partial = parseLayout(JSON.stringify({ format: "b2op-remote", version: 1, widgets: [{ kind: "slider", name: "s", id: 3, x: 0, y: 0 }] }));
    expect(partial.widgets[0]).toMatchObject({ min: -100, max: 100, w: 240, valueType: "int" });
    expect(parseLayout("")).toEqual(emptyLayout());
    expect(() => parseLayout("{")).toThrow(/JSON/);
    expect(() => parseLayout('{"format":"x"}')).toThrow(/Not a remote/);
  });

  it("gives new widgets unique names and free ids across controls and indicators", () => {
    const l = layout("slider", "slider", "joystick", "display", "led");
    const syms = layoutSymbols(l, DEFAULT_REMOTE_FILE);
    expect(syms.map((s) => [s.role, s.name, s.id, s.type])).toEqual([
      ["control", "speed", 0, RemoteType.Int],
      ["control", "speed2", 1, RemoteType.Int],
      ["control", "stick_x", 2, RemoteType.Int],
      ["control", "stick_y", 3, RemoteType.Int],
      ["indicator", "value", 4, RemoteType.Float],
      ["indicator", "lamp", 5, RemoteType.Bool],
    ]);
    expect(symbolConflicts(syms)).toEqual({ names: new Set(), ids: new Set() });
  });

  it("reports duplicate names / ids across files", () => {
    const a = layout("slider");
    const files = [
      { name: "controller.remote", content: serializeLayout(a) },
      { name: "other.remote", content: serializeLayout(a) },
      { name: "main.py", content: "x" },
      { name: "broken.remote", content: "{" },
    ];
    const syms = projectSymbols(files);
    expect(syms).toHaveLength(2);
    const c = symbolConflicts(syms);
    expect(c.names.has("speed")).toBe(true);
    expect(c.ids.has(0)).toBe(true);
  });

  it("reports a control and an indicator sharing an id or name (one id space)", () => {
    const l = layout("slider", "display");
    l.widgets[1].id = l.widgets[0].id;
    let c = symbolConflicts(layoutSymbols(l, DEFAULT_REMOTE_FILE));
    expect(c.ids.has(l.widgets[0].id)).toBe(true);
    expect(c.names.size).toBe(0);
    l.widgets[1].id = 9;
    l.widgets[1].name = l.widgets[0].name;
    c = symbolConflicts(layoutSymbols(l, DEFAULT_REMOTE_FILE));
    expect(c.names.has(l.widgets[0].name)).toBe(true);
    expect(c.ids.size).toBe(0);
  });

  it("validates names", () => {
    expect(nameProblem("speed", "slider")).toBeNull();
    expect(nameProblem("", "slider")).toMatch(/empty/);
    expect(nameProblem("2x", "slider")).toMatch(/letters/);
    expect(nameProblem("get", "slider")).toMatch(/remote function/);
    expect(nameProblem("while", "slider")).toMatch(/keyword/);
    expect(nameProblem("a".repeat(31), "joystick")).toMatch(/too long/);
    expect(isAttrName("items")).toBe(false);
  });
});

describe("remote stub", () => {
  it("adds typed attributes for controls only", () => {
    const syms = layoutSymbols(layout("slider", "switch", "text_input", "joystick", "display"), DEFAULT_REMOTE_FILE);
    const text = remoteStubText("def get(name: str) -> Any: ...\n", syms);
    expect(text).toContain("def get(name: str)");
    expect(text).toMatch(/^speed: int$/m);
    expect(text).toMatch(/^light: bool$/m);
    expect(text).toMatch(/^text: str$/m);
    expect(text).toMatch(/^stick_x: int$/m);
    expect(text).not.toMatch(/^value:/m);
  });
});

describe("remote blocks", () => {
  beforeEach(() => {
    registerAllBlocks();
    const l = layout("slider", "display", "led");
    l.widgets[1].valueType = "int";
    setRemoteSymbols(layoutSymbols(l, DEFAULT_REMOTE_FILE));
  });

  it("reads controls as remote.<name>, or remote.get() for odd names", () => {
    const py = run(prog({ type: "text_print", inputs: { TEXT: { block: { type: "remote_get_number", fields: { NAME: "speed" } } } } }));
    expect(py).toContain("import remote");
    expect(py).toContain("print(remote.speed)");
    const l = layout("slider");
    l.widgets[0].name = "my speed";
    setRemoteSymbols(layoutSymbols(l, DEFAULT_REMOTE_FILE));
    const odd = run(prog({ type: "text_print", inputs: { TEXT: { block: { type: "remote_get_number", fields: { NAME: "my speed" } } } } }));
    expect(odd).toContain("print(remote.get('my speed'))");
  });

  it("declares indicators from the layout and converts values for INT / STR", () => {
    const py = run(prog({
      type: "remote_set_indicator",
      fields: { NAME: "value" },
      inputs: { VALUE: { block: { type: "remote_get_number", fields: { NAME: "speed" } } } },
      next: { block: {
        type: "remote_set_indicator",
        fields: { NAME: "lamp" },
        inputs: { VALUE: { block: { type: "logic_boolean", fields: { BOOL: "TRUE" } } } },
      } },
    }));
    expect(py).toContain("remote.create_message(1, 'value', remote.INT)\nremote.create_message(2, 'lamp', remote.BOOL)");
    expect(py).toContain("remote.send(1, int(remote.speed))");
    expect(py).toContain("remote.send(2, True)");
  });

  it("skips undefined names in code but keeps them on the block", () => {
    const py = run(prog({
      type: "remote_set_indicator",
      fields: { NAME: "status" },
      inputs: { VALUE: { block: { type: "text", fields: { TEXT: "ok" } } } },
      next: { block: { type: "text_print", inputs: { TEXT: { block: { type: "remote_get_number", fields: { NAME: "ghost" } } } } } },
    }));
    expect(py).not.toContain("import remote");
    expect(py).not.toContain("create_message");
    expect(py).not.toContain("remote.send");
    expect(py).toContain("pass  # remote name 'status' not defined");
    expect(py).toContain("print(0)");
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(prog({ type: "text_print", inputs: { TEXT: { block: { type: "remote_get_number", fields: { NAME: "ghost" } } } } }), ws);
    const f = ws.getAllBlocks(false).find((b) => b.type === "remote_get_number")!.getField("NAME") as FieldRemoteName;
    expect(f.getValue()).toBe("ghost");
    expect(f.isDefined()).toBe(false);
    expect(f.getText()).toBe("ghost (not defined)");
    ws.dispose();
  });

  it("round-trips Python → blocks → Python", async () => {
    const py = run(prog({
      type: "controls_whileUntil",
      fields: { MODE: "WHILE" },
      inputs: {
        BOOL: { block: { type: "logic_boolean", fields: { BOOL: "TRUE" } } },
        DO: { block: {
          type: "remote_set_indicator",
          fields: { NAME: "value" },
          inputs: { VALUE: { block: { type: "math_arithmetic", fields: { OP: "MULTIPLY" }, inputs: {
            A: { block: { type: "remote_get_number", fields: { NAME: "speed" } } },
            B: { block: { type: "math_number", fields: { NUM: 2 } } },
          } } } },
        } },
      },
    }));
    expect(py).toContain("remote.send(1, int(remote.speed * 2))");
    const t = await checkTranslation(py);
    expect(t.hasRaw).toBe(false);
    expect(t.roundTripOk).toBe(true);
  });

  it("sets a control by its layout id, declaring it too", async () => {
    const py = run(prog({
      type: "remote_set_indicator",
      fields: { NAME: "speed" },
      inputs: { VALUE: { block: { type: "math_number", fields: { NUM: 0 } } } },
    }));
    expect(py).toContain("remote.create_message(0, 'speed', remote.INT)");
    expect(py).toContain("remote.send(0, 0)");
    const t = await checkTranslation(py);
    expect(t.hasRaw).toBe(false);
    expect(t.roundTripOk).toBe(true);
    // Without the declaration the id still names the layout control.
    const ws = JSON.stringify(workspaceFromPython("# b2op-hub-blocks v2.0.0\n\nimport remote\n\nremote.send(0, 5)\n"));
    expect(ws).toContain('"remote_set_indicator"');
    expect(ws).toContain('"NAME":"speed"');
  });

  it("lists controls and indicators in the set block", () => {
    const ws = new Blockly.Workspace();
    const f = ws.newBlock("remote_set_indicator").getField("NAME") as FieldRemoteName;
    expect(f.getOptions().map((o) => o[1])).toEqual(["speed", "value", "lamp"]);
    ws.dispose();
  });

  it("translates remote.get(\"x\") reads", async () => {
    const l = layout("slider");
    l.widgets[0].name = "my speed";
    setRemoteSymbols(layoutSymbols(l, DEFAULT_REMOTE_FILE));
    const src = "# b2op-hub-blocks v2.0.0\n\nimport remote\n\nprint(remote.get('my speed'))\n";
    const t = await checkTranslation(src);
    expect(t.hasRaw).toBe(false);
    expect(t.roundTripOk).toBe(true);
  });
});

describe("typed remote reporters", () => {
  const sym = (name: string, type: RemoteType, id: number) =>
    ({ name, id, type, role: "control" as const, kind: "slider" as const, file: DEFAULT_REMOTE_FILE, uid: name });

  beforeEach(() => {
    registerAllBlocks();
    setRemoteSymbols([sym("speed", RemoteType.Int, 0), sym("lamp", RemoteType.Bool, 1), sym("msg", RemoteType.Str, 2)]);
  });
  const withOut = () => setRemoteSymbols([
    sym("speed", RemoteType.Int, 0), sym("lamp", RemoteType.Bool, 1), sym("msg", RemoteType.Str, 2),
    { ...sym("out", RemoteType.Str, 3), role: "indicator" as const, kind: "display" as const },
  ]);

  it("outputs Number / Boolean / String", () => {
    const ws = new Blockly.Workspace();
    expect(ws.newBlock("remote_get_number").outputConnection!.getCheck()).toEqual(["Number"]);
    expect(ws.newBlock("remote_get_bool").outputConnection!.getCheck()).toEqual(["Boolean"]);
    expect(ws.newBlock("remote_get_text").outputConnection!.getCheck()).toEqual(["String"]);
    ws.dispose();
  });

  it("lists only controls of the block's kind; other kinds count as not defined", () => {
    const ws = new Blockly.Workspace();
    const b = ws.newBlock("remote_get_bool");
    const f = b.getField("NAME") as FieldRemoteName;
    expect(f.getOptions().map((o) => o[1])).toEqual(["lamp"]);
    f.setValue("speed");
    expect(f.isDefined()).toBe(false);
    expect(f.otherKindSymbol()?.name).toBe("speed");
    ws.dispose();
  });

  it("groups the flyout by kind", () => {
    const blocks = (remoteFlyout() as { kind: string; type?: string; fields?: { NAME: string } }[])
      .filter((i) => i.kind === "block" && i.type !== "remote_set_indicator")
      .map((i) => [i.type, i.fields!.NAME]);
    expect(blocks).toEqual([["remote_get_number", "speed"], ["remote_get_bool", "lamp"], ["remote_get_text", "msg"]]);
    const sets = (remoteFlyout() as { kind: string; type?: string; fields?: { NAME: string } }[])
      .filter((i) => i.kind === "block" && i.type === "remote_set_indicator")
      .map((i) => i.fields!.NAME);
    expect(sets).toEqual(["speed", "lamp", "msg"]);
  });

  it("does not str() a text control sent to a STR indicator", () => {
    withOut();
    const py = run(prog({
      type: "remote_set_indicator",
      fields: { NAME: "out" },
      inputs: { VALUE: { block: { type: "remote_get_text", fields: { NAME: "msg" } } } },
    }));
    expect(py).toContain("remote.create_message(3, 'out', remote.STR)");
    expect(py).toContain("remote.send(3, remote.msg)");
  });

  it("types reporters when translating Python, and migrates old remote_get", async () => {
    const src = "# b2op-hub-blocks v2.0.0\n\nimport remote\n\nprint(remote.lamp)\nprint(remote.msg)\nprint(remote.speed)\n";
    const t = await checkTranslation(src);
    expect(t.hasRaw).toBe(false);
    expect(t.roundTripOk).toBe(true);
    const ws = workspaceFromPython(src) as { blocks: { blocks: { inputs: { DO: { block: object } } }[] } };
    expect(JSON.stringify(ws)).toContain('"remote_get_bool"');
    expect(JSON.stringify(ws)).toContain('"remote_get_text"');
    const migrated = JSON.stringify(migrateWorkspaceState(prog({ type: "text_print", inputs: { TEXT: { block: { type: "remote_get", fields: { NAME: "lamp" } } } } })));
    expect(migrated).toContain('"remote_get_bool"');
  });
});

describe("remote session messages", () => {
  it("tracks program messages by id and finds them by name", async () => {
    const { applyRemoteEvent, messageByName, useRemoteSession } = await import("../src/remote/session");
    applyRemoteEvent({ op: "define", defs: [{ id: 3, type: RemoteType.Float, name: "level" }, { id: 4, type: RemoteType.Bool, name: "lamp" }] });
    expect(messageByName(useRemoteSession.getState().messages, "level")?.value).toBe(0);
    applyRemoteEvent({ op: "set", values: [{ id: 3, value: 42.5 }, { id: 9, value: 1 }] });
    expect(messageByName(useRemoteSession.getState().messages, "level")?.value).toBe(42.5);
    applyRemoteEvent({ op: "clear", ids: [3] });
    expect(messageByName(useRemoteSession.getState().messages, "level")).toBeUndefined();
    expect(messageByName(useRemoteSession.getState().messages, "lamp")?.value).toBe(false);
    applyRemoteEvent({ op: "clear", ids: [] });
    expect(useRemoteSession.getState().messages).toEqual({});
  });

  it("moves a control the program set (same id space as messages)", async () => {
    const { useApp } = await import("../src/state/store");
    const { applyRemoteEvent, startRemoteSession, useRemoteSession } = await import("../src/remote/session");
    const l = layout("slider", "display");
    const device = {
      supportsRemote: true,
      remoteClear: async () => {},
      remoteDefine: async () => {},
      remoteSet: async () => {},
    };
    const prev = useApp.getState();
    useApp.setState({
      device: device as never,
      mfp: { ...prev.mfp, files: [{ id: "r", name: DEFAULT_REMOTE_FILE, content: serializeLayout(l) }] } as never,
    });
    try {
      startRemoteSession();
      useApp.setState({ running: true }); // program seen running → attach
      for (let i = 0; i < 5 && useRemoteSession.getState().phase !== "running"; i++) await new Promise((r) => setTimeout(r, 0));
      expect(useRemoteSession.getState().phase).toBe("running");
      expect(useRemoteSession.getState().values.speed).toBe(0);
      applyRemoteEvent({ op: "define", defs: [{ id: 1, type: RemoteType.Float, name: "value" }] });
      applyRemoteEvent({ op: "set", values: [{ id: 0, value: 55 }, { id: 1, value: 2.5 }] });
      expect(useRemoteSession.getState().values.speed).toBe(55);
      expect(useRemoteSession.getState().messages[1]?.value).toBe(2.5);
    } finally {
      useApp.setState({ running: false, device: null, mfp: prev.mfp });
    }
    expect(useRemoteSession.getState().phase).toBe("idle");
  });
});
