import { describe, it, expect, vi } from "vitest";
import { startLspClient } from "../src/editor/lsp/lspClient";
import { createLspServer, type RpcMessage } from "../src/editor/lsp/lspServer";
import type { Transport } from "../src/editor/lsp/transport";

const HUB_STUB = `
class _LED:
    def setRgbColor(self, r: int, g: int, b: int) -> None: ...

class _Ports:
    LED: _LED

ports: _Ports

def powerOff() -> None: ...
`.trimStart();

/**
 * In-process pair: a Transport that shuttles messages to a real LspServer.
 * Same shape as workerTransport but synchronous. Catches wiring bugs
 * (handshake ordering, provider registration, marker application) without
 * needing a browser or Web Worker.
 */
function inMemoryPair(): { transport: Transport; getServer: () => ReturnType<typeof createLspServer> } {
  let clientOnMessage: ((m: RpcMessage) => void) | null = null;
  const server = createLspServer({ "hub.pyi": HUB_STUB }, (m) => clientOnMessage?.(m));
  const transport: Transport = {
    send: (m) => queueMicrotask(() => server.handle(m)),
    onMessage: (h) => (clientOnMessage = h),
    onClose: () => {},
    dispose: () => {},
  };
  return { transport, getServer: () => server };
}

/** Minimal Monaco surface. Records provider registrations, applies markers. */
function makeMockMonaco() {
  const providers = {
    completion: [] as any[],
    hover: [] as any[],
    signature: [] as any[],
  };
  const markers: Record<string, any[]> = {};
  const monacoNs = {
    languages: {
      registerCompletionItemProvider: vi.fn((_lang: string, p: any) => {
        providers.completion.push(p);
        return { dispose: () => {} };
      }),
      registerHoverProvider: vi.fn((_lang: string, p: any) => {
        providers.hover.push(p);
        return { dispose: () => {} };
      }),
      registerSignatureHelpProvider: vi.fn((_lang: string, p: any) => {
        providers.signature.push(p);
        return { dispose: () => {} };
      }),
      CompletionItemKind: { Variable: 6, Method: 2 },
    },
    editor: {
      setModelMarkers: vi.fn((_model: any, owner: string, list: any[]) => {
        markers[owner] = list;
      }),
    },
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

function makeModel(text: string) {
  let content = text;
  const listeners: Array<() => void> = [];
  return {
    getValue: () => content,
    getWordUntilPosition: (pos: { lineNumber: number; column: number }) => ({
      word: "",
      startColumn: pos.column,
      endColumn: pos.column,
    }),
    onDidChangeContent: (cb: () => void) => {
      listeners.push(cb);
      return { dispose: () => {} };
    },
    _setValue: (t: string) => {
      content = t;
      for (const l of listeners) l();
    },
  };
}

async function tick(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

describe("startLspClient — handshake + provider registration", () => {
  it("registers Monaco providers on mount", () => {
    const { transport } = inMemoryPair();
    const { monacoNs, providers } = makeMockMonaco();
    const model = makeModel("");
    startLspClient(monacoNs, model as any, transport);
    expect(providers.completion).toHaveLength(1);
    expect(providers.hover).toHaveLength(1);
    expect(providers.signature).toHaveLength(1);
  });

  it("sends initialize immediately (does NOT deadlock on ready flag)", async () => {
    // Regression test for the queued-initialize deadlock: initialize was
    // enqueued behind `ready`, but `ready` only flipped after the server
    // replied — nothing ever went out. With the fix, the server receives
    // initialize and the client transitions to ready.
    const { transport, getServer } = inMemoryPair();
    const server = getServer();
    const { monacoNs } = makeMockMonaco();
    const model = makeModel("hub.\n");
    startLspClient(monacoNs, model as any, transport);
    await tick();
    expect(server.getDocument("file:///workspace/main.py")).toBe("hub.\n");
  });
});

describe("startLspClient — completion provider", () => {
  it("returns completions from the server for `hub.`", async () => {
    const { transport } = inMemoryPair();
    const { monacoNs, providers } = makeMockMonaco();
    const model = makeModel("hub.\n");
    startLspClient(monacoNs, model as any, transport);
    await tick();

    const result = await providers.completion[0].provideCompletionItems(model, {
      lineNumber: 1,
      column: 5,
    });
    const labels = result.suggestions.map((s: any) => s.label).sort();
    expect(labels).toEqual(["ports", "powerOff"]);
  });

  it("returns nested completions for `hub.ports.LED.`", async () => {
    const { transport } = inMemoryPair();
    const { monacoNs, providers } = makeMockMonaco();
    const model = makeModel("hub.ports.LED.\n");
    startLspClient(monacoNs, model as any, transport);
    await tick();

    const result = await providers.completion[0].provideCompletionItems(model, {
      lineNumber: 1,
      column: 15,
    });
    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels).toContain("setRgbColor");
  });
});

describe("startLspClient — hover provider", () => {
  it("returns markdown hover for a method chain", async () => {
    const { transport } = inMemoryPair();
    const { monacoNs, providers } = makeMockMonaco();
    const model = makeModel("hub.ports.LED.setRgbColor(1,2,3)\n");
    startLspClient(monacoNs, model as any, transport);
    await tick();

    const hover = await providers.hover[0].provideHover(model, {
      lineNumber: 1,
      column: 18,
    });
    expect(hover).not.toBeNull();
    expect(hover.contents[0].value).toContain("setRgbColor");
  });

  it("returns null for unknown symbol", async () => {
    const { transport } = inMemoryPair();
    const { monacoNs, providers } = makeMockMonaco();
    const model = makeModel("unknown_thing\n");
    startLspClient(monacoNs, model as any, transport);
    await tick();

    const hover = await providers.hover[0].provideHover(model, {
      lineNumber: 1,
      column: 5,
    });
    expect(hover).toBeNull();
  });
});

describe("startLspClient — signature help", () => {
  it("returns signature inside a call", async () => {
    const { transport } = inMemoryPair();
    const { monacoNs, providers } = makeMockMonaco();
    const source = "hub.ports.LED.setRgbColor(1, ";
    const model = makeModel(source);
    startLspClient(monacoNs, model as any, transport);
    await tick();

    const help = await providers.signature[0].provideSignatureHelp(model, {
      lineNumber: 1,
      column: source.length + 1,
    });
    expect(help).not.toBeNull();
    expect(help.value.signatures[0].label).toContain("setRgbColor");
  });
});

describe("startLspClient — diagnostics", () => {
  it("applies publishDiagnostics as Monaco markers", async () => {
    const { transport } = inMemoryPair();
    const { monacoNs, markers } = makeMockMonaco();
    const model = makeModel("print(hi");
    startLspClient(monacoNs, model as any, transport);
    await tick();
    // wait one more tick for the async publishDiagnostics that fires
    // synchronously with didOpen but is delivered through queueMicrotask
    await tick(4);
    expect(markers["b2op-hub-lsp"]).toBeDefined();
    expect(markers["b2op-hub-lsp"].length).toBeGreaterThan(0);
    expect(markers["b2op-hub-lsp"][0].message).toMatch(/Unclosed/);
  });

  it("clears markers on didChange to clean source", async () => {
    const { transport } = inMemoryPair();
    const { monacoNs, markers } = makeMockMonaco();
    const model = makeModel("print(hi");
    startLspClient(monacoNs, model as any, transport);
    await tick(4);
    expect(markers["b2op-hub-lsp"].length).toBeGreaterThan(0);

    model._setValue("x = 1\n");
    await tick(4);
    expect(markers["b2op-hub-lsp"]).toEqual([]);
  });
});
