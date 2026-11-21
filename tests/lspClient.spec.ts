import { describe, it, expect, vi } from "vitest";
import { startLspService } from "../src/lsp/lspClient";
import type { RpcMessage, Transport } from "../src/lsp/transport";

const OWNER = "b2op-hub-lsp";
const URI = "file:///workspace/main.py";

type Handler = (params: any) => unknown;

/**
 * Scripted fake LSP server behind an in-memory Transport. Records every
 * message the client sends and answers requests from `handlers`. Delivery is
 * async (queueMicrotask) to mimic a worker/WebSocket.
 */
function fakeServer(handlers: Record<string, Handler> = {}) {
  const received: RpcMessage[] = [];
  let toClient: ((m: RpcMessage) => void) | null = null;
  let closeHandler: (() => void) | null = null;
  const all: Record<string, Handler> = {
    initialize: () => ({ capabilities: {} }),
    ...handlers,
  };
  const transport: Transport = {
    send: (m) => {
      received.push(m);
      if (m.id === undefined || !m.method) return; // notification or response
      const h = all[m.method];
      queueMicrotask(() =>
        toClient?.(
          h
            ? { jsonrpc: "2.0", id: m.id, result: h(m.params) ?? null }
            : { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "nope" } },
        ),
      );
    },
    onMessage: (h) => (toClient = h),
    onClose: (h) => (closeHandler = h),
    dispose: vi.fn(),
  };
  return {
    transport,
    received,
    methods: () => received.map((m) => m.method),
    push: (m: RpcMessage) => toClient?.(m),
    close: () => closeHandler?.(),
  };
}

class Emitter<T> {
  private listeners: Array<(v: T) => void> = [];
  event = (l: (v: T) => void) => {
    this.listeners.push(l);
    return { dispose: () => {} };
  };
  fire(v: T) {
    for (const l of this.listeners) l(v);
  }
  dispose() {
    this.listeners = [];
  }
}

function makeModel(text: string, uri = URI) {
  let content = text;
  let version = 1;
  const listeners: Array<() => void> = [];
  return {
    uri: { toString: () => uri },
    getValue: () => content,
    getVersionId: () => version,
    getWordUntilPosition: (pos: { lineNumber: number; column: number }) => ({
      word: "",
      startColumn: pos.column,
      endColumn: pos.column,
    }),
    onDidChangeContent: (cb: () => void) => {
      listeners.push(cb);
      return { dispose: () => listeners.splice(listeners.indexOf(cb), 1) };
    },
    _setValue: (t: string) => {
      content = t;
      version++;
      for (const l of [...listeners]) l();
    },
  };
}

/** Minimal Monaco surface. Records provider registrations, applies markers. */
function makeMockMonaco(models: ReturnType<typeof makeModel>[] = []) {
  const providers = {
    completion: [] as any[],
    hover: [] as any[],
    signature: [] as any[],
    semantic: [] as any[],
  };
  const markers: Record<string, Record<string, any[]>> = {};
  const reg = (list: any[]) =>
    vi.fn((_lang: string, p: any) => {
      list.push(p);
      return { dispose: () => list.splice(list.indexOf(p), 1) };
    });
  const monacoNs = {
    Emitter,
    languages: {
      registerCompletionItemProvider: reg(providers.completion),
      registerHoverProvider: reg(providers.hover),
      registerSignatureHelpProvider: reg(providers.signature),
      registerDocumentSemanticTokensProvider: reg(providers.semantic),
      CompletionItemKind: { Variable: "Variable", Method: "Method", Function: "Function", Class: "Class" },
    },
    editor: {
      getModel: (u: { toString(): string }) => models.find((m) => m.uri.toString() === u.toString()) ?? null,
      setModelMarkers: vi.fn((model: any, owner: string, list: any[]) => {
        (markers[owner] ??= {})[model.uri.toString()] = list;
      }),
    },
    Uri: { parse: (s: string) => ({ toString: () => s }) },
    MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
    Range: class Range {
      constructor(
        public startLineNumber: number,
        public startColumn: number,
        public endLineNumber: number,
        public endColumn: number,
      ) {}
    },
  };
  return { monacoNs: monacoNs as any, providers, markers };
}

