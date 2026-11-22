import { describe, expect, it } from "vitest";
import { emptyScene, makeWidget, type SceneDoc } from "../src/scene/model";
import { canDrop, moveWidget } from "../src/scene/reorder";

/** a, b on the screen; panel p at (40, 30) holding c at (5, 6). */
function scene(): SceneDoc {
  const doc = emptyScene();
  const add = (kind: Parameters<typeof makeWidget>[0], x: number, y: number, parent?: string) => {
    const w = makeWidget(kind, x, y, doc, parent);
    doc.widgets.push(w);
    return w;
  };
  const a = add("label", 1, 2); a.uid = "a";
  const b = add("label", 3, 4); b.uid = "b";
  const p = add("panel", 40, 30); p.uid = "p"; p.w = 80; p.h = 60;
  const c = add("label", 5, 6, "p"); c.uid = "c";
  return doc;
}
const order = (d: SceneDoc | null) => d?.widgets.map((w) => w.uid).join("");

describe("scene outline reorder", () => {
  it("reorders siblings", () => {
    expect(order(moveWidget(scene(), "b", { at: "before", uid: "a" }))).toBe("bapc");
    expect(order(moveWidget(scene(), "a", { at: "after", uid: "p" }))).toBe("bpac");
    expect(moveWidget(scene(), "a", { at: "before", uid: "b" })).toBeNull();
  });

  it("moves into a container keeping the screen position", () => {
    const d = moveWidget(scene(), "b", { at: "into", parent: "p" })!;
    const b = d.widgets.find((w) => w.uid === "b")!;
    expect(b.parent).toBe("p");
    // Was at (3, 4) on screen; the panel starts at (40, 30) → clamped into it.
    expect([b.x, b.y]).toEqual([0, 0]);
    expect(order(d)).toBe("apcb");
  });

  it("moves out of a container", () => {
    const d = moveWidget(scene(), "c", { at: "before", uid: "a" })!;
    const c = d.widgets.find((w) => w.uid === "c")!;
    expect(c.parent).toBeUndefined();
    expect([c.x, c.y]).toEqual([45, 36]);
    expect(order(d)).toBe("cabp");
  });

  it("refuses drops into itself or its children", () => {
    const d = scene();
    expect(canDrop(d, "p", { at: "into", parent: "p" })).toBe(false);
    expect(canDrop(d, "p", { at: "before", uid: "c" })).toBe(false);
    expect(canDrop(d, "a", { at: "into", parent: "b" })).toBe(false); // not a container
    expect(canDrop(d, "c", { at: "into", parent: undefined })).toBe(true);
  });
});
