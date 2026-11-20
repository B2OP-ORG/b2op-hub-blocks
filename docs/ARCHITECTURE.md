# Architecture Overview — B2OP-Hub-blocks

B2OP-Hub-blocks is a browser-based IDE for programming B2OP Hub (ESP32-S3) microcontrollers. Users build programs visually with Blockly blocks or write Python directly in Monaco Editor. The app generates MicroPython source, uploads it to the hub over BLE or USB, and streams program output back to the console — all without a native install.

---

## Three-layer model

```
┌──────────────────────────────────────────────────┐
│  UI & blocks layer                               │
│  React 19 · Blockly · Monaco · Zustand           │
├──────────────────────────────────────────────────┤
│  Codegen & project layer                         │
│  Python generator · Python↔Blocks · auto-save   │
├──────────────────────────────────────────────────┤
│  Device layer                                    │
│  HubProtocol · BLE NUS · USB CDC                 │
└──────────────────────────────────────────────────┘
```

### UI & blocks layer (`src/ui/`, `src/blocks/`, `src/editor/`)

- **Blockly workspace** (`BlocklyView.tsx`) — visual block editor using `scratch-blocks` for the rounded Scratch-style appearance. Block definitions in `src/blocks/defs/` (one file per category). Toolbox built in `src/blocks/toolbox.ts`.
- **Monaco editor** (`MonacoView.tsx`) — Python text editor with syntax highlighting and optional LSP-powered completions. Toggled per-project between Blocks and Python modes.
- **Header & tabs** (`Header.tsx`, `TabBar.tsx`) — project tabs, run/stop controls, mode toggle, connection status.
- **Console panel** (`ConsolePanel.tsx`) — streams `OUT` and `STDERR` frames from the hub in real time.
- **Remote controller** (`src/ui/remote/`, `src/remote/`) — `.remote` project files (JSON layout of sliders, switches, buttons, joysticks, text inputs, displays, LEDs, gauges) edited on a canvas in their own tab. See *Remote controller* below.
- **State** (`src/state/store.ts`) — single Zustand store; all UI components read from it. Device client, project state, and settings live here.

### Codegen & project layer (`src/codegen/`, `src/project/`)

- **`pythonGen.ts`** — Blockly Python generator. Produces MicroPython from the workspace block tree. Adds the `# b2op-hub-blocks v2.0.0` header line required by the version guard.
- **`pythonToBlocks.ts`** — reverse direction: parses Python source back into a block workspace when the user switches modes. Rejects sources that don't start with the version header (returns a `raw_python` block instead).
- **`format.ts`** — project schema (format string `"b2op-hub-blocks"`, semver `"2.0.0"`). Defines `ProjectSettings` including `lspMode` and connection preferences.
- **`storage.ts`** — auto-save to `localStorage`. Merges `DEFAULT_SETTINGS` into old saves so forward-compatible.
- **`download.ts`** — export project to `.json` file.

### Device layer (`src/device/`, `src/transport/`)

- **`HubProtocol`** (`src/device/protocol.ts`) — frame-based command protocol over a raw byte pipe. Sends `UPLOAD`, `RUN`, `STOP`, `READ`, `PING`. Parses `OK`, `ERR`, `DATA`, `OUT`, `STDERR` replies. Queues UPLOAD / READ / CP one at a time (the hub runs one stream per link and answers others with ERR `"busy"`); frames flagged `ECHO` (BLE traffic the hub copies to USB) go to the echo sink, not to request waiters. See [HUB_PROTOCOL.md](HUB_PROTOCOL.md) for full spec.
- **`deviceClient.ts`** — higher-level client: connects a transport, negotiates firmware version, drives the upload-then-run sequence, routes console frames to registered sinks.
- **Transports** (`src/transport/`) — pluggable byte pipes:
  - `ble.ts` — Web Bluetooth, Nordic UART Service (NUS).
  - `serial.ts` — Web Serial API, USB CDC.
  - `mock.ts` — in-memory mock for tests.
- **`fwVersion.ts`** — firmware version string parsing and feature-flag negotiation.

---

## Data flow — run a program

```
User edits blocks
       │
       ▼
pythonGen.ts → Python source string
       │
       ▼
deviceClient.uploadAndRun(source)
       │
       ├─ UPLOAD /sd/<title>.py → hub ACKs OK
       │
       └─ RUN /sd/<title>.py → hub ACKs OK RUN
                │
                ├─ OUT frames → ConsolePanel (live stdout)
                ├─ STDERR frames → ConsolePanel (live stderr)
                └─ OK done / ERR <traceback> → run complete
```

---

## LSP subsystem (`src/editor/lsp/`)

Two modes, identical wire format (JSON-RPC over a message channel):

| Mode | Transport | Server | Type inference |
|---|---|---|---|
| `worker` (default) | Web Worker | `pyright.worker.ts` — stub-driven, in-browser | No — syntax diagnostics only |
| `remote` | WebSocket | `docs/lsp-server/` Node.js bridge → real Pyright | Yes — full type checking |

