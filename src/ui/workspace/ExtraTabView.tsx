import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft, FilePlus, FolderPlus } from "lucide-react";
import { useApp, type ExtraTab } from "../../state/store";
import { usePalette } from "../theme";
import { Button } from "../components/Button";
import { EXAMPLES, fetchExample } from "../../examples";
import { addExampleToProject, openExampleAsProject } from "../actions";
import { pageContent } from "../../docs/pages";
import { exampleFileUri, setExampleFiles } from "../../lsp/projectFiles";

const DocPage = lazy(() => import("../docs/DocPage").then((m) => ({ default: m.DocPage })));
const MonacoView = lazy(() => import("../editor/MonacoView").then((m) => ({ default: m.MonacoView })));

function DocTabView({ tab }: { tab: ExtraTab }) {
  const p = usePalette();
  // Per-tab back stack; resets when a different tab is shown.
  const [history, setHistory] = useState<string[]>([]);
  useEffect(() => setHistory([]), [tab.id]);
  const navigate = (ref: string) => {
    setHistory((h) => [...h, tab.ref]);
    useApp.getState().updateExtraTab(tab.id, { ref, title: pageContent(ref)?.title ?? tab.title });
  };
  const back = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    useApp.getState().updateExtraTab(tab.id, { ref: prev, title: pageContent(prev)?.title ?? tab.title });
  };
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: p.panelBg }}>
      {history.length > 0 && (
        <div style={{ padding: "4px 12px", borderBottom: `1px solid ${p.border}`, flexShrink: 0 }}>
          <Button size="sm" icon={<ArrowLeft size={13} />} onClick={back}>Back</Button>
        </div>
      )}
      <div data-doc-scroll style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <Suspense fallback={null}>
          <DocPage pageId={tab.ref} onNavigate={navigate} />
        </Suspense>
      </div>
    </div>
  );
}

function ExampleTabView({ tab }: { tab: ExtraTab }) {
  const p = usePalette();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const entry = EXAMPLES.find((e) => e.files.includes(tab.ref));

  useEffect(() => {
    let alive = true;
    setCode(null);
    setError(null);
    fetchExample(tab.ref).then((t) => { if (alive) setCode(t); }).catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [tab.ref]);

  // Give the language server every file of the example, so a folder
  // example's imports of its siblings resolve.
  useEffect(() => {
    if (!entry) return;
    let alive = true;
    Promise.all(entry.files.map(async (f) => [f, await fetchExample(f)] as const))
      .then((files) => { if (alive) setExampleFiles(new Map(files)); })
      .catch(() => { /* the shown file's error is reported above */ });
    return () => { alive = false; setExampleFiles(new Map()); };
  }, [entry]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", borderBottom: `1px solid ${p.border}`, background: p.panelBg, flexWrap: "wrap", flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: p.dimText, flex: 1, minWidth: 120 }}>Example · read-only preview</span>
        {entry && <Button size="sm" icon={<FilePlus size={13} />} onClick={() => addExampleToProject(entry)}>Add to my project</Button>}
        {entry && <Button size="sm" variant="primary" icon={<FolderPlus size={13} />} onClick={() => openExampleAsProject(entry)}>Open as new project</Button>}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {error ? <div style={{ padding: 16, color: p.danger }}>{error}</div>
          : code !== null && (
            <Suspense fallback={null}>
              <MonacoView key={tab.ref} value={code} language="python" readOnly lspUri={exampleFileUri(tab.ref)} />
            </Suspense>
          )}
      </div>
    </div>
  );
}

export function ExtraTabView({ tab }: { tab: ExtraTab }) {
  return tab.kind === "doc" ? <DocTabView tab={tab} /> : <ExampleTabView tab={tab} />;
}
