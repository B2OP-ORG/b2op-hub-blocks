# Python Editor — LSP Integration

Read this before touching any file under `src/editor/lsp/` or `docs/lsp-server/`.

The Python editor runs in two modes, both using the same JSON-RPC wire format:

- **Worker mode** (default) — stub-driven Pyright running in a Web Worker inside the browser. Fast, offline, no setup. Covers completion, hover, signature help, and basic syntax diagnostics. No real type inference.
- **Remote mode** — connects to a Node.js bridge (`docs/lsp-server/`) that spawns a real `pyright-langserver` process. Full type checking: return-type mismatches, unbound names, unreachable code. Requires running the server locally.

The LSP client is agnostic — same requests, same Monaco providers, only the transport differs.

---

## Pipeline

```text
┌───────────────────────────────────────────────────────────────────────────┐
│  MonacoView.tsx     ← @monaco-editor/react instance                       │
│    │                                                                       │
│    │ onMount → (monacoNs, model)                                          │
│    ▼                                                                       │
│  useLspClient(monacoNs, model)     hook, gated by settings.lspMode         │
│    │                                                                       │
│    ▼                                                                       │
│  startLspClient(...)                registers Monaco providers,            │
│    │                                sends LSP requests over Transport      │
│    ▼                                                                       │
│  Transport (worker | ws)            raw JSON-RPC pipe, no framing          │
│    │                                                                       │
│    ├─── worker ─────────► pyright.worker.ts   stub-driven LSP in browser   │
│    │                         │                                             │
│    │                         └── parses src/editor/lsp/stubs/files/**      │
│    │                                                                       │
│    └─── ws ─────────────► docs/lsp-server/index.js   framing bridge        │
│                              │                                             │
│                              └── spawns `pyright-langserver --stdio`       │
│                                     using the same stubs directory        │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## File map

| Path | Role |
| --- | --- |
| [src/editor/MonacoView.tsx](../src/editor/MonacoView.tsx) | Editor host. Grabs Monaco namespace + model on mount, gates LSP on `language === "python" && !readOnly`. |
| [src/editor/lsp/useLspClient.ts](../src/editor/lsp/useLspClient.ts) | React hook. Watches `settings.lspMode` + `lspRemoteUrl`, creates/tears down transport + client. |
| [src/editor/lsp/lspClient.ts](../src/editor/lsp/lspClient.ts) | Custom LSP client. Handshake, JSON-RPC bookkeeping, Monaco completion/hover/signature providers, diagnostics → markers. Deliberately does not use `monaco-languageclient` — that library requires swapping monaco-editor for `@codingame/monaco-vscode-editor-api`. |
| [src/editor/lsp/transport.ts](../src/editor/lsp/transport.ts) | Two Transport factories: `createWorkerTransport()` (Web Worker) and `createWsTransport(url)` (WebSocket). Both expose the same `send / onMessage / onClose / dispose` shape. Wire format = one JSON object per message, no `Content-Length` framing. |
| [src/editor/lsp/pyright.worker.ts](../src/editor/lsp/pyright.worker.ts) | In-browser stub-driven LSP server. Handles `initialize`, `didOpen/didChange/didClose`, `completion`, `hover`, `signatureHelp`, publishes syntax-lint diagnostics. NOT a full type-checker. |
| [src/editor/lsp/stubParser.ts](../src/editor/lsp/stubParser.ts) | `.pyi` parser: extracts classes / methods / attributes into a flat dotted symbol table. `resolveChain()` + `childrenOf()` power dot-completion. |
| [src/editor/lsp/stubs/index.ts](../src/editor/lsp/stubs/index.ts) | Uses Vite `import.meta.glob('./files/**', { query: '?raw' })` to inline the stub tree as `Record<path, source>` at build time. |
| [src/editor/lsp/stubs/files/hub.pyi](../src/editor/lsp/stubs/files/hub.pyi) | Vendored from `Lpf2-micropython/stubs/hub/__init__.pyi`. Covers `hub.ports`, `hub.buttons`, `hub.imu`, `hub.lcd`, `hub.log`, `hub.board`, `hub.powerOff`. |
| [src/editor/lsp/stubs/files/lpf2/](../src/editor/lsp/stubs/files/lpf2/) | Vendored from `Lpf2-micropython/modules/Lpf2/stubs/lpf2/`. Package tree with `color`, `devices`, `port_num`, etc. |
| [src/editor/lsp/stubs/files/lvgl.pyi](../src/editor/lsp/stubs/files/lvgl.pyi) | Vendored from `Lpf2-micropython/stubs/lvgl.pyi`. Machine-generated, ~470 KB. Handle with care. |
| MicroPython stdlib stubs at root of `src/editor/lsp/stubs/files/` (`machine.pyi`, `esp32.pyi`, `network.pyi`, `_mpy_shed/`, `stdlib/`, ...) | Vendored from `Lpf2-micropython/typings/`. ~1.6 MB. Enables completion for `import machine`, `import time`, etc. |
| [src/editor/lsp/stubs/files/pyrightconfig.json](../src/editor/lsp/stubs/files/pyrightconfig.json) | Config used by the remote Pyright server (ignored by the worker). `extraPaths: ["."]` + `stubPath: "."` so `import hub` / `import machine` resolve against the same directory. |
| [src/project/format.ts](../src/project/format.ts) | Adds `lspMode: "off" \| "worker" \| "remote"` + `lspRemoteUrl` to `ProjectSettings`. |
| [src/project/storage.ts](../src/project/storage.ts) | Merges `DEFAULT_SETTINGS` into loaded autosaves so old projects gain the new fields. |
| [src/ui/SettingsModal.tsx](../src/ui/SettingsModal.tsx) | User-facing controls: mode dropdown + remote URL input. |
| [vite.config.ts](../vite.config.ts) | `worker: { format: 'es' }` so the Pyright worker bundles as an ES module. |
| [docs/lsp-server/index.js](lsp-server/index.js) | WebSocket ↔ Pyright stdio bridge. Adds/strips `Content-Length` framing. |
| [docs/lsp-server/package.json](lsp-server/package.json) | Standalone deps (`pyright`, `ws`). |
| [scripts/sync-stubs.mjs](../scripts/sync-stubs.mjs) | Refreshes `src/editor/lsp/stubs/files/` from a local `Lpf2-micropython` checkout — copies `stubs/`, `modules/Lpf2/stubs/lpf2/`, merges `typings/`, then appends per-file overlays from `scripts/stubs-overlay/`. Preserves `pyrightconfig.json`. |
| [scripts/stubs-overlay/](../scripts/stubs-overlay/) | Shim additions merged on top of fw-sourced stubs. Declares symbols that live in the on-device Python shim layer but aren't in the firmware C-module stubs (e.g. `hub.sleep`, `hub.sleep_ms`). |

---

## How to change X

- **Add or fix a hub API symbol** — edit `src/editor/lsp/stubs/files/hub.pyi` (or the matching `lpf2/...pyi`). The worker rebuilds its index on next reload; the remote server picks it up on next request.
- **Support a new LSP feature (definition, references, rename, …)** — extend `pyright.worker.ts` handlers + advertise in `initialize` capabilities, then register the matching Monaco provider in `lspClient.ts`.
- **Change transport framing** — both `transport.ts` and `docs/lsp-server/index.js` must stay in sync. Currently: raw JSON per message.
- **Change LSP mode default** — `DEFAULT_SETTINGS.lspMode` in `src/project/format.ts`.
- **Point at a different Pyright version** — bump `docs/lsp-server/package.json` (the client-side worker does not use Pyright itself).
- **Refresh the LVGL stub** — replace `src/editor/lsp/stubs/files/lvgl.pyi` verbatim. Do not hand-edit; it's generated.
- **Refresh all stubs from firmware** — `npm run sync-stubs -- --src ../Lpf2-micropython`. Copies whole `stubs/`, `modules/Lpf2/stubs/lpf2/`, and merges `typings/` into `src/editor/lsp/stubs/files/`, then appends per-file overlays from `scripts/stubs-overlay/`. Re-run after any fw stub change.
- **Add a hub Python-shim symbol** (not in fw C-module stubs) — add its `.pyi` fragment to `scripts/stubs-overlay/<module>.pyi`, then re-run `npm run sync-stubs`. The fragment is appended to the fw-sourced stub of the same relative path. Use this for `hub.sleep`, `hub.sleep_ms`, and any other on-device Python shim additions.

---

## Known limits

- Single file: the client treats `project.source` as one document at `file:///workspace/main.py`. No multi-file / package support on the browser side.
- Worker mode has no real type inference. Diagnostics only cover unmatched brackets and mixed indentation. Users needing type errors must switch to Remote.
- Stub parser is regex-based. Handles the shape of the vendored stubs but is not a spec-compliant Python parser — anomalies in future stub imports may need parser tweaks in `stubParser.ts`.
- LVGL stub is huge (~470 KB). It's inlined into the worker bundle. If bundle size becomes a problem, gate it behind an optional lazy fetch.

---

## Verification checklist

1. `npm run build` — TS + Vite bundle succeed. Worker chunk emitted.
2. `npm run dev`; open Python project; verify `hub.<Ctrl-Space>` shows `ports`, `buttons`, `imu`, `lcd`, `log`, `board`, `powerOff`.
3. Hover `hub.ports.LED.setRgbColor` → signature + type from stub.
4. Type `foo(` after `hub.powerOff` → signature help panel opens.
5. Type `def f(:` — bracket diagnostic surfaces as red squiggle.
6. Toggle Settings → Off → completions vanish.
7. Toggle Settings → Remote, run `docs/lsp-server`, retry (2)–(5); expect richer diagnostics (real type errors).
8. `npm test` — stub loader and settings default tests pass.
