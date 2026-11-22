import { afterEach, describe, expect, it, vi } from "vitest";
import { recordEdit, redoEdit, undoEdit } from "../src/ui/editHistory";

const snap = (content: string, selected: string | null = null) => ({ content, selected });
let n = 0;
const freshId = () => `file${++n}`;

describe("edit history", () => {
  afterEach(() => vi.useRealTimers());

  it("undoes and redoes in order", () => {
    const id = freshId();
    recordEdit(id, snap("a"));
    recordEdit(id, snap("b", "w1"));
    expect(undoEdit(id, snap("c"))).toEqual(snap("b", "w1"));
    expect(undoEdit(id, snap("b"))).toEqual(snap("a"));
    expect(undoEdit(id, snap("a"))).toBeNull();
    expect(redoEdit(id, snap("a"))).toEqual(snap("b"));
    expect(redoEdit(id, snap("b"))).toEqual(snap("c"));
    expect(redoEdit(id, snap("c"))).toBeNull();
  });

  it("a new edit drops the redo steps", () => {
    const id = freshId();
    recordEdit(id, snap("a"));
    undoEdit(id, snap("b"));
    recordEdit(id, snap("a"));
    expect(redoEdit(id, snap("x"))).toBeNull();
  });

  it("merges quick edits with the same key only", () => {
    vi.useFakeTimers();
    const id = freshId();
    recordEdit(id, snap("a"), "w1:x,y");
    vi.advanceTimersByTime(200);
    recordEdit(id, snap("b"), "w1:x,y");
    recordEdit(id, snap("c"), "w1:color");
    vi.advanceTimersByTime(2000);
    recordEdit(id, snap("d"), "w1:color");
    expect(undoEdit(id, snap("e"))?.content).toBe("d");
    expect(undoEdit(id, snap("d"))?.content).toBe("c");
    expect(undoEdit(id, snap("c"))?.content).toBe("a");
    expect(undoEdit(id, snap("a"))).toBeNull();
  });

  it("keeps one history per file", () => {
    const a = freshId(), b = freshId();
    recordEdit(a, snap("a0"));
    expect(undoEdit(b, snap("b1"))).toBeNull();
    expect(undoEdit(a, snap("a1"))?.content).toBe("a0");
  });
});
