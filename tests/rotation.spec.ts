import { describe, expect, it } from "vitest";
import { distToBox, keepTopLeft, normAngle, rotateVec, rotatedBounds } from "../src/geometry/rotation";
import { dragAngle } from "../src/ui/hooks/rotateDrag";
import { DEFAULT_ROTATE_SNAP, mergeEditorSettings } from "../src/settings/editorSettings";
import { emptyScene, makeWidget } from "../src/scene/model";
import { clampedPos, isOutside, rotateLine, widgetAngle } from "../src/scene/geometry";
import { sceneToPython } from "../src/scene/codegen";

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe("rotation maths", () => {
  it("normalizes angles", () => {
    expect(normAngle(-90)).toBe(270);
    expect(normAngle(360)).toBe(0);
    expect(normAngle(725)).toBe(5);
  });

  it("rotates clockwise in screen coordinates", () => {
    const [x, y] = rotateVec(1, 0, 90);
    close(x, 0); close(y, 1);
  });

  it("bounds a rotated box around its centre", () => {
    const b = rotatedBounds({ x: 0, y: 0, w: 40, h: 20, angle: 90 });
    close(b.x, 10); close(b.y, -10); close(b.w, 20); close(b.h, 40);
  });

  it("keeps the rotated top-left corner in place when resizing", () => {
    const corner = (x: number, y: number, w: number, h: number, a: number) => {
      const [rx, ry] = rotateVec(-w / 2, -h / 2, a);
      return [x + w / 2 + rx, y + h / 2 + ry];
    };
    const before = corner(10, 20, 40, 30, 37);
    const p = keepTopLeft(10, 20, 40, 30, 70, 50, 37);
    const after = corner(p.x, p.y, 70, 50, 37);
    close(after[0], before[0]); close(after[1], before[1]);
  });

  it("measures distance from a box edge", () => {
    expect(distToBox(0, 0, 10, 10)).toBe(0);
    expect(distToBox(8, 0, 10, 10)).toBe(3);
  });

  it("snaps to big steps near the widget, small steps far away", () => {
    const snap = DEFAULT_ROTATE_SNAP;
    // Handle at the top-right corner of a 100x100 box; turn the pointer by ~20°.
    const pivot = { x: 50, y: -50 };
    const turn = (deg: number, r: number) => {
      const [x, y] = rotateVec(pivot.x, pivot.y, deg);
      const k = r / Math.hypot(x, y);
      return { dx: x * k - pivot.x, dy: y * k - pivot.y };
    };
    const near = turn(20, Math.hypot(50, 50));
    expect(dragAngle({ a0: 0, pivot, ...near, w: 100, h: 100, scale: 1, snap })).toBe(30);
    const far = turn(22, 400);
    expect(dragAngle({ a0: 0, pivot, ...far, w: 100, h: 100, scale: 1, snap })).toBe(20);
  });

  it("merges stored rotate snap settings over the defaults", () => {
    expect(mergeEditorSettings({ rotateSnap: { near: 45 } }).rotateSnap).toEqual({ ...DEFAULT_ROTATE_SNAP, near: 45 });
  });
});

describe("scene rotation", () => {
  it("rotates lines by turning their points", () => {
    const doc = emptyScene();
    const line = { ...makeWidget("line", 10, 10, doc), points: [[0, 0], [20, 0]] as [number, number][] };
    const r = rotateLine(line, 90);
    expect(r.points).toEqual([[0, 0], [0, 20]]);
    expect([r.x, r.y]).toEqual([20, 0]);
    expect(widgetAngle({ kind: "line", angle: 45 })).toBe(0);
  });

  it("uses the rotated box for the outside check and clamping", () => {
    const doc = emptyScene();
    const w = { ...makeWidget("panel", 0, 0, doc), w: 100, h: 10, angle: 90 };
    // Rotated, it covers x 45..55, y -45..55: partly visible, clamped down by 45.
    expect(isOutside(doc, w)).toBe(false);
    expect(clampedPos(doc, w)).toEqual({ x: 0, y: 45 });
  });

  it("emits LVGL rotation around the centre", () => {
    const doc = emptyScene();
    doc.widgets.push({ ...makeWidget("label", 5, 5, doc), angle: 45 });
    const py = sceneToPython(doc, "s");
    expect(py).toContain("set_style_transform_pivot_x(lv.pct(50), 0)");
    expect(py).toContain("set_style_transform_rotation(450, 0)");
  });

  it("emits no rotation for unrotated widgets", () => {
    const doc = emptyScene();
    doc.widgets.push(makeWidget("label", 5, 5, doc));
    expect(sceneToPython(doc, "s")).not.toContain("transform_rotation");
  });

  it("rotates a stretched arc around its box centre", () => {
    const doc = emptyScene();
    doc.widgets.push({ ...makeWidget("arcline", 10, 20, doc), w: 60, h: 40, angle: 90 });
    const py = sceneToPython(doc, "s");
    // 40px square arc scaled to 60x40: moved by (10, 0), pivot at the square's centre.
    expect(py).toMatch(/set_pos\(20, 20\)/);
    expect(py).toContain("set_style_transform_pivot_x(20, 0)");
    expect(py).toContain("set_style_transform_rotation(900, 0)");
  });

  it("rotates a cropped arc's clip container about the arc centre", () => {
    const doc = emptyScene();
    const name = makeWidget("arc", 0, 0, doc).name;
    doc.widgets.push({ ...makeWidget("arc", 0, 0, doc), w: 60, h: 60, crop: { x: 10, y: 0, w: 50, h: 30 }, angle: 30 });
    const py = sceneToPython(doc, "s");
    expect(py).toContain(`${name}_clip.set_style_transform_pivot_x(20, 0)`);
    expect(py).toContain(`${name}_clip.set_style_transform_pivot_y(30, 0)`);
    expect(py).toContain(`${name}_clip.set_style_transform_rotation(300, 0)`);
  });
});
