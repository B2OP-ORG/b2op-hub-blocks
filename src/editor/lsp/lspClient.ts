// Thin LSP client that:
//   1. Speaks LSP JSON-RPC to a Transport (worker or ws).
//   2. Registers Monaco providers (completion / hover / signatureHelp)
//      that forward to the server.
//   3. Applies publishDiagnostics as Monaco markers.
//
// We deliberately do NOT use `monaco-languageclient` — that library requires
// swapping monaco-editor for @codingame/monaco-vscode-editor-api and pulling
// in the whole vscode-api shim. The stub-driven worker + this minimal client
// give us completion / hover / signature / diagnostics against @monaco-editor/react
// with no editor-package swap.

import type * as monaco from "monaco-editor";
import type { RpcMessage, Transport } from "./transport";

const URI = "file:///workspace/main.py";
const LANGUAGE_ID = "python";
const OWNER = "b2op-hub-lsp";

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

export interface LspClient {
  dispose(): void;
  updateDocument(text: string): void;
}

export function startLspClient(
  monacoNs: typeof monaco,
  model: monaco.editor.ITextModel,
  transport: Transport,
): LspClient {
  let nextId = 1;
  const pending = new Map<number, Pending>();
  const disposables: monaco.IDisposable[] = [];
  let disposed = false;
  let ready = false;
  const queue: RpcMessage[] = [];

  // `initialize` must send immediately — the client can't become `ready`
  // until it receives the initialize response, and the server can't respond
  // if the request stays in our queue. Every other request/notification
  // waits for `ready` so we honor the LSP handshake ordering.
  function request<T>(method: string, params: unknown, force = false): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      const msg: RpcMessage = { jsonrpc: "2.0", id, method, params };
      if (ready || force) transport.send(msg);
      else queue.push(msg);
    });
  }

  function notify(method: string, params: unknown, force = false): void {
    const msg: RpcMessage = { jsonrpc: "2.0", method, params };
    if (ready || force) transport.send(msg);
    else queue.push(msg);
  }

  transport.onMessage((msg) => {
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const p = pending.get(msg.id as number);
      if (!p) return;
      pending.delete(msg.id as number);
      if (msg.error) p.reject(msg.error);
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === "textDocument/publishDiagnostics") {
      applyDiagnostics(msg.params as { uri: string; diagnostics: LspDiagnostic[] });
    }
  });

  transport.onClose(() => {
    if (!disposed) dispose();
  });

  // ── LSP handshake ────────────────────────────────────────────────────────
  request<unknown>(
    "initialize",
    {
      processId: null,
      rootUri: "file:///workspace",
      capabilities: {
        textDocument: {
          completion: { completionItem: { snippetSupport: false, documentationFormat: ["markdown"] } },
          hover: { contentFormat: ["markdown"] },
          signatureHelp: { signatureInformation: { parameterInformation: { labelOffsetSupport: false } } },
          publishDiagnostics: { relatedInformation: false },
        },
        workspace: {},
      },
      workspaceFolders: [{ uri: "file:///workspace", name: "workspace" }],
    },
    /* force */ true,
  )
    .then(() => {
      ready = true;
      notify("initialized", {}, /* force */ true);
      const initial = model.getValue();
      notify(
        "textDocument/didOpen",
        {
          textDocument: { uri: URI, languageId: LANGUAGE_ID, version: 1, text: initial },
        },
        /* force */ true,
      );
      for (const m of queue) transport.send(m);
      queue.length = 0;
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[b2op-hub-lsp] initialize failed", err);
    });

  // ── Monaco → LSP wiring ─────────────────────────────────────────────────
  let version = 1;
  disposables.push(
    model.onDidChangeContent(() => {
      version++;
      notify("textDocument/didChange", {
        textDocument: { uri: URI, version },
        contentChanges: [{ text: model.getValue() }],
      });
    }),
  );

  disposables.push(
    monacoNs.languages.registerCompletionItemProvider(LANGUAGE_ID, {
      triggerCharacters: ["."],
      async provideCompletionItems(mdl, position) {
        if (mdl !== model) return { suggestions: [] };
        const resp = (await request<LspCompletionList>("textDocument/completion", {
          textDocument: { uri: URI },
          position: { line: position.lineNumber - 1, character: position.column - 1 },
        }).catch(() => ({ items: [] }))) as LspCompletionList;
        const word = mdl.getWordUntilPosition(position);
        const range = new monacoNs.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        return {
          suggestions: (resp.items ?? []).map((it) => ({
            label: it.label,
            kind: lspKindToMonaco(monacoNs, it.kind),
            detail: it.detail,
            documentation: it.documentation
              ? { value: typeof it.documentation === "string" ? it.documentation : it.documentation.value }
              : undefined,
            insertText: it.insertText ?? it.label,
            range,
          })),
        };
      },
    }),
  );

  disposables.push(
    monacoNs.languages.registerHoverProvider(LANGUAGE_ID, {
      async provideHover(mdl, position) {
        if (mdl !== model) return null;
        const resp = (await request<LspHover | null>("textDocument/hover", {
          textDocument: { uri: URI },
          position: { line: position.lineNumber - 1, character: position.column - 1 },
        }).catch(() => null)) as LspHover | null;
        if (!resp || !resp.contents) return null;
        const value = typeof resp.contents === "string"
          ? resp.contents
          : Array.isArray(resp.contents)
            ? resp.contents.map((c) => (typeof c === "string" ? c : c.value)).join("\n\n")
            : resp.contents.value;
        return { contents: [{ value }] };
      },
    }),
  );

  disposables.push(
    monacoNs.languages.registerSignatureHelpProvider(LANGUAGE_ID, {
      signatureHelpTriggerCharacters: ["(", ","],
      async provideSignatureHelp(mdl, position) {
        if (mdl !== model) return null;
        const resp = (await request<LspSignatureHelp | null>("textDocument/signatureHelp", {
          textDocument: { uri: URI },
          position: { line: position.lineNumber - 1, character: position.column - 1 },
        }).catch(() => null)) as LspSignatureHelp | null;
        if (!resp || !resp.signatures?.length) return null;
        return {
          value: {
            signatures: resp.signatures.map((s) => ({
              label: s.label,
              documentation: s.documentation
                ? typeof s.documentation === "string"
                  ? s.documentation
                  : s.documentation.value
                : undefined,
              parameters: (s.parameters ?? []).map((p) => ({ label: p.label })),
            })),
            activeSignature: resp.activeSignature ?? 0,
            activeParameter: resp.activeParameter ?? 0,
          },
          dispose() {},
        };
      },
    }),
  );

  function applyDiagnostics(params: { uri: string; diagnostics: LspDiagnostic[] }): void {
    if (params.uri !== URI) return;
    const markers: monaco.editor.IMarkerData[] = params.diagnostics.map((d) => ({
      startLineNumber: d.range.start.line + 1,
      startColumn: d.range.start.character + 1,
      endLineNumber: d.range.end.line + 1,
      endColumn: d.range.end.character + 1,
      message: d.message,
      severity: severityOf(monacoNs, d.severity),
      source: d.source ?? OWNER,
    }));
    monacoNs.editor.setModelMarkers(model, OWNER, markers);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const d of disposables) d.dispose();
    monacoNs.editor.setModelMarkers(model, OWNER, []);
    try {
      notify("textDocument/didClose", { textDocument: { uri: URI } });
    } catch {
      // ignore
    }
    transport.dispose();
    pending.clear();
  }

  return {
    dispose,
    updateDocument(text) {
      version++;
      notify("textDocument/didChange", {
        textDocument: { uri: URI, version },
        contentChanges: [{ text }],
      });
    },
  };
}

