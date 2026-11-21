import { describe, expect, it } from "vitest";
import { reorder } from "../src/state/store/helpers";

const id = (x: string) => x;

describe("tab reorder", () => {
  const tabs = ["a", "b", "c", "d"];

  it("moves a tab before or after a target", () => {
    expect(reorder(tabs, id, "a", "c", false)).toEqual(["b", "a", "c", "d"]);
    expect(reorder(tabs, id, "a", "c", true)).toEqual(["b", "c", "a", "d"]);
    expect(reorder(tabs, id, "d", "a", false)).toEqual(["d", "a", "b", "c"]);
    expect(reorder(tabs, id, "b", "d", true)).toEqual(["a", "c", "d", "b"]);
  });

  it("returns the same list when nothing changes", () => {
    expect(reorder(tabs, id, "b", "b", true)).toBe(tabs);
    expect(reorder(tabs, id, "a", "b", false)).toBe(tabs);
    expect(reorder(tabs, id, "b", "a", true)).toBe(tabs);
    expect(reorder(tabs, id, "x", "a", false)).toBe(tabs);
    expect(reorder(tabs, id, "a", "x", false)).toBe(tabs);
  });

  it("works on object lists", () => {
    const objs = [{ id: "a" }, { id: "b" }];
    expect(reorder(objs, (o) => o.id, "a", "b", true).map((o) => o.id)).toEqual(["b", "a"]);
  });
});
