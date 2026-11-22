import { afterEach, describe, expect, it, vi } from "vitest";
import { recordSceneEdit, redoScene, undoScene } from "../src/ui/scene/sceneHistory";

const snap = (content: string, selected: string | null = null) => ({ content, selected });
let n = 0;
const freshId = () => `file${++n}`;

describe("scene history", () => {
  afterEach(() => vi.useRealTimers());

  it("undoes and redoes in order", () => {
    const id = freshId();
    recordSceneEdit(id, snap("a"));
    recordSceneEdit(id, snap("b", "w1"));
    expect(undoScene(id, snap("c"))).toEqual(snap("b", "w1"));
    expect(undoScene(id, snap("b"))).toEqual(snap("a"));
    expect(undoScene(id, snap("a"))).toBeNull();
    expect(redoScene(id, snap("a"))).toEqual(snap("b"));
    expect(redoScene(id, snap("b"))).toEqual(snap("c"));
    expect(redoScene(id, snap("c"))).toBeNull();
  });

  it("a new edit drops the redo steps", () => {
    const id = freshId();
    recordSceneEdit(id, snap("a"));
    undoScene(id, snap("b"));
    recordSceneEdit(id, snap("a"));
    expect(redoScene(id, snap("x"))).toBeNull();
  });

  it("merges quick edits with the same key only", () => {
    vi.useFakeTimers();
    const id = freshId();
    recordSceneEdit(id, snap("a"), "w1:x,y");
    vi.advanceTimersByTime(200);
    recordSceneEdit(id, snap("b"), "w1:x,y");
    recordSceneEdit(id, snap("c"), "w1:color");
    vi.advanceTimersByTime(2000);
    recordSceneEdit(id, snap("d"), "w1:color");
    expect(undoScene(id, snap("e"))?.content).toBe("d");
    expect(undoScene(id, snap("d"))?.content).toBe("c");
    expect(undoScene(id, snap("c"))?.content).toBe("a");
    expect(undoScene(id, snap("a"))).toBeNull();
  });

  it("keeps one history per file", () => {
    const a = freshId(), b = freshId();
    recordSceneEdit(a, snap("a0"));
    expect(undoScene(b, snap("b1"))).toBeNull();
    expect(undoScene(a, snap("a1"))?.content).toBe("a0");
  });
});
