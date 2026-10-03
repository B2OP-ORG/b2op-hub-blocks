import { describe, expect, it } from "vitest";
import boardVersions from "../src/device/boardVersions.json";
import { parseSemver, isNewer, isDevBuild } from "../src/device/fwVersion";

describe("parseSemver", () => {
  it("strips leading v", () => expect(parseSemver("v1.2.3")).toEqual([1, 2, 3]));
  it("works without leading v", () => expect(parseSemver("1.2.3")).toEqual([1, 2, 3]));
  it("defaults missing parts to 0", () => expect(parseSemver("v2")).toEqual([2, 0, 0]));
});

describe("isNewer", () => {
  it("returns true when major is higher",  () => expect(isNewer("v2.0.0", "v1.0.0")).toBe(true));
  it("returns true when minor is higher",  () => expect(isNewer("v1.1.0", "v1.0.0")).toBe(true));
  it("returns true when patch is higher",  () => expect(isNewer("v1.0.1", "v1.0.0")).toBe(true));
  it("returns false when equal",           () => expect(isNewer("v1.0.0", "v1.0.0")).toBe(false));
  it("returns false when latest is older", () => expect(isNewer("v1.0.0", "v1.1.0")).toBe(false));
  it("respects major over minor",          () => expect(isNewer("v1.9.0", "v2.0.0")).toBe(false));
});

describe("isDevBuild", () => {
  it("treats dirty suffix as dev",      () => expect(isDevBuild("v1.1.0-dirty")).toBe(true));
  it("treats git hash suffix as dev",   () => expect(isDevBuild("v1.1.0+abc1234")).toBe(true));
  it("treats clean release as prod",    () => expect(isDevBuild("v1.1.0")).toBe(false));
  it("treats empty string as prod",     () => expect(isDevBuild("")).toBe(false));
});

describe("boardVersions JSON", () => {
  it("has B2OP Hub board entry", () => {
    expect((boardVersions as Record<string, unknown>)["B2OP Hub"]).toBeDefined();
  });

  it("each entry has latestFwVersion and manifestFile", () => {
    type Entry = { latestFwVersion: string; manifestFile: string };
    const board = (boardVersions as Record<string, Record<string, Entry>>)["B2OP Hub"];
    for (const entry of Object.values(board)) {
      expect(entry).toHaveProperty("latestFwVersion");
      expect(entry).toHaveProperty("manifestFile");
      expect(typeof entry.latestFwVersion).toBe("string");
      expect(typeof entry.manifestFile).toBe("string");
    }
  });

  it("latestFwVersion values are valid semver strings", () => {
    type Entry = { latestFwVersion: string };
    const board = (boardVersions as Record<string, Record<string, Entry>>)["B2OP Hub"];
    for (const entry of Object.values(board)) {
      const [major, minor, patch] = parseSemver(entry.latestFwVersion);
      expect(major + minor + patch).toBeGreaterThanOrEqual(0);
    }
  });
});
