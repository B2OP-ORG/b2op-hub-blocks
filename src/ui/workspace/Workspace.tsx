import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useApp } from "../../state/store";
import { languageForFile } from "../../project/format";
import { ReplPanel, ConsoleHeaderActions } from "../console/ReplPanel";
import { Drawer, DRAWER_HANDLE } from "./Drawer";
import { usePalette } from "../theme";
import { isRemoteFile } from "../../remote/layout";
import { isSceneFile } from "../../scene/project";
import { projectFileUri } from "../../lsp/projectFiles";
import { setEditorArea } from "../../run/autoReload";
import { NoFileOpen } from "./NoFileOpen";
import { PythonPanel } from "./PythonPanel";
import { PY_SEPARATOR } from "./pythonPanel";

// Heavy editors (Blockly, Monaco + LSP) are split into their own chunks.
const BlocklyView = lazy(() => import("../editor/BlocklyView").then((m) => ({ default: m.BlocklyView })));
const MonacoView = lazy(() => import("../editor/MonacoView").then((m) => ({ default: m.MonacoView })));
const ExtraTabView = lazy(() => import("./ExtraTabView").then((m) => ({ default: m.ExtraTabView })));
const RemoteView = lazy(() => import("../remote/RemoteView").then((m) => ({ default: m.RemoteView })));
const ImageView = lazy(() => import("../image/ImageView").then((m) => ({ default: m.ImageView })));
const SceneView = lazy(() => import("../scene/SceneView").then((m) => ({ default: m.SceneView })));

export function Workspace() {
  const p = usePalette();
  const project = useApp((s) => s.project);
  const setBlocksContent = useApp((s) => s.setBlocksContent);
  const updateFile = useApp((s) => s.updateFile);
  const activeFileId = useApp((s) => s.activeFileId);
  const activeFile = useApp((s) => s.mfp.files.find((f) => f.id === s.activeFileId));
  const editorSettings = useApp((s) => s.editorSettings);
  const extraTab = useApp((s) => (s.activeExtraTab ? s.extraTabs.find((t) => t.id === s.activeExtraTab) : undefined));
  const pyPanel = useApp((s) => s.pyPanel);
  const pySize = pyPanel.open ? pyPanel.width : 0;
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

  // Blockly recomputes layout on window resize when drawers change.
  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(id);
  }, [pySize, conSize, project.type]);

  // The file's real project path, so imports of other project files
  // (`import menu`) resolve next to it (see attachProjectFiles).
  const lspUri = activeFile ? projectFileUri(activeFile.name) : `file:///workspace/${activeFileId}.py`;
  const bottomRow = conSize + DRAWER_HANDLE;

  const consoleDrawer = (
    <Drawer side="bottom" label="Console" storageKey="drawer.console" defaultSize={200} dark={p.dark} onSizeChange={setConSize} headerActions={<ConsoleHeaderActions />}>
      <ReplPanel />
    </Drawer>
  );

  let editor: React.ReactNode;
  let columns = "1fr";
  if (extraTab) {
    editor = <Suspense fallback={null}><ExtraTabView tab={extraTab} /></Suspense>;
  } else if (!activeFile) {
    editor = <NoFileOpen />;
  } else if (activeFile.asset) {
    editor = <Suspense fallback={null}><ImageView key={activeFile.id} file={activeFile} /></Suspense>;
  } else if (isRemoteFile(activeFile.name)) {
    editor = <Suspense fallback={null}><RemoteView file={activeFile} /></Suspense>;
  } else if (isSceneFile(activeFile)) {
    columns = `1fr ${pySize + PY_SEPARATOR}px`;
    editor = <Suspense fallback={null}><SceneView file={activeFile} /></Suspense>;
  } else if (project.type === "blocks") {
    columns = `1fr ${pySize + PY_SEPARATOR}px`;
    editor = (
      <Suspense fallback={null}>
        <BlocklyView
          initialState={project.workspace}
          showAdvanced={editorSettings.showAdvanced}
          toolboxBlockScale={editorSettings.toolboxBlockScale}
          onChange={onBlockChange}
        />
      </Suspense>
    );
  } else {
    editor = (
      <Suspense fallback={null}>
        <MonacoView
          value={project.source}
          language={languageForFile(activeFile.name)}
          onChange={onPythonChange}
          lspUri={languageForFile(activeFile.name) === "python" ? lspUri : undefined}
        />
      </Suspense>
    );
  }

  const isScene = !extraTab && !!activeFile && isSceneFile(activeFile);
  const isBlocks = !extraTab && !!activeFile && !isRemoteFile(activeFile.name) && !isScene && project.type === "blocks";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: columns,
        gridTemplateRows: `1fr ${bottomRow}px`,
        height: "100%",
        background: p.panelAltBg,
      }}
    >
      <div ref={setEditorArea} style={{ background: isBlocks ? "#ffffff" : p.surface, overflow: "hidden", minWidth: 0, minHeight: 0 }}>
        {editor}
      </div>
      {(isBlocks || isScene) && activeFile && (
        <div style={{ gridRow: "1 / span 2", gridColumn: 2, minWidth: 0, minHeight: 0 }}>
          {/* Shows the whole file as stored/uploaded: blocks/scene header line + generated Python. */}
          <PythonPanel>
            <Suspense fallback={null}>
              <MonacoView value={activeFile.content} readOnly lspUri={lspUri} />
            </Suspense>
          </PythonPanel>
        </div>
      )}
      <div style={{ gridRow: 2, gridColumn: 1, minWidth: 0, minHeight: 0 }}>
        {consoleDrawer}
      </div>
    </div>
  );
}