async function tick(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

describe("startLspService — handshake", () => {
  it("registers completion/hover/signature providers immediately", () => {
    const srv = fakeServer();
    const { monacoNs, providers } = makeMockMonaco();
    startLspService(monacoNs, srv.transport);
    expect(providers.completion).toHaveLength(1);
    expect(providers.hover).toHaveLength(1);
    expect(providers.signature).toHaveLength(1);
  });

  it("sends initialize immediately (does NOT deadlock on ready flag)", () => {
    const srv = fakeServer();
    const { monacoNs } = makeMockMonaco();
    startLspService(monacoNs, srv.transport);
    expect(srv.methods()).toEqual(["initialize"]);
  });

  it("queues didOpen until initialize resolves, then sends initialized first", async () => {
    const srv = fakeServer();
    const model = makeModel("hub.\n");
    const { monacoNs } = makeMockMonaco([model]);
    const svc = startLspService(monacoNs, srv.transport);
    svc.openDocument(model as any);
    expect(srv.methods()).toEqual(["initialize"]);
    await tick();
    expect(srv.methods()).toEqual(["initialize", "initialized", "textDocument/didOpen"]);
    const open = srv.received[2].params as any;
    expect(open.textDocument).toEqual({ uri: URI, languageId: "python", version: 1, text: "hub.\n" });
  });

  it("registers semantic tokens only when the server advertises a legend", async () => {
    const plain = fakeServer();
    const a = makeMockMonaco();
    startLspService(a.monacoNs, plain.transport);
    await tick();
    expect(a.providers.semantic).toHaveLength(0);

    const withLegend = fakeServer({
      initialize: () => ({
        capabilities: { semanticTokensProvider: { legend: { tokenTypes: ["class"], tokenModifiers: [] } } },
      }),
    });
    const b = makeMockMonaco();
    startLspService(b.monacoNs, withLegend.transport);
    await tick();
    expect(b.providers.semantic).toHaveLength(1);
  });
});

describe("startLspService — documents", () => {
  it("sends full-text didChange on edits and stops after closeDocument", async () => {
    const srv = fakeServer();
    const model = makeModel("x = 1\n");
    const { monacoNs } = makeMockMonaco([model]);
    const svc = startLspService(monacoNs, srv.transport);
    svc.openDocument(model as any);
    await tick();

    model._setValue("x = 2\n");
    const change = srv.received.at(-1)!;
    expect(change.method).toBe("textDocument/didChange");
    expect(change.params).toEqual({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ text: "x = 2\n" }],
    });

    svc.closeDocument(URI);
    expect(srv.received.at(-1)!.method).toBe("textDocument/didClose");
    const count = srv.received.length;
    model._setValue("x = 3\n");
    expect(srv.received.length).toBe(count);
  });

  it("mirrors project files: create + open, hand over to the editor and back, delete", async () => {
    const srv = fakeServer();
    const MENU = "file:///workspace/menu.py";
    const model = makeModel("import menu\n");
    const { monacoNs } = makeMockMonaco([model]);
    const svc = startLspService(monacoNs, srv.transport);
    await tick();
    const after = (n: number) => srv.received.slice(n).map((m) => [m.method, (m.params as any)?.uri ?? (m.params as any)?.textDocument?.uri]);

    let n = srv.received.length;
    svc.setProjectFiles(new Map([[URI, "import menu\n"], [MENU, "label0 = 1\n"]]));
    expect(after(n)).toEqual([
      ["pyright/createFile", URI], ["textDocument/didOpen", URI],
      ["pyright/createFile", MENU], ["textDocument/didOpen", MENU],
    ]);

    // The editor opens main.py: the mirror's copy closes first.
    n = srv.received.length;
    svc.openDocument(model as any);
    expect(after(n)).toEqual([["textDocument/didClose", URI], ["textDocument/didOpen", URI]]);

    // While the editor has it, the mirror leaves it alone.
    n = srv.received.length;
    svc.setProjectFiles(new Map([[URI, "import menu\nx = 1\n"], [MENU, "label0 = 2\n"]]));
    expect(after(n)).toEqual([["textDocument/didChange", MENU]]);

    // Closed in the editor: the mirror takes it back with the latest text.
    n = srv.received.length;
    svc.closeDocument(URI);
    expect(after(n)).toEqual([["textDocument/didClose", URI], ["textDocument/didOpen", URI]]);
    expect((srv.received.at(-1)!.params as any).textDocument.text).toBe("import menu\nx = 1\n");

    // Removed from the project.
    n = srv.received.length;
    svc.setProjectFiles(new Map([[URI, "import menu\nx = 1\n"]]));
    expect(after(n)).toEqual([["textDocument/didClose", MENU], ["pyright/deleteFile", MENU]]);
  });

  it("ignores duplicate openDocument for the same URI", async () => {
    const srv = fakeServer();
    const model = makeModel("");
    const { monacoNs } = makeMockMonaco([model]);
    const svc = startLspService(monacoNs, srv.transport);
    svc.openDocument(model as any);
    svc.openDocument(model as any);
    await tick();
    expect(srv.methods().filter((m) => m === "textDocument/didOpen")).toHaveLength(1);
  });
});

describe("startLspService — completion provider", () => {
  it("maps LSP completion items to Monaco suggestions", async () => {
    const srv = fakeServer({
      "textDocument/completion": (p) => {
        expect(p.position).toEqual({ line: 0, character: 4 });
        return {
          items: [
            { label: "ports", kind: 6, detail: "_Ports" },
            { label: "powerOff", kind: 3, documentation: { kind: "markdown", value: "Turn off" } },
          ],
        };
      },
    });
    const model = makeModel("hub.\n");
    const { monacoNs, providers } = makeMockMonaco([model]);
    startLspService(monacoNs, srv.transport);
    await tick();

    const result = await providers.completion[0].provideCompletionItems(model, { lineNumber: 1, column: 5 });
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0]).toMatchObject({ label: "ports", kind: "Variable", detail: "_Ports", insertText: "ports" });
    expect(result.suggestions[1]).toMatchObject({ label: "powerOff", kind: "Function", documentation: { value: "Turn off" } });
  });

  it("returns empty suggestions when the server errors", async () => {
    const srv = fakeServer(); // no completion handler → error response
    const model = makeModel("hub.\n");
    const { monacoNs, providers } = makeMockMonaco([model]);
    startLspService(monacoNs, srv.transport);
    await tick();
    const result = await providers.completion[0].provideCompletionItems(model, { lineNumber: 1, column: 5 });
    expect(result.suggestions).toEqual([]);
  });
});

