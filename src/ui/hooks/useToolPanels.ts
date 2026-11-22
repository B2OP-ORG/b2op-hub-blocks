// Layout + open state of the scene / remote editors' tool panels
// (rendered by components/ToolPanels.tsx).

import { useMemo } from "react";
import { useApp } from "../../state/store";
import { PANEL_TOOL_LABEL, panelSides, parsePanelLayout, type PanelTool } from "../../settings/panelLayout";
import { useSidePanels } from "./useSidePanels";

/** Content width before a column scrolls sideways, and default column width. */
const TOOL_SIZE: Record<PanelTool, { min: number; width: number }> = {
  outline: { min: 160, width: 220 },
  properties: { min: 180, width: 260 },
  palette: { min: 140, width: 200 },
};

export type Side = "left" | "right";

export const columnId = (tools: PanelTool[]) => tools.join("-");
export const columnWidth = (tools: PanelTool[]) => Math.max(...tools.map((t) => TOOL_SIZE[t].width));
export const columnMin = (tools: PanelTool[]) => Math.max(...tools.map((t) => TOOL_SIZE[t].min));

/**
 * Layout + open state of an editor's tool panels. `tools` = the tools this
 * editor has (must be a stable array); the rest of the layout is ignored.
 */
export function useToolPanels(editor: "scene" | "remote", tools: readonly PanelTool[]) {
  const layoutStr = useApp((s) => s.editorSettings.panelLayout);
  const sides = useMemo(() => panelSides(parsePanelLayout(layoutStr), tools), [layoutStr, tools]);
  const panels = useSidePanels(`b2op.${editor}Panels`);
  const columns = (side: Side) => sides[side].map((t) => ({ id: columnId(t), defaultWidth: columnWidth(t) }));
  const isOpen = (side: Side) => columns(side).some((c) => panels.panel(c.id, c.defaultWidth).open);

  return {
    editor,
    sides,
    panels,
    /** The side has any column (else its toolbar toggle is hidden). */
    has: (side: Side) => sides[side].length > 0,
    isOpen,
    /** Toolbar toggle: close every column of the side if any is open, else open them all. */
    toggle: (side: Side) => panels.setOpenAll(columns(side), !isOpen(side)),
    /** Title for a side's toolbar toggle, naming its tools. */
    toggleTitle: (side: Side) => `Show / hide ${sides[side].flat().map((t) => PANEL_TOOL_LABEL[t].toLowerCase()).join(", ")}`,
  };
}

export type ToolPanels = ReturnType<typeof useToolPanels>;
