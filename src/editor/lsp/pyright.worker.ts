/// <reference lib="webworker" />

// Web Worker wrapper around the pure LSP server (see lspServer.ts).
// Kept intentionally thin so all logic is testable outside worker context.

import { STUBS } from "./stubs";
import { createLspServer, type RpcMessage } from "./lspServer";

const server = createLspServer(STUBS, (msg) => {
  (self as unknown as Worker).postMessage(msg);
});

(self as unknown as Worker).onmessage = (ev: MessageEvent<RpcMessage>) => {
  server.handle(ev.data);
};

// Surface unexpected errors to the client console — otherwise a broken worker
// silently drops every request.
self.addEventListener("error", (e) => {
  // eslint-disable-next-line no-console
  console.error("[b2op-hub-lsp worker]", e.message, e.filename, e.lineno);
});