describe("startLspService — hover provider", () => {
  it("flattens MarkedString[] contents into one markdown value", async () => {
    const srv = fakeServer({
      "textDocument/hover": () => ({ contents: ["def setRgbColor(r, g, b)", { language: "python", value: "doc" }] }),
    });
    const model = makeModel("hub.ports.LED.setRgbColor(1,2,3)\n");
    const { monacoNs, providers } = makeMockMonaco([model]);
    startLspService(monacoNs, srv.transport);
    await tick();
    const hover = await providers.hover[0].provideHover(model, { lineNumber: 1, column: 18 });
    expect(hover.contents[0].value).toBe("def setRgbColor(r, g, b)\n\ndoc");
  });

  it("returns null when the server has no hover", async () => {
    const srv = fakeServer({ "textDocument/hover": () => null });
    const model = makeModel("unknown_thing\n");
    const { monacoNs, providers } = makeMockMonaco([model]);
    startLspService(monacoNs, srv.transport);
    await tick();
    expect(await providers.hover[0].provideHover(model, { lineNumber: 1, column: 5 })).toBeNull();
  });
});

describe("startLspService — signature help", () => {
  it("maps signatures and active parameter", async () => {
    const srv = fakeServer({
      "textDocument/signatureHelp": () => ({
        signatures: [{ label: "setRgbColor(r, g, b)", parameters: [{ label: "r" }, { label: "g" }, { label: "b" }] }],
        activeParameter: 1,
      }),
    });
    const model = makeModel("hub.ports.LED.setRgbColor(1, ");
    const { monacoNs, providers } = makeMockMonaco([model]);
    startLspService(monacoNs, srv.transport);
    await tick();
    const help = await providers.signature[0].provideSignatureHelp(model, { lineNumber: 1, column: 30 });
    expect(help.value.signatures[0].label).toContain("setRgbColor");
    expect(help.value.signatures[0].parameters).toHaveLength(3);
    expect(help.value.activeSignature).toBe(0);
    expect(help.value.activeParameter).toBe(1);
  });
});

describe("startLspService — diagnostics", () => {
  it("applies publishDiagnostics as Monaco markers (1-based)", async () => {
    const srv = fakeServer();
    const model = makeModel("print(hi");
    const { monacoNs, markers } = makeMockMonaco([model]);
    startLspService(monacoNs, srv.transport);
    srv.push({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: {
        uri: URI,
        diagnostics: [
          { range: { start: { line: 0, character: 5 }, end: { line: 0, character: 8 } }, severity: 1, message: "\"(\" was not closed" },
        ],
      },
    });
    expect(markers[OWNER][URI]).toEqual([
      {
        startLineNumber: 1,
        startColumn: 6,
        endLineNumber: 1,
        endColumn: 9,
        message: "\"(\" was not closed",
        severity: 8,
        source: OWNER,
      },
    ]);
  });

  it("clears markers on closeDocument", async () => {
    const srv = fakeServer();
    const model = makeModel("print(hi");
    const { monacoNs, markers } = makeMockMonaco([model]);
    const svc = startLspService(monacoNs, srv.transport);
    svc.openDocument(model as any);
    await tick();
    srv.push({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: { uri: URI, diagnostics: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, message: "x" }] },
    });
    expect(markers[OWNER][URI]).toHaveLength(1);
    svc.closeDocument(URI);
    expect(markers[OWNER][URI]).toEqual([]);
  });
});

describe("startLspService — server requests + lifecycle", () => {
  it("answers known server→client requests with null and unknown ones with an error", async () => {
    const srv = fakeServer();
    const { monacoNs } = makeMockMonaco();
    startLspService(monacoNs, srv.transport);
    srv.push({ jsonrpc: "2.0", id: 100, method: "window/workDoneProgress/create", params: {} });
    srv.push({ jsonrpc: "2.0", id: 101, method: "workspace/configuration", params: {} });
    const replies = srv.received.filter((m) => m.id === 100 || m.id === 101);
    expect(replies[0]).toEqual({ jsonrpc: "2.0", id: 100, result: null });
    expect(replies[1].error?.code).toBe(-32601);
  });

  it("disposes providers and transport when the transport closes", async () => {
    const srv = fakeServer();
    const { monacoNs, providers } = makeMockMonaco();
    startLspService(monacoNs, srv.transport);
    await tick();
    srv.close();
    expect(providers.completion).toHaveLength(0);
    expect(providers.hover).toHaveLength(0);
    expect(srv.transport.dispose).toHaveBeenCalledTimes(1);
  });
});
