import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useApp } from "../state/store";
import { languageForFile } from "../project/format";
import { ReplPanel, ConsoleHeaderActions } from "./ReplPanel";
import { Drawer, DRAWER_HANDLE } from "./Drawer";
import { usePalette } from "./theme";
import { newFileFlow } from "./actions";

// Heavy editors (Blockly, Monaco + LSP) are split into their own chunks.
const BlocklyView = lazy(() => import("./BlocklyView").then((m) => ({ default: m.BlocklyView })));
const MonacoView = lazy(() => import("../editor/MonacoView").then((m) => ({ default: m.MonacoView })));

function NoFileOpen() {
  const p = usePalette();
  const files = useApp((s) => s.mfp.files);
  const openFile = useApp((s) => s.openFile);
  const main = files.find((f) => f.name === "main.py") ?? files[0];
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: p.dimText, fontSize: 13, textAlign: "center", padding: 20 }}>
      <div>
        <div style={{ marginBottom: 10 }}>No file open.</div>
        {main
          ? <button type="button" onClick={() => openFile(main.id)} style={{ background: p.accent, color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontWeight: 600 }}>Open {main.name}</button>
          : <button type="button" onClick={() => newFileFlow()} style={{ background: p.accent, color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontWeight: 600 }}>New file…</button>}
      </div>
    </div>
  );
}

export function Workspace() {
  const p = usePalette();
  const project = useApp((s) => s.project);
  const setBlocksContent = useApp((s) => s.setBlocksContent);
  const updateFile = useApp((s) => s.updateFile);
  const activeFileId = useApp((s) => s.activeFileId);
  const activeFile = useApp((s) => s.mfp.files.find((f) => f.id === s.activeFileId));
  const editorSettings = useApp((s) => s.editorSettings);
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

  // Blockly recomputes layout on window resize when drawers change.
  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(id);
  }, [pySize, conSize, project.type]);

  // LSP URI is stable per file (uses file ID, not filename).
  const lspUri = `file:///workspace/${activeFileId}.py`;
  const bottomRow = conSize + DRAWER_HANDLE;

  const consoleDrawer = (
    <Drawer side="bottom" label="Console" storageKey="drawer.console" defaultSize={200} dark={p.dark} onSizeChange={setConSize} headerActions={<ConsoleHeaderActions />}>
      <ReplPanel />
    </Drawer>
  );

  let editor: React.ReactNode;
  let columns = "1fr";
  if (!activeFile) {
    editor = <NoFileOpen />;
  } else if (project.type === "blocks") {
    columns = `1fr ${pySize + DRAWER_HANDLE}px`;
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

  const isBlocks = !!activeFile && project.type === "blocks";

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
      <div style={{ background: isBlocks ? "#ffffff" : p.surface, overflow: "hidden", minWidth: 0, minHeight: 0 }}>
        {editor}
      </div>
      {isBlocks && (
        <div style={{ gridRow: "1 / span 2", gridColumn: 2, minWidth: 0, minHeight: 0 }}>
          {/* Shows the whole file as stored/uploaded: blocks header line + generated Python. */}
          <Drawer side="right" label="Python" storageKey="drawer.python" defaultSize={360} dark={p.dark} onSizeChange={setPySize}>
            <Suspense fallback={null}>
              <MonacoView value={activeFile.content} readOnly />
            </Suspense>
          </Drawer>
        </div>
      )}
      <div style={{ gridRow: 2, gridColumn: 1, minWidth: 0, minHeight: 0 }}>
        {consoleDrawer}
      </div>
    </div>
  );
}
