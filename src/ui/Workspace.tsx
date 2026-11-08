import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useApp } from "../state/store";
import { ReplPanel } from "./ReplPanel";
import { DevicePanel } from "./DevicePanel";
import { Drawer, DRAWER_HANDLE } from "./Drawer";

// Heavy editors (Blockly, Monaco + LSP) are split into their own chunks.
const BlocklyView = lazy(() => import("./BlocklyView").then((m) => ({ default: m.BlocklyView })));
const MonacoView = lazy(() => import("../editor/MonacoView").then((m) => ({ default: m.MonacoView })));

export function Workspace() {
  const { project, pythonPreview } = useApp();
  const setBlocksContent = useApp((s) => s.setBlocksContent);
  const updateFile = useApp((s) => s.updateFile);
  const activeFileId = useApp((s) => s.activeFileId);
  const editorSettings = useApp((s) => s.editorSettings);
  const devicePanelOpen = useApp((s) => s.devicePanelOpen);
  const [pySize, setPySize] = useState(0);
  const [conSize, setConSize] = useState(0);

  const onBlockChange = useCallback(
    (state: unknown, python: string) => {
      setBlocksContent(state, python);
    },
    [setBlocksContent],
  );

  const onPythonChange = useCallback(
    (source: string) => {
      updateFile(activeFileId, source);
    },
    [updateFile, activeFileId],
  );

  // Blockly + Monaco recompute layout on window resize when drawers change.
  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(id);
  }, [pySize, conSize, project.type, devicePanelOpen]);

  // LSP URI is stable per file (uses file ID, not filename).
  const lspUri = `file:///workspace/${activeFileId}.py`;

  if (project.type === "blocks") {
    const rightCol = pySize + DRAWER_HANDLE;
    const bottomRow = conSize + DRAWER_HANDLE;
    return (
      <div style={{ display: "flex", height: "100%" }}>
        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `1fr ${rightCol}px`,
              gridTemplateRows: `1fr ${bottomRow}px`,
              height: "100%",
              background: "#e0eff4",
            }}
          >
            <div style={{ background: "#ffffff", overflow: "hidden", minWidth: 0, minHeight: 0 }}>
              <Suspense fallback={null}>
                <BlocklyView
                  initialState={project.workspace}
                  showAdvanced={editorSettings.showAdvanced}
                  toolboxBlockScale={editorSettings.toolboxBlockScale}
                  onChange={onBlockChange}
                />
              </Suspense>
            </div>
            <div style={{ gridRow: "1 / span 2", gridColumn: 2, minWidth: 0, minHeight: 0 }}>
              <Drawer side="right" label="Python" storageKey="drawer.python" defaultSize={360} onSizeChange={setPySize}>
                <Suspense fallback={null}>
                  <MonacoView value={pythonPreview} readOnly />
                </Suspense>
              </Drawer>
            </div>
            <div style={{ gridRow: 2, gridColumn: 1, minWidth: 0, minHeight: 0 }}>
              <Drawer side="bottom" label="Console" storageKey="drawer.console" defaultSize={200} onSizeChange={setConSize}>
                <ReplPanel />
              </Drawer>
            </div>
          </div>
        </div>
        <div style={{ flexShrink: 0, width: devicePanelOpen ? 300 : 0, overflow: "hidden", transition: "width 0.25s ease" }}>
          <DevicePanel />
        </div>
      </div>
    );
  }

  const bottomRow = conSize + DRAWER_HANDLE;
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <div
          style={{
            display: "grid",
            gridTemplateRows: `1fr ${bottomRow}px`,
            height: "100%",
            background: "#06090b",
          }}
        >
          <div style={{ background: "#0b1216", minWidth: 0, minHeight: 0 }}>
            <Suspense fallback={null}>
              <MonacoView
                value={project.source}
                onChange={onPythonChange}
                lspUri={lspUri}
              />
            </Suspense>
          </div>
          <div style={{ minWidth: 0, minHeight: 0 }}>
            <Drawer side="bottom" label="Console" storageKey="drawer.console" defaultSize={220} dark onSizeChange={setConSize}>
              <ReplPanel />
            </Drawer>
          </div>
        </div>
      </div>
      <div style={{ flexShrink: 0, width: devicePanelOpen ? 300 : 0, overflow: "hidden", transition: "width 0.25s ease" }}>
        <DevicePanel />
      </div>
    </div>
  );
}
