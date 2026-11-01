import { useCallback, useEffect, useState } from "react";
import { useApp } from "../state/store";
import { BlocklyView } from "./BlocklyView";
import { MonacoView } from "../editor/MonacoView";
import { ReplPanel } from "./ReplPanel";
import { DevicePanel } from "./DevicePanel";
import { Drawer, DRAWER_HANDLE } from "./Drawer";

export function Workspace() {
  const { project, setProject, setPythonPreview, pythonPreview } = useApp();
  const editorSettings = useApp((s) => s.editorSettings);
  const devicePanelOpen = useApp((s) => s.devicePanelOpen);
  const [pySize, setPySize] = useState(0);
  const [conSize, setConSize] = useState(0);

  const onBlockChange = useCallback(
    (state: unknown, python: string) => {
      setPythonPreview(python);
      const current = useApp.getState().project;
      if (current.type === "blocks") {
        setProject({ ...current, workspace: state });
      }
    },
    [setProject, setPythonPreview],
  );

  const onPythonChange = (source: string) => {
    if (project.type !== "python") return;
    setProject({ ...project, source });
  };

  // Blockly + Monaco recompute layout on window resize; nudge them when
  // drawers open/close so the workspace fills correctly.
  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(id);
  }, [pySize, conSize, project.type, devicePanelOpen]);

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
              <BlocklyView
                initialState={project.workspace}
                showAdvanced={editorSettings.showAdvanced}
                toolboxBlockScale={editorSettings.toolboxBlockScale}
                onChange={onBlockChange}
              />
            </div>
            <div style={{ gridRow: "1 / span 2", gridColumn: 2, minWidth: 0, minHeight: 0 }}>
              <Drawer side="right" label="Python" storageKey="drawer.python" defaultSize={360} onSizeChange={setPySize}>
                <MonacoView value={pythonPreview} readOnly />
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
            <MonacoView value={project.source} onChange={onPythonChange} />
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
