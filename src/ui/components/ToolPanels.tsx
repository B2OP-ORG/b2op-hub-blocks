// Tool panels (outline / properties / palette) of the scene and remote editors,
// arranged around the canvas as set in Settings › Scene & remote
// (settings/panelLayout.ts). Each column is a resizable, closeable SidePanel;
// tools stacked in one column get draggable splits between them.

import type { PanelTool } from "../../settings/panelLayout";
import { columnId, columnMin, columnWidth, type Side, type ToolPanels } from "../hooks/useToolPanels";
import { PaletteHint, PalettePanel } from "./PaletteGroup";
import { SidePanel } from "./SidePanel";
import { SplitPane } from "./SplitPane";

/** Content of each tool; null = nothing in this mode (e.g. properties in preview). */
export type ToolNodes = Partial<Record<PanelTool, React.ReactNode | null>>;

/** The columns of one side of the canvas, in screen order. */
export function ToolColumns({ tp, side, nodes, emptyHint = "" }: {
  tp: ToolPanels;
  side: Side;
  nodes: ToolNodes;
  /** Shown in a column whose tools all have nothing to show. */
  emptyHint?: string;
}) {
  return (
    <>
      {tp.sides[side].map((tools) => {
        const id = columnId(tools);
        const shown = tools.filter((t) => nodes[t] != null);
        return (
          <SidePanel key={id} side={side} state={tp.panels.panel(id, columnWidth(tools))} contentMinWidth={columnMin(tools)}>
            {shown.length === 0
              ? <PalettePanel><PaletteHint>{emptyHint}</PaletteHint></PalettePanel>
              : <Stack nodes={shown.map((t) => nodes[t])} storageKey={`b2op.${tp.editor}Panels.split.${id}`} />}
          </SidePanel>
        );
      })}
    </>
  );
}

/** Items top → bottom with a draggable split between each pair. */
function Stack({ nodes, storageKey }: { nodes: React.ReactNode[]; storageKey: string }) {
  if (nodes.length === 1) return <>{nodes[0]}</>;
  return (
    <SplitPane storageKey={storageKey} defaultRatio={1 / nodes.length}
      top={nodes[0]} bottom={<Stack nodes={nodes.slice(1)} storageKey={`${storageKey}.1`} />} />
  );
}
