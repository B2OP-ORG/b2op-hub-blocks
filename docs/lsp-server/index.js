// Remote Pyright bridge for the b2op-hub-blocks Python editor.
//
// The browser client speaks raw JSON-RPC over WebSocket (one JSON object per
// text frame — see src/editor/lsp/transport.ts). Pyright's language server
// speaks LSP with Content-Length framing over stdio. This bridge translates
// between the two: unframe → forward to ws; ws frame → wrap with headers →
// send to Pyright.
//
// It also mounts the vendored .pyi stubs directory as a rootUri so Pyright
// finds `hub`, `lpf2`, `lvgl` at import time.

import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { WebSocketServer } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STUBS_DIR = resolve(__dirname, "../../src/editor/lsp/stubs/files");
const STUBS_URI = pathToFileURL(STUBS_DIR).href.replace(/\/$/, "");
const PORT = Number(process.env.LSP_PORT ?? 3001);

const wss = new WebSocketServer({ port: PORT });
console.log(`[lego-hub-lsp] listening on ws://localhost:${PORT}`);
console.log(`[lego-hub-lsp] stubs: ${STUBS_DIR}`);

wss.on("connection", (socket) => {
  console.log("[lego-hub-lsp] client connected");
  const proc = spawn("npx", ["pyright-langserver", "--stdio"], {
    cwd: STUBS_DIR,
    stdio: ["pipe", "pipe", "pipe"],
  });
  proc.stderr.on("data", (b) => process.stderr.write(`[pyright] ${b}`));

  // ── Pyright stdout (framed LSP) → ws (raw JSON) ─────────────────────────
  let buf = Buffer.alloc(0);
  proc.stdout.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      const headerEnd = buf.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const header = buf.slice(0, headerEnd).toString("utf8");
      const m = /Content-Length:\s*(\d+)/i.exec(header);
      if (!m) {
        buf = buf.slice(headerEnd + 4);
        continue;
      }
      const len = Number(m[1]);
      const bodyStart = headerEnd + 4;
      if (buf.length < bodyStart + len) break;
      const body = buf.slice(bodyStart, bodyStart + len).toString("utf8");
      buf = buf.slice(bodyStart + len);
      if (socket.readyState === socket.OPEN) socket.send(body);
    }
  });

  // ── ws (raw JSON) → Pyright stdin (framed LSP) ──────────────────────────
  //
  // Rewrite the client's `initialize` params: pyright resolves imports
  // relative to the workspace root, so `rootUri` must point at the stubs
  // directory (where `hub.pyi`, `lpf2/`, and pyrightconfig.json live).
  // Without this, `import hub` fails to resolve even though the stubs are
  // sitting right on disk.
  socket.on("message", (data) => {
    let body = typeof data === "string" ? data : data.toString("utf8");
    try {
      const msg = JSON.parse(body);
      if (msg.method === "initialize" && msg.params) {
        msg.params.rootUri = STUBS_URI;
        msg.params.rootPath = STUBS_DIR;
        msg.params.workspaceFolders = [{ uri: STUBS_URI, name: "hub-stubs" }];
        body = JSON.stringify(msg);
      }
    } catch { /* forward as-is */ }
    const bytes = Buffer.byteLength(body, "utf8");
    proc.stdin.write(`Content-Length: ${bytes}\r\n\r\n${body}`);
  });

  const cleanup = () => {
    try { proc.kill(); } catch { /* ignore */ }
  };
  socket.on("close", () => { console.log("[lego-hub-lsp] client disconnected"); cleanup(); });
  socket.on("error", cleanup);
  proc.on("exit", () => {
    if (socket.readyState === socket.OPEN) socket.close();
  });
});
