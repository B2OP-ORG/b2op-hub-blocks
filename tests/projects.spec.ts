import { beforeEach, describe, expect, it } from "vitest";
import {
  splitBlocksHeader, withBlocksHeader, stripBlocksHeader, fileMode, hashContent, normalizeProject,
  newMultiFileProject, mergeEditorSettings, DEFAULT_MONACO_SETTINGS,
} from "../src/project/format";
import { DEFAULT_EDITOR_SETTINGS } from "../src/project/format";
import { pythonToBlocks } from "../src/project/pythonToBlocks";
import { normalizeRelPath, uniqueName, ancestorDirs } from "../src/project/paths";
import { loadWorkspace, saveProject, loadProject } from "../src/project/storage";
import { projectToZip, zipToProject } from "../src/project/zip";
import { zipSync, strToU8 } from "fflate";
import { MockTransport } from "../src/transport/mock";
import { DeviceClient } from "../src/device/deviceClient";
import { useApp } from "../src/state/store";
import { changedFiles, devicePathFor, ensureDirs, projectRoot, syncProject } from "../src/project/deviceSync";

describe("blocks header", () => {
  const ws = { blocks: { languageVersion: 0, blocks: [{ type: "when_program_starts", x: 1, y: 2 }] } };

  it("round-trips workspace and body", () => {
    const content = withBlocksHeader(ws, "print(1)\n");
    expect(content.split("\n")[0]).toBe("# __blocks__: " + JSON.stringify(ws));
    const s = splitBlocksHeader(content);
    expect(s.workspace).toEqual(ws);
    expect(s.body).toBe("print(1)\n");
    expect(stripBlocksHeader(content)).toBe("print(1)\n");
  });

  it("treats unparsable header as plain content", () => {
    const s = splitBlocksHeader("# __blocks__: {oops\nx = 1");
    expect(s.workspace).toBeNull();
    expect(s.body).toBe("# __blocks__: {oops\nx = 1");
  });

  it("mode defaults from header, explicit mode wins", () => {
    const content = withBlocksHeader(ws, "");
    expect(fileMode({ id: "a", name: "main.py", content })).toBe("blocks");
    expect(fileMode({ id: "a", name: "main.py", content, mode: "python" })).toBe("python");
    expect(fileMode({ id: "a", name: "main.py", content: "x=1" })).toBe("python");
  });

  it("pythonToBlocks ignores the header line", () => {
    const body = "# b2op-hub-blocks v2.0.0\nimport hub\n";
    const withHeader = pythonToBlocks(withBlocksHeader(ws, body));
    const without = pythonToBlocks(body);
    expect(withHeader).toEqual(without);
  });
});

describe("paths", () => {
  it("normalizes relative paths", () => {
    expect(normalizeRelPath("/a//b/./c.py/")).toBe("a/b/c.py");
    expect(normalizeRelPath("a/../b")).toBeNull();
    expect(normalizeRelPath("  ")).toBeNull();
  });
  it("makes unique names before the extension", () => {
    const taken = new Set(["main.py", "main_1.py"]);
    expect(uniqueName("main.py", (c) => taken.has(c))).toBe("main_2.py");
  });
  it("lists ancestor dirs", () => {
    expect(ancestorDirs("a/b/c.py")).toEqual(["a", "a/b"]);
  });
});

describe("settings merge", () => {
  it("fills nested defaults for old stored settings", () => {
    const s = mergeEditorSettings({ showAdvanced: true, monaco: { fontSize: 20 } });
    expect(s.showAdvanced).toBe(true);
    expect(s.darkMode).toBe(DEFAULT_EDITOR_SETTINGS.darkMode);
    expect(s.monaco.fontSize).toBe(20);
    expect(s.monaco.tabSize).toBe(DEFAULT_MONACO_SETTINGS.tabSize);
    expect(s.sidebar.tabOrder).toEqual(["explorer", "projects", "sdcard", "device"]);
  });
});

describe("storage", () => {
  beforeEach(() => localStorage.clear());

  it("migrates the single v3 project into the project index", () => {
    const legacy = {
      format: "b2op-hub-v3",
      version: "3.0.0",
      title: "Old",
      createdAt: "2026-01-01T00:00:00.000Z",
      settings: { liveMode: false },
      files: [{ id: "f1", name: "main.py", content: "print(1)" }, { id: "f2", name: "b.py", content: "" }],
    };
    localStorage.setItem("b2op.project.v3", JSON.stringify(legacy));
    localStorage.setItem("b2op.openFiles", JSON.stringify({ openFileIds: ["f2"], activeFileId: "f2" }));
    const ws = loadWorkspace();
    expect(ws).not.toBeNull();
    expect(ws!.projects).toHaveLength(1);
    expect(ws!.active.title).toBe("Old");
    expect(ws!.active.activeFileId).toBe("f2");
    expect(ws!.active.folders).toEqual([]);
    // Index persisted; legacy key untouched.
    expect(JSON.parse(localStorage.getItem("b2op.projects")!).projects[0].id).toBe(ws!.active.id);
    expect(localStorage.getItem("b2op.project.v3")).not.toBeNull();
    // Second load reads the index, not the legacy key.
    expect(loadWorkspace()!.active.id).toBe(ws!.active.id);
  });

  it("returns null on a fresh install", () => {
    expect(loadWorkspace()).toBeNull();
  });

  it("saves and loads a project by id", () => {
    const p = newMultiFileProject("X", "python");
    saveProject(p);
    expect(loadProject(p.id)?.files[0].name).toBe("main.py");
  });
});

