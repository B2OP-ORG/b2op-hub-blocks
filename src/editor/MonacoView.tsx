import { useEffect, useRef, useState } from "react";
import Editor, { loader, type Monaco } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { useLspService } from "./lsp/useLspClient";
import { EDITOR_THEME, ensureShiki } from "./shikiSetup";
import { registerPythonLanguageConfig } from "./pythonLanguage";

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });
registerPythonLanguageConfig(monaco);
// Resolves to the theme to use; falls back to vs-dark if Shiki fails to load.
const themeReady: Promise<string> = ensureShiki(monaco).then(
  () => EDITOR_THEME,
  (err) => {
    console.error("[editor] Shiki highlighting failed to load", err);
    return "vs-dark";
  },
);

function expandSuggestDetails(editor: monaco.editor.IStandaloneCodeEditor): void {
  const controller = editor.getContribution("editor.contrib.suggestController") as unknown as {
    widget?: { value?: { onDidShow?: (cb: () => void) => monaco.IDisposable } };
  } | null;
  let expanded = false;
  const doToggle = () => {
    if (expanded) return;
    expanded = true;
    editor.trigger("lsp", "toggleSuggestionDetails", {});
  };
  const wire = () => {
    const w = controller?.widget?.value;
    if (w?.onDidShow) { w.onDidShow(doToggle); return true; }
    return false;
  };
  if (!wire()) {
    const d = editor.onDidChangeModelContent(() => { if (wire()) d.dispose(); });
  }
}

interface Props {
  value: string;
  language?: string;
  readOnly?: boolean;
  onChange?: (v: string) => void;
  /** Stable URI for LSP tracking. If provided, model is registered with the LSP service. */
  lspUri?: string;
}

export function MonacoView({ value, language = "python", readOnly = false, onChange, lspUri }: Props) {
  const [monacoNs, setMonacoNs] = useState<Monaco | null>(null);
  const [model, setModel] = useState<monaco.editor.ITextModel | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const lspUriRef = useRef(lspUri);
  lspUriRef.current = lspUri;

  const lspEnabled = language === "python" && !readOnly;
  const service = useLspService(lspEnabled ? monacoNs : null);

  // Register / unregister document with LSP service when model or service changes.
  useEffect(() => {
    if (!service || !model || !lspUri) return;
    service.openDocument(model);
    return () => {
      service.closeDocument(lspUri);
    };
  }, [service, model, lspUri]);

  useEffect(() => {
    let cancelled = false;
    themeReady.then((t) => { if (!cancelled) setTheme(t); });
    return () => { cancelled = true; };
  }, []);

  // Wait for Shiki so the editor never flashes uncoloured text.
  if (!theme) return null;

  return (
    <Editor
      height="100%"
      language={language}
      // Model URI must equal the LSP URI so the server sees the file inside
      // /workspace (where pyrightconfig.json and the stubs live).
      path={lspUri}
      value={value}
      theme={theme}
      onChange={(v) => onChange?.(v ?? "")}
      onMount={(editor, m) => {
        setMonacoNs(m);
        setModel(editor.getModel());
        // `path` changes (tab switch) swap the model under the same editor.
        editor.onDidChangeModel(() => setModel(editor.getModel()));
        expandSuggestDetails(editor);
      }}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        wordWrap: "on",
        bracketPairColorization: { enabled: true },
        "semanticHighlighting.enabled": true,
        suggest: {
          showStatusBar: true,
          preview: true,
        },
      }}
    />
  );
}
