// Transport = bidirectional JSON message pipe. Concrete implementations:
//  - worker: Web Worker running the in-browser stub LSP (pyright.worker.ts).
//  - ws:     WebSocket to a remote Pyright server (docs/lsp-server/).
//
// Kept intentionally raw (no Content-Length framing) — both endpoints agree
// on "one JSON object per message". Simpler than pulling in vscode-jsonrpc.

export interface RpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface Transport {
  send(msg: RpcMessage): void;
  onMessage(handler: (msg: RpcMessage) => void): void;
  onClose(handler: () => void): void;
  dispose(): void;
}

export function createWorkerTransport(): Transport {
  const worker = new Worker(new URL("./pyright.worker.ts", import.meta.url), {
    type: "module",
    name: "b2op-hub-lsp",
  });
  let msgHandler: ((m: RpcMessage) => void) | null = null;
  let closeHandler: (() => void) | null = null;
  worker.onmessage = (ev) => msgHandler?.(ev.data);
  worker.onerror = () => closeHandler?.();
  return {
    send: (msg) => worker.postMessage(msg),
    onMessage: (h) => (msgHandler = h),
    onClose: (h) => (closeHandler = h),
    dispose: () => worker.terminate(),
  };
}

export function createWsTransport(url: string): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`LSP WebSocket timeout: ${url}`));
    }, 5000);
    let msgHandler: ((m: RpcMessage) => void) | null = null;
    let closeHandler: (() => void) | null = null;
    socket.onopen = () => {
      clearTimeout(timer);
      // Remote server uses vscode-ws-jsonrpc → LSP with Content-Length framing.
      // We speak raw JSON. Backend adapts by using raw JSON mode as well
      // (see docs/lsp-server/index.js). If a stricter server is used later,
      // swap this transport for one that emits headers.
      resolve({
        send: (msg) => socket.send(JSON.stringify(msg)),
        onMessage: (h) => (msgHandler = h),
        onClose: (h) => (closeHandler = h),
        dispose: () => socket.close(),
      });
    };
    socket.onmessage = (ev) => {
      try {
        msgHandler?.(JSON.parse(typeof ev.data === "string" ? ev.data : ""));
      } catch {
        // ignore malformed frame
      }
    };
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`LSP WebSocket error: ${url}`));
    };
    socket.onclose = () => closeHandler?.();
  });
}
