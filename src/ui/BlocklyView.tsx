import * as Blockly from "blockly/core";
import { useEffect, useRef } from "react";
import { registerAllBlocks } from "../blocks";
import { workspaceToPython } from "../codegen/pythonGen";
import { buildToolbox, remoteFlyout, REMOTE_CATEGORY, REMOTE_CREATE_BUTTON } from "../blocks/toolbox";
import { FieldRemoteName } from "../blocks/defs/remote";
import { createRemoteName, onRemoteSymbolsChange } from "../remote/registry";
import { friendlyTheme } from "./blocklyTheme";
import "./blockly-theme.css";

registerAllBlocks();

interface Props {
  initialState?: unknown;
  showAdvanced: boolean;
  toolboxBlockScale?: number;
  onChange: (state: unknown, python: string) => void;
}

/**
 * Rewrite each toolbox category row to a Scratch-style chip:
 *   colored circle on top, label below. Blockly sets the row's inline
 *   background-color to the category colour; we copy that onto the icon
 *   span and clear the row's own bg so the label sits on a neutral chip.
 */
function styleToolboxCategories(host: HTMLElement) {
  const rows = host.querySelectorAll<HTMLElement>(".blocklyToolboxCategory");
  rows.forEach((row) => {
    // Blockly stores the category colour in borderLeft ("Nx solid <color>")
    // for LTR, borderRight for RTL. Capture once and mirror onto the icon.
    if (!row.dataset.categoryColor) {
      const src = row.style.borderLeftColor || row.style.borderRightColor;
      if (src) row.dataset.categoryColor = src;
    }
    const color = row.dataset.categoryColor;
    if (!color) return;
    const icon = row.querySelector<HTMLElement>(".blocklyToolboxCategoryIcon");
    if (icon && icon.style.backgroundColor !== color) icon.style.backgroundColor = color;
  });
}

function applyFlyoutScale(workspace: Blockly.WorkspaceSvg, scale: number) {
  const flyout = workspace.getFlyout();
  if (!flyout) return;
  // Override the per-instance scale getter so category re-shows respect it.
  (flyout as unknown as { getFlyoutScale: () => number }).getFlyoutScale = () => scale;
  const inner = flyout.getWorkspace();
  inner.setScale(scale);
  try {
    (flyout as unknown as { reflow?: () => void }).reflow?.();
    (flyout as unknown as { position?: () => void }).position?.();
  } catch { /* ignore */ }
}

export function BlocklyView({ initialState, showAdvanced, toolboxBlockScale = 1, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const scaleRef = useRef(toolboxBlockScale);
  scaleRef.current = toolboxBlockScale;

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const workspace = Blockly.inject(host, {
      toolbox: buildToolbox(showAdvanced),
      renderer: "zelos",
      theme: friendlyTheme,
      // Serve Blockly's sprites / sounds / cursors locally (public/media, copied
      // from node_modules/blockly/media). The default points at
      // blockly-demo.appspot.com, which the browser blocks (CORB).
      media: `${import.meta.env.BASE_URL}media/`,
      trashcan: true,
      grid: { spacing: 25, length: 3, colour: "#e2dcce", snap: false },
      zoom: { controls: true, wheel: true, startScale: 0.9, minScale: 0.4, maxScale: 2.0 },
      move: { scrollbars: true, drag: true, wheel: false },
    });
    workspaceRef.current = workspace;
    workspace.registerToolboxCategoryCallback(REMOTE_CATEGORY, () => remoteFlyout() as Blockly.utils.toolbox.FlyoutDefinition);
    workspace.registerButtonCallback(REMOTE_CREATE_BUTTON, () => {
      void createRemoteName().then((sym) => {
        if (!sym) return;
        // The dialog closed the flyout: reopen the Remote category to show the new block.
        const tb = workspace.getToolbox() as Blockly.Toolbox | null;
        const item = tb?.getToolboxItems().find((i) => (i as Blockly.ToolboxCategory).getName?.() === "Remote");
        if (tb && item) tb.setSelectedItem(item);
        else workspace.refreshToolboxSelection();
      });
    });
    if (initialState) {
      try {
        Blockly.serialization.workspaces.load(initialState as object, workspace);
      } catch (e) {
        console.warn("Failed to load workspace state", e);
      }
    }
    const listener = () => {
      const state = Blockly.serialization.workspaces.save(workspace);
      const py = workspaceToPython(workspace);
      onChangeRef.current(state, py);
    };
    workspace.addChangeListener(listener);
    // Fire once for initial preview.
    queueMicrotask(listener);

    // Remote controller names changed (layout edited): relabel / re-warn remote
    // blocks, refresh an open Remote flyout and regenerate (indicator ids / types).
    const offRemote = onRemoteSymbolsChange(() => {
      for (const b of workspace.getAllBlocks(false)) {
        const f = b.getField("NAME");
        if (!(f instanceof FieldRemoteName)) continue;
        f.forceRerender();
        (b as unknown as { onchange?: (e: unknown) => void }).onchange?.call(b, null);
      }
      workspace.refreshToolboxSelection();
      listener();
    });

    // Initial toolbox chip styling + flyout scale.
    const restyle = () => {
      styleToolboxCategories(host);
      applyFlyoutScale(workspace, scaleRef.current);
    };
    queueMicrotask(restyle);

    // Re-apply chip styling if Blockly rewrites tree row bg (e.g. selection).
    const toolboxDiv = host.querySelector<HTMLElement>(".blocklyToolboxDiv");
    const observer = toolboxDiv
      ? new MutationObserver(() => styleToolboxCategories(host))
      : null;
    observer?.observe(toolboxDiv!, { attributes: true, attributeFilter: ["style"], subtree: true, childList: true });

    return () => {
      offRemote();
      observer?.disconnect();
      workspace.removeChangeListener(listener);
      workspace.dispose();
      workspaceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild toolbox when advanced toggle changes; re-apply chip + flyout scale.
  useEffect(() => {
    const ws = workspaceRef.current;
    const host = hostRef.current;
    if (!ws || !host) return;
    ws.updateToolbox(buildToolbox(showAdvanced));
    queueMicrotask(() => {
      // Reset the flag so new rows get chip styling.
      host.querySelectorAll<HTMLElement>(".blocklyToolboxCategory[data-category-color]").forEach((r) => delete r.dataset.categoryColor);
      styleToolboxCategories(host);
      applyFlyoutScale(ws, scaleRef.current);
    });
  }, [showAdvanced]);

  // Apply flyout block scale when setting changes.
  useEffect(() => {
    const ws = workspaceRef.current;
    if (!ws) return;
    applyFlyoutScale(ws, toolboxBlockScale);
  }, [toolboxBlockScale]);

  return <div ref={hostRef} style={{ width: "100%", height: "100%" }} />;
}