/**
 * LSP CompletionItemKind uses different numeric values than Monaco's
 * CompletionItemKind enum. Without translation, every icon renders as a
 * different symbol than intended (and the suggest widget's per-kind icon
 * colours never apply). This maps the LSP enum → Monaco enum.
 */
function lspKindToMonaco(
  m: typeof monaco,
  kind: number | undefined,
): monaco.languages.CompletionItemKind {
  const K = m.languages.CompletionItemKind;
  switch (kind) {
    case 1: return K.Text;
    case 2: return K.Method;
    case 3: return K.Function;
    case 4: return K.Constructor;
    case 5: return K.Field;
    case 6: return K.Variable;
    case 7: return K.Class;
    case 8: return K.Interface;
    case 9: return K.Module;
    case 10: return K.Property;
    case 11: return K.Unit;
    case 12: return K.Value;
    case 13: return K.Enum;
    case 14: return K.Keyword;
    case 15: return K.Snippet;
    case 16: return K.Color;
    case 17: return K.File;
    case 18: return K.Reference;
    case 19: return K.Folder;
    case 20: return K.EnumMember;
    case 21: return K.Constant;
    case 22: return K.Struct;
    case 23: return K.Event;
    case 24: return K.Operator;
    case 25: return K.TypeParameter;
    default: return K.Variable;
  }
}

function severityOf(m: typeof monaco, sev: number | undefined): monaco.MarkerSeverity {
  switch (sev) {
    case 1: return m.MarkerSeverity.Error;
    case 2: return m.MarkerSeverity.Warning;
    case 3: return m.MarkerSeverity.Info;
    case 4: return m.MarkerSeverity.Hint;
    default: return m.MarkerSeverity.Info;
  }
}

// ── LSP wire types (subset used) ────────────────────────────────────────────

interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { kind: string; value: string };
  insertText?: string;
}
interface LspCompletionList {
  isIncomplete?: boolean;
  items?: LspCompletionItem[];
}
interface LspHover {
  contents:
    | string
    | { kind: string; value: string }
    | Array<string | { language?: string; value: string }>;
}
interface LspSignatureHelp {
  signatures: Array<{
    label: string;
    documentation?: string | { kind: string; value: string };
    parameters?: Array<{ label: string }>;
  }>;
  activeSignature?: number;
  activeParameter?: number;
}
interface LspDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity?: number;
  message: string;
  source?: string;
}