describe("zip", () => {
  it("round-trips files, folders, modes", () => {
    const p = newMultiFileProject("Zippy", "blocks");
    p.files.push({ id: "x", name: "lib/util.py", content: "def f():\n    pass\n", mode: "python" });
    p.folders = ["empty", "lib"];
    const { project, skipped } = zipToProject(projectToZip(p), "fallback");
    expect(skipped).toEqual([]);
    expect(project.title).toBe("Zippy");
    expect(project.files.map((f) => f.name).sort()).toEqual(["lib/util.py", "main.py"]);
    expect(project.files.find((f) => f.name === "main.py")!.mode).toBe("blocks");
    expect(project.folders).toContain("empty");
    expect(project.activeFileId).toBe(project.files.find((f) => f.name === "main.py")!.id);
  });

  it("strips a single top-level folder and skips binary files", () => {
    const data = zipSync({
      "proj/main.py": new Uint8Array(strToU8("print(1)")),
      "proj/img.bin": new Uint8Array([0xff, 0xfe, 0x00, 0x80]),
    });
    const { project, skipped } = zipToProject(data, "Imported");
    expect(project.title).toBe("proj");
    expect(project.files.map((f) => f.name)).toEqual(["main.py"]);
    expect(skipped).toEqual(["img.bin"]);
  });
});

describe("normalizeProject", () => {
  it("rejects unknown formats and fills defaults", () => {
    expect(normalizeProject({ format: "nope" })).toBeNull();
    const p = normalizeProject({ format: "b2op-hub-v3", files: [{ id: "a", name: "main.py", content: "" }] });
    expect(p!.openFileIds).toEqual(["a"]);
    expect(p!.upload).toBeNull();
  });
});

describe("device sync", () => {
  async function connect(opts?: ConstructorParameters<typeof MockTransport>[0]) {
    const transport = new MockTransport(opts);
    const client = new DeviceClient(transport);
    await client.connect();
    useApp.setState({ device: client, deviceName: transport.info.name, connection: "connected" });
    return { transport, client };
  }

  beforeEach(() => {
    localStorage.clear();
    const p = newMultiFileProject("Sync Test", "python");
    p.files[0].content = "print('main')\n";
    p.files.push({ id: "u", name: "lib/util.py", content: "X = 1\n", mode: "python" });
    useApp.setState({ mfp: p, openFileIds: [p.files[0].id], activeFileId: p.files[0].id, projects: [] });
  });

  it("maps project files under /sd/<project>/", () => {
    expect(projectRoot("Sync Test")).toBe("/sd/sync_test");
    expect(devicePathFor("Sync Test", "lib/my file.py")).toBe("/sd/sync_test/lib/my_file.py");
  });

  it("uploads all files first, then only changed ones", async () => {
    const { transport, client } = await connect();
    const id = useApp.getState().mfp.id;
    const r1 = await syncProject(id, { mode: "changed" });
    expect(r1.uploaded).toBe(2);
    expect(new TextDecoder().decode(transport.files["/sd/sync_test/main.py"])).toBe("print('main')\n");
    expect(new TextDecoder().decode(transport.files["/sd/sync_test/lib/util.py"])).toBe("X = 1\n");
    expect(transport.dirs.has("/sd/sync_test/lib")).toBe(true);

    const r2 = await syncProject(id, { mode: "changed" });
    expect(r2.uploaded).toBe(0);

    useApp.getState().updateFile("u", "X = 2\n");
    expect(changedFiles(useApp.getState().getProject(id)!, "MockDevice").map((f) => f.name)).toEqual(["lib/util.py"]);
    const r3 = await syncProject(id, { mode: "changed" });
    expect(r3.uploaded).toBe(1);

    const r4 = await syncProject(id, { mode: "all" });
    expect(r4.uploaded).toBe(2);
    await client.disconnect();
  });

  it("treats every file as changed on a different hub", async () => {
    const { client } = await connect();
    const id = useApp.getState().mfp.id;
    await syncProject(id, { mode: "changed" });
    useApp.setState({ deviceName: "OtherHub" });
    const r = await syncProject(id, { mode: "changed" });
    expect(r.uploaded).toBe(2);
    expect(useApp.getState().mfp.upload?.device).toBe("OtherHub");
    await client.disconnect();
  });

  it("ensureDirs only MKDIRs missing segments and rejects files in the way", async () => {
    const { transport, client } = await connect({ files: { "/sd/a/existing.py": new Uint8Array([0x31]) } });
    await ensureDirs(client, ["/sd/a/b/c"]);
    expect(transport.dirs.has("/sd/a/b")).toBe(true);
    expect(transport.dirs.has("/sd/a/b/c")).toBe(true);
    await expect(ensureDirs(client, ["/sd/a/existing.py/x"])).rejects.toThrow(/is a file/);
    await client.disconnect();
  });
});
