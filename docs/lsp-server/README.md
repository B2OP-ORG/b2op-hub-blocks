# Remote Pyright LSP server

Optional backend for the b2op-hub-blocks Python editor. Provides *real*
Pyright type-checking + IntelliSense over WebSocket. Ships as a tiny bridge
that spawns `pyright-langserver --stdio` per client.

## When to use

- Worker mode (`settings.lspMode = "worker"`, default) runs a stub-driven
  LSP inside the browser. Fast, offline, covers completion / hover /
  signature / basic syntax diagnostics — but no real type inference.
- Remote mode (`settings.lspMode = "remote"`) uses this server for full
  Pyright analysis: return-type mismatches, unbound names, unreachable code,
  the works.

## Run

```sh
cd docs/lsp-server
npm install
npm start
```

Server listens on `ws://localhost:3001` (override with `LSP_PORT=xxxx`).

Point the client at it in Settings → Python LSP → Mode: **Remote** → URL:
`ws://localhost:3001`.

## Wire format

The browser transport sends **one JSON-RPC object per WebSocket text frame**
(see `src/editor/lsp/transport.ts`). This bridge adds/strips the
`Content-Length` framing Pyright expects on stdio.

## Stubs

Working directory is set to `src/editor/lsp/stubs/files/`, which contains
`pyrightconfig.json` pointing `stubPath` at itself. Pyright resolves
`import hub`, `import lpf2`, `import lvgl as lv` against the same vendored
stubs the worker uses, so behavior is consistent between modes.
