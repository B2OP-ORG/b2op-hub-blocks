// Transport = bidirectional JSON message pipe. Concrete implementations:
//  - worker: browser-basedpyright running as a Web Worker.
//  - ws:     WebSocket to a remote basedpyright server (docs/lsp-server/).

import pyrightWorkerUrl from "browser-basedpyright/dist/pyright.worker.js?url";
import { STUBS } from "./stubs";

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

// Build the VFS stubs map once at module load — same content for every transport instance.
//
// Routing:
//   typings/stdlib/** → /workspace/typings/stdlib/**  (typeshedPath: proper typeshed treatment,
//   typings/stubs/**  → /workspace/typings/stubs/**    @overload-only stubs work without impl)
//   typings/**        → /workspace/stubs/**            (root-level MicroPython pkg stubs: time, etc.)
//   **               → /workspace/stubs/**             (custom firmware stubs: hub, machine, etc.)
//
// Custom firmware stubs are processed second so they overwrite any typings backup copies.
const _stubFiles: Record<string, string> = {};
for (const [k, v] of Object.entries(STUBS)) {
  if (k.startsWith("typings/stdlib/") || k.startsWith("typings/stubs/")) {
    _stubFiles[`/workspace/typings/${k.slice("typings/".length)}`] = v;
  } else if (k.startsWith("typings/")) {
    _stubFiles[`/workspace/stubs/${k.slice("typings/".length)}`] = v;
  }
}
for (const [k, v] of Object.entries(STUBS)) {
  if (!k.startsWith("typings/")) {
    _stubFiles[`/workspace/stubs/${k}`] = v;
  }
}
_stubFiles["/workspace/pyrightconfig.json"] = JSON.stringify({
  typeCheckingMode: "basic",
  typeshedPath: "/workspace/typings",
  stubPath: "stubs",
  pythonVersion: "3.5",
  reportMissingModuleSource: "none",
});

function spawnPyrightWorker(name: string): Worker {
  return new Worker(pyrightWorkerUrl, { name });
}

export function createWorkerTransport(): Transport {
  const worker = spawnPyrightWorker("b2op-hub-lsp");
  worker.postMessage({ type: "browser/boot", mode: "foreground" });

  let msgHandler: ((m: RpcMessage) => void) | null = null;
  let closeHandler: (() => void) | null = null;
  let initInjected = false;

  worker.onmessage = (ev) => {
    const msg = ev.data as { type?: string; initialData?: unknown; port?: MessagePort } & RpcMessage;

    // Pyright browser asks the main thread to spawn background workers because
    // nested workers are blocked in Safari and unreliable elsewhere.
    if (msg?.type === "browser/newWorker") {
      const bg = spawnPyrightWorker("b2op-hub-lsp-bg");
      bg.postMessage(
        { type: "browser/boot", mode: "background", initialData: msg.initialData, port: msg.port },
        [msg.port as MessagePort],
      );
      return;
    }

    msgHandler?.(msg);
  };
  worker.onerror = () => closeHandler?.();

  return {
    send(msg) {
      // Inject stubs into the first initialize request via the VFS files map.
      if (!initInjected && msg.method === "initialize") {
        initInjected = true;
        const p = (msg.params ?? {}) as Record<string, unknown>;
        const enriched: RpcMessage = {
          ...msg,
          params: {
            ...p,
            initializationOptions: {
              ...((p.initializationOptions as object) ?? {}),
              files: _stubFiles,
            },
          },
        };
        worker.postMessage(enriched);
        return;
      }
      worker.postMessage(msg);
    },
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
