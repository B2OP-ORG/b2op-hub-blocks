import { describe, expect, it } from "vitest";
import {
  DEFAULT_PANEL_LAYOUT, moveTool, normalizePanelLayout, panelSides, parsePanelLayout, serializePanelLayout, toggleStacked,
} from "../src/settings/panelLayout";

const move = (s: string, tool: "outline" | "properties" | "palette", dir: -1 | 1) => serializePanelLayout(moveTool(parsePanelLayout(s), tool, dir));
const toggle = (s: string, i: number) => serializePanelLayout(toggleStacked(parsePanelLayout(s), i));

describe("panel layout", () => {
  it("round-trips valid layouts and rejects invalid ones", () => {
    expect(normalizePanelLayout("outline|properties|canvas|palette")).toBe("outline|properties|canvas|palette");
    expect(normalizePanelLayout("outline-properties-palette|canvas")).toBe("outline-properties-palette|canvas");
    for (const bad of ["", "canvas", "palette|canvas|outline", "palette|canvas|outline-outline", "palette-canvas|outline-properties", "x|canvas|outline-properties", 42]) {
      expect(normalizePanelLayout(bad)).toBe(DEFAULT_PANEL_LAYOUT);
    }
  });

  it("splits into sides and drops tools the editor lacks", () => {
    expect(panelSides(parsePanelLayout("palette|canvas|outline-properties"), ["outline", "properties", "palette"]))
      .toEqual({ left: [["palette"]], right: [["outline", "properties"]] });
    expect(panelSides(parsePanelLayout("outline|properties|canvas|palette"), ["properties", "palette"]))
      .toEqual({ left: [["properties"]], right: [["palette"]] });
  });

  it("moves tools within a stack and across the canvas", () => {
    expect(move("palette|canvas|outline-properties", "properties", -1)).toBe("palette|canvas|properties-outline");
    expect(move("palette|canvas|outline-properties", "outline", -1)).toBe("palette|outline|canvas|properties");
    expect(move("palette|canvas|outline-properties", "palette", -1)).toBe("palette|canvas|outline-properties");
    expect(move("palette|canvas|outline-properties", "properties", 1)).toBe("palette|canvas|outline-properties");
  });

  it("stacks and splits neighbouring tools", () => {
    expect(toggle("palette|canvas|outline-properties", 3)).toBe("palette|canvas|outline|properties");
    expect(toggle("palette|canvas|outline|properties", 3)).toBe("palette|canvas|outline-properties");
    // Never stacks with the canvas.
    expect(toggle("palette|canvas|outline-properties", 2)).toBe("palette|canvas|outline-properties");
  });
});
