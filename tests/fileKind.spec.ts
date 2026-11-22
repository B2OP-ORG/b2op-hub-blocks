import { describe, expect, it } from "vitest";
import { fileKindByName, fileKindOf } from "../src/ui/sidebar/fileKind";
import type { ProjectFile } from "../src/project/format";

const label = (name: string) => fileKindByName(name).label;

describe("fileKindByName", () => {
  it("resolves editor file types", () => {
    expect(label("main.py")).toBe("Python");
    expect(label("/sd/lib/util.PYI")).toBe("Python");
    expect(label("pad.remote")).toBe("Remote layout");
    expect(label("logo.PNG")).toBe("Image");
  });

  it("resolves types the editor can't open", () => {
    expect(label("lib.mpy")).toBe("Compiled Python");
    expect(label("settings.json")).toBe("JSON");
    expect(label("beep.wav")).toBe("Audio");
    expect(label("firmware.bin")).toBe("Binary");
    expect(label("backup.tar.gz")).toBe("Archive");
    expect(label("font.bdf")).toBe("Font");
  });

  it("falls back to a generic file", () => {
    expect(label("README")).toBe("File");
    expect(label(".hidden")).toBe("File");
    expect(label("thing.xyz")).toBe("File");
  });
});

describe("fileKindOf", () => {
  const file = (name: string, content = "", extra: Partial<ProjectFile> = {}) => ({ id: "x", name, content, ...extra }) as ProjectFile;

  it("tells blocks from plain Python", () => {
    expect(fileKindOf(file("a.py", "print(1)")).label).toBe("Python");
    expect(fileKindOf(file("a.py", "", { mode: "blocks" })).label).toBe("Blocks");
  });

  it("treats assets as images and others by name", () => {
    expect(fileKindOf(file("a.png", "", { asset: { hash: "h" } as ProjectFile["asset"] })).label).toBe("Image");
    expect(fileKindOf(file("notes.txt")).label).toBe("Text");
  });
});
