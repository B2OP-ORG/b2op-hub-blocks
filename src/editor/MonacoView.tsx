import { useEffect, useRef, useState } from "react";
import Editor, { loader, type Monaco } from "@monaco-editor/react";
// Core editor + standard contributions only. The full "monaco-editor" entry
// also pulls in TS/CSS/HTML/JSON language services and ~80 basic languages,
// none of which we use (Python comes from Shiki + pyright LSP).
import "monaco-editor/esm/vs/editor/edcore.main.js";
import * as monacoApi from "monaco-editor/esm/vs/editor/editor.api.js";
import type * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { useLspService } from "./lsp/useLspClient";
import { editorTheme, ensureShiki } from "./shikiSetup";
import { useApp } from "../state/store";
import type { MonacoSettings } from "../project/format";
import { registerPythonLanguageConfig } from "./pythonLanguage";

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// Same runtime object as the full build minus the extra language namespaces;
// typed as the full API so it fits @monaco-editor/react and our helpers.
const monacoInstance = monacoApi as unknown as typeof monaco;

loader.config({ monaco: monacoInstance });
registerPythonLanguageConfig(monacoInstance);
// Resolves to whether Shiki themes are available; falls back to vs/vs-dark.
const themeReady: Promise<boolean> = ensureShiki(monacoInstance).then(
  () => true,
  (err) => {
    console.error("[editor] Shiki highlighting failed to load", err);
    return false;
  },
);

/** Editor-level options derived from the user's settings. */
export function monacoEditorOptions(m: MonacoSettings): monaco.editor.IEditorOptions {
  return {
    fontSize: m.fontSize,
    ...(m.fontFamily.trim() ? { fontFamily: m.fontFamily } : {}),
    fontLigatures: m.fontLigatures,
    lineHeight: m.lineHeight,
    wordWrap: m.wordWrap,
    wordWrapColumn: m.wordWrapColumn,
    lineNumbers: m.lineNumbers,
    minimap: { enabled: m.minimap, side: m.minimapSide },
    renderWhitespace: m.renderWhitespace,
    renderLineHighlight: m.renderLineHighlight,
    cursorStyle: m.cursorStyle,
    cursorBlinking: m.cursorBlinking,
    cursorSmoothCaretAnimation: m.cursorSmoothCaretAnimation,
    smoothScrolling: m.smoothScrolling,
    scrollBeyondLastLine: m.scrollBeyondLastLine,
    mouseWheelZoom: m.mouseWheelZoom,
    bracketPairColorization: { enabled: m.bracketPairColorization },
    guides: { bracketPairs: m.bracketPairGuides, indentation: m.indentationGuides },
    autoClosingBrackets: m.autoClosingBrackets,
    autoClosingQuotes: m.autoClosingQuotes,
    folding: m.folding,
    stickyScroll: { enabled: m.stickyScroll },
    quickSuggestions: m.quickSuggestions,
    suggest: { showStatusBar: true, preview: m.suggestPreview },
    acceptSuggestionOnEnter: m.acceptSuggestionOnEnter,
    parameterHints: { enabled: m.parameterHints },
  };
}

/** Model-level (indentation) options. */
function applyModelOptions(model: monaco.editor.ITextModel | null, m: MonacoSettings) {
  if (!model) return;
  if (m.detectIndentation) {
    model.detectIndentation(m.insertSpaces, m.tabSize);
  } else {
    model.updateOptions({ tabSize: m.tabSize, indentSize: m.tabSize, insertSpaces: m.insertSpaces });
  }
}

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
  const [shikiOk, setShikiOk] = useState<boolean | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const settings = useApp((s) => s.editorSettings.monaco);
  const dark = useApp((s) => s.editorSettings.darkMode);
  const theme = shikiOk === null ? null : shikiOk ? editorTheme(dark) : dark ? "vs-dark" : "vs";
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
    themeReady.then((ok) => { if (!cancelled) setShikiOk(ok); });
    return () => { cancelled = true; };
  }, []);

  // Live-apply setting changes.
  useEffect(() => {
    editorRef.current?.updateOptions({ ...monacoEditorOptions(settings), detectIndentation: settings.detectIndentation, tabSize: settings.tabSize, insertSpaces: settings.insertSpaces });
    applyModelOptions(model, settings);
  }, [settings, model]);

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
        editorRef.current = editor;
        setMonacoNs(m);
        setModel(editor.getModel());
        // `path` changes (tab switch) swap the model under the same editor.
        editor.onDidChangeModel(() => setModel(editor.getModel()));
        expandSuggestDetails(editor);
      }}
      options={{
        ...monacoEditorOptions(settings),
        detectIndentation: settings.detectIndentation,
        tabSize: settings.tabSize,
        insertSpaces: settings.insertSpaces,
        readOnly,
        automaticLayout: true,
        "semanticHighlighting.enabled": true,
      }}
    />
  );
}