The client (`lspClient.ts`) is custom — it deliberately avoids `monaco-languageclient` to prevent being forced onto `@codingame/monaco-vscode-editor-api` instead of the standard `monaco-editor` package.

Stubs (`src/editor/lsp/stubs/files/`) are vendored from `Lpf2-micropython` and cover `hub`, `lpf2`, `remote`, `lvgl`, and MicroPython stdlib (`remote.pyi` gets the project's controls appended at runtime, see *Remote controller*). Kept in sync via `npm run sync-stubs`.

---

## Remote controller (`src/remote/`, `src/ui/remote/`)

Live controls for user programs over the REMOTE protocol kind (hub ≥ 1.2, see [HUB_PROTOCOL.md](HUB_PROTOCOL.md)).

- **Layout file.** A project has one remote controller, `controller.remote` (`DEFAULT_REMOTE_FILE`), opened from the header *Remote* button or the explorer menu and created on first use. It is an ordinary project file (uploaded with the project — the project travels with the hub). The code treats layouts as a list (`projectSymbols(files)` reads every `*.remote`), so more can be added later. Format: `{ format: "b2op-remote", version: 1, widgets: Widget[] }` (`layout.ts`); each widget has a name, a protocol id, position / size on an 8 px grid and kind options.
- **Symbols.** Controls (slider int/float, switch / button bool, text input str, joystick → `name_x` / `name_y` ints) are host → hub values read as `remote.<name>`. Indicators (display, LED, gauge) show program messages (`remote.create_message(id, name, type)` + `remote.send(id, v)`), matched **by name**. Controls and indicators are separate id spaces; names / ids must be unique per role across the project (`symbolConflicts`).
- **Registry** (`registry.ts`, synced from the store by `sync.ts`) holds the current symbols for code that can't import the store: block fields, generators, the LSP stub.
- **Run mode** (`session.ts`, outside React so other tabs don't stop it): CLEAR → DEFINE all controls → SET start values (acknowledged) → upload changed files + run `main.py`. Then changed controls go out as NO_ACK SETs (sliders / joysticks merged per animation frame, buttons immediately) and every value is resent every 250 ms (repairs SETs the hub dropped as reordered, keeps `remote.age_ms()` fresh). Back to edit mode = STOP + CLEAR; a program that ends by itself (or a disconnect) also returns to edit mode. Program messages are collected for the whole connection (`applyRemoteEvent`, installed as the device's remote sink).
- **Blocks.** The *Remote* toolbox category is dynamic (`remoteFlyout()`): a "Create remote name…" button (adds a widget to the layout), `remote [name]` reporters for controls and `set indicator [name] to (v)` for indicators. `FieldRemoteName` keeps names the layout doesn't define (shown as "name (not defined)" with a warning). The generator emits `remote.create_message(...)` for every indicator used, with id / type from the layout (undefined names get a free id and a type guessed from the value block), and wraps values in `int()` / `str()` where the hub needs it. `pythonToBlocks` reads them back.
- **Python stubs.** `remoteStubText()` appends one typed attribute per control to the firmware's `remote.pyi`; `attachRemoteStub()` pushes it to the language server as an open virtual document (`LspService.setVirtualFile`) at the stub path, updated whenever the layout changes.

---

## Key design decisions

**No REPL.** The firmware disables `micropython.kbd_intr(-1)` at boot, so control bytes on stdin belong to HubProtocol — not the REPL. Every program must be uploaded. This enables binary-safe uploads and reliable streaming output.

**Custom LSP client.** Using `monaco-languageclient` would require swapping `monaco-editor` for `@codingame/monaco-vscode-editor-api`, which is a heavy dependency with its own versioning constraints. The custom client in `lspClient.ts` exposes the same Monaco providers with no extra deps.

**Stub-parser for in-browser completions.** A full Pyright instance is too heavy to run reliably in a browser worker. A regex-based `.pyi` parser (`stubParser.ts`) builds a flat symbol table from the vendored stubs — cheap enough to rebuild on every document change, good enough for the subset of stubs the project uses.

**Single Zustand store.** All transient state (connection, project, settings, console output) lives in one store. Components subscribe to slices; no prop drilling, no context pyramids.

---

## Further reading

| Document | What it covers |
|---|---|
| [PROGRAM_MODEL.md](PROGRAM_MODEL.md) | How programs execute on the hub, block categories, Hub Python API reference |
| [HUB_PROTOCOL.md](HUB_PROTOCOL.md) | Full HubProtocol spec: frame format, command semantics, firmware requirements |
| [PYTHON_EDITOR_LSP.md](PYTHON_EDITOR_LSP.md) | LSP pipeline, file map, how to extend completions, known limits |
| [ROADMAP.md](ROADMAP.md) | Deferred features: LVGL blocks, advanced hub/motor, backend, scratch-blocks migration |
| [lsp-server/README.md](lsp-server/README.md) | Running the optional remote Pyright server |
