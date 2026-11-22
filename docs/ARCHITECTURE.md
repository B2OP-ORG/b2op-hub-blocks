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

### UI & blocks layer (`src/ui/`, `src/blocks/`)

`src/ui/` is grouped by feature, one flat folder each:

| Folder | Contents |
|---|---|
| `components/` | Shared presentational components, one `Name.tsx` + `Name.module.css` each: `Button`, `IconButton`, `ModeToggle`, `ZoomControls`, `Toolbar`, `PaletteGroup`, the property fields (`Field`, `TextField`, `NumberField`, `SelectField`, `CheckField`, `ColorField`, `TextAreaField`, `PropertyPanel`), `Modal`, `PanelHeader`, `SectionTitle`, `ListRow`, `EmptyNote`, `InlineInput`, `Callout`, `FileLoadError`, `ResizeHandle`, `ContextMenu` (+ `menuStore.ts`), `ErrorBoundary`. Styled with CSS modules that read the palette as `var(--p-…)` variables (published on `<html>` by `useApplyPaletteVars()` in `theme.ts`). |
| `hooks/` | Shared hooks: `useCanvasView` (pan / zoom), `useWidgetDrag` (move / resize on a canvas), `useResizeDrag`, `useCompactLevel`, `useInlineRename`, `useDeviceAvailability`. |
| `header/` | Top bar: `Header`, `DeviceActions`, `StatusBadge`, `BoardInfo`, `useDeviceConnection` (connect / disconnect / stop), `headerStyles`. |
| `workspace/` | Editor area: `Workspace`, `TabBar` / `EditorTab`, `ExtraTabView` (docs / example tabs), `Drawer`, `TransferOverlay`, `NoFileOpen`. |
| `editor/` | `BlocklyView` (scratch-blocks), `MonacoView` + `useLspClient` + `pythonLanguage`, `modeSwitch` (Blocks ↔ Python dialogs). |
| `scene/`, `remote/` | The scene and remote controller editors (see below). |
| `sidebar/` | `Sidebar`, `ActivityBar` and the tabs (Explorer, Projects, SD card, Device, Docs, Examples). |
| `settings/` | `SettingsModal`, one component per section, settings-only form fields. |
| `dialog/` | Promise-based dialogs (`showAlert`, `showConfirm`, `showPrompt`, …) and `DialogHost`. |
| `actions/` | User flows shared by several views (new / import / delete projects and files, device → project, examples). |
| `device/`, `console/`, `firmware/`, `docs/` | Device panel (live readings), REPL console, firmware update prompt / page, `DocPage`. |

Feature files keep inline styles built from `usePalette()`; shared look lives in `components/`.

- **Blocks** — definitions in `src/blocks/defs/` (one file per category), Python generators in `src/blocks/generators/`, toolbox in `src/blocks/toolbox.ts`.
- **State** (`src/state/store/`) — single Zustand store `useApp`, composed from slices (`projectsSlice`, `filesSlice`, `deviceSlice`, `transferSlice`, `uiSlice`, `settingsSlice`). Pure project operations it uses live in `src/project/ops.ts`.

### Codegen, project & settings (`src/codegen/`, `src/project/`, `src/settings/`, `src/run/`)

- **`codegen/pythonGen.ts`** — Blockly Python generator. Produces MicroPython from the workspace block tree. Adds the `# b2op-hub-blocks v2.0.0` header line required by the version guard.
- **`codegen/pythonToBlocks/`** — reverse direction: parses Python source back into a block workspace when the user switches modes (`expr.ts` tokenizer / parser, `statements.ts`, `lines.ts`, `translate.ts`, `deviceGroups.ts`). Rejects sources that don't start with the version header (returns a `raw_python` block instead). `codegen/translate.ts` wraps both directions for the mode switch.
- **`project/format.ts`** — project schema (format string `"b2op-hub-blocks"`, semver `"2.0.0"`), multi-file projects and the blocks header codec. `paths.ts`, `zip.ts`, `ops.ts` (pure edits), `storage.ts` (projects in `localStorage`).
- **`settings/`** — global editor settings (`editorSettings.ts`: Monaco, sidebar, auto-reload, LSP mode; `mergeEditorSettings()` keeps old saves forward-compatible) and their persistence (`storage.ts`, also the sidebar layout and last device).
- **`run/`** — `deviceSync.ts` (upload / run / reload projects on the hub's SD card) and `autoReload.ts`.
- **`utils/`** — `sanitize.ts`, `download.ts` (browser downloads / file pickers), `format.ts` (sizes, speeds).

### Device layer (`src/device/`)

- **`HubProtocol`** (`src/device/protocol/`) — frame-based command protocol over a raw byte pipe. Sends `UPLOAD`, `RUN`, `STOP`, `READ`, `PING`. Parses `OK`, `ERR`, `DATA`, `OUT`, `STDERR` replies. Queues UPLOAD / READ / CP one at a time (the hub runs one stream per link and answers others with ERR `"busy"`); frames flagged `ECHO` (BLE traffic the hub copies to USB) go to the echo sink, not to request waiters. Split into `constants`, `version`, `framing`, `frameParser` (shared with the mock hub), `remote` (REMOTE codec), `types`, `payloads`, `paths` and `hubProtocol` (the client class); `index.ts` re-exports all of it. See [HUB_PROTOCOL.md](HUB_PROTOCOL.md) for full spec.
- **`deviceClient.ts`** — higher-level client: connects a transport, negotiates firmware version, drives the upload-then-run sequence, routes console frames to registered sinks. App state is passed in as callbacks (`DeviceClientOptions`), so this layer doesn't import the store.
- **Transports** (`src/device/transport/`) — pluggable byte pipes:
  - `ble.ts` — Web Bluetooth, Nordic UART Service (NUS).
  - `serial.ts` — Web Serial API, USB CDC.
- **Mock hub** (`src/device/sim/`) — in-browser simulated hub (tests and the "Mock" connect option).
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
                ├─ OUT frames → ReplPanel (live stdout)
                ├─ STDERR frames → ReplPanel (live stderr)
                └─ OK done / ERR <traceback> → run complete
```

---

## LSP subsystem (`src/lsp/`)

Two modes, identical wire format (JSON-RPC over a message channel):

| Mode | Transport | Server | Type inference |
|---|---|---|---|
| `worker` (default) | Web Worker | `browser-basedpyright` — Pyright in the browser | Yes |
| `remote` | WebSocket | `docs/lsp-server/` Node.js bridge → real Pyright | Yes — full type checking |

The client (`lspClient.ts`) is custom — it deliberately avoids `monaco-languageclient` to prevent being forced onto `@codingame/monaco-vscode-editor-api` instead of the standard `monaco-editor` package.

Stubs (`src/lsp/stubs/files/`) are vendored from `Lpf2-micropython` and cover `hub`, `lpf2`, `remote`, `lvgl`, and MicroPython stdlib (`remote.pyi` gets the project's controls appended at runtime, see *Remote controller*). Kept in sync via `npm run sync-stubs`.

---

## Remote controller (`src/remote/`, `src/ui/remote/`)

Live controls for user programs over the REMOTE protocol kind (hub ≥ 1.2, see [HUB_PROTOCOL.md](HUB_PROTOCOL.md)).

- **Layout file.** A project has one remote controller, `controller.remote` (`DEFAULT_REMOTE_FILE`), opened from the header *Remote* button or the explorer menu and created on first use. It is an ordinary project file (uploaded with the project — the project travels with the hub). The code treats layouts as a list (`projectSymbols(files)` reads every `*.remote`), so more can be added later. Format: `{ format: "b2op-remote", version: 1, widgets: Widget[] }` (`layout.ts`); each widget has a name, a protocol id, position / size on an 8 px grid and kind options.
- **Symbols.** Controls (slider int/float, switch / button bool, text input str, joystick → `name_x` / `name_y` ints) are host → hub values read as `remote.<name>`. Indicators (display, LED, gauge) show program messages (`remote.create_message(id, name, type)` + `remote.send(id, v)`), matched **by name**. Controls and indicators are separate id spaces; names / ids must be unique per role across the project (`symbolConflicts`).
- **Registry** (`registry.ts`, synced from the store by `sync.ts`) holds the current symbols for code that can't import the store: block fields, generators, the LSP stub.
- **Canvas** (`RemoteView` + `hooks/useCanvasView.ts`, `useCanvasBounds.ts`): widget positions may be negative. The scroll area is the home view (0,0 + visible size / zoom), grown by a fixed margin past any committed widget that sticks out (no auto-scroll while dragging); when it grows left / up the scroll position moves with it so nothing jumps. Content is a scaled stage (`scale(zoom) translate(-left, -top)`). Pan (middle-drag, Space + drag, two-finger touch, styled scrollbars) only scrolls; the plain / Shift wheel is swallowed; zoom (Ctrl + wheel / pinch, Ctrl + − 0, toolbar, Fit — Fit also trims: it shifts every widget so the group starts at the margin, saved to the layout, and zooms down-rounded so nothing sticks out) keeps the point under the pointer in place and is stored per browser (`b2op.remoteZoom.<project>.<file>`). In run / preview, a two-finger pan starts only if neither finger is on a control, so two controls can be used at once.
- **Preview mode** (`RemoteView` state only): same look as run mode (name only, no ids / kinds), controls change local values, indicators show `previewIndicatorValue()` samples; nothing touches the device.
- **Run mode** (`session.ts`, outside React so other tabs don't stop it): CLEAR → DEFINE all controls → SET start values (acknowledged) → upload changed files + run `main.py`. Then changed controls go out as NO_ACK SETs (sliders / joysticks merged per animation frame, buttons immediately) and every value is resent every 250 ms (repairs SETs the hub dropped as reordered, keeps `remote.age_ms()` fresh). Back to edit mode = STOP + CLEAR; a program that ends by itself (or a disconnect) also returns to edit mode. Program messages are collected for the whole connection (`applyRemoteEvent`, installed as the device's remote sink).
- **Blocks.** The *Remote* toolbox category is dynamic (`remoteFlyout()`): a "Create remote name…" button (adds a widget to the layout), `remote [name]` reporters for controls and `set indicator [name] to (v)` for indicators. `FieldRemoteName` keeps names the layout doesn't define (shown as "name (not defined)" with a warning). The generator emits `remote.create_message(...)` for every indicator used, with id / type from the layout, and wraps values in `int()` / `str()` where the hub needs it. Blocks naming a control / indicator the layout doesn't define (deleted, or not created yet) emit no remote code: reporters become `0` / `False` / `''`, set blocks a `pass` comment. `pythonToBlocks` reads them back.
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

## Scenes (`src/scene/`, `src/ui/scene/`)

Screen layouts for the hub's 160 × 128 LCD, edited visually and used as Python modules.

- **File format.** A scene is an ordinary `<module>.py` project file whose first line is `# __scene__: <SceneDoc JSON>` (`SCENE_HEADER_PREFIX`), followed by the Python module generated from it (`sceneToPython`, `codegen.ts`). Detection is by that header (`isSceneFile`), not by `FileMode`; the file stays `mode: "python"`, the header switch is disabled and the store's file content is the only copy (every edit = `updateFile(withSceneHeader(doc, sceneToPython(doc, module)))`). The file uploads with the project like any other. `SceneDoc = { format: "b2op-scene", version: 1, bg, widgets: SceneWidget[] }`; widgets are flat with a `parent` uid (+ `tab` for tab views) and kind-specific optional props (`model.ts`).
- **Generated module.** Only imports `lvgl`. At import it builds a hidden, full-screen `root = lv.obj(lv.screen_active())`, an `lv.group` and one module global per widget (plus helpers such as `button0_label`, `list0_buttons`, `chart0_series`, `tabview0_tabs`). `show()` hides every other child of the active screen, unhides `root`, makes the scene's group the default (`group.set_default()`) and focuses its first visible widget if nothing has focus (LVGL can't focus a widget under the hidden `root`, so the group starts unfocused); `on(name, cb)`, `set_items`, `selected_index`, `selected_text`, `set_qr` complete the API. `set_qr` sizes the QR canvas to exactly modules × scale (`qrLayout` mirrors LVGL's version choice): LVGL centres with a rounded-down margin, so any other size leaves a light row / column right and bottom. Widgets on a non-shown scene stay valid, and the firmware's screen clean between runs frees everything.
- **Buttons.** The firmware (`ports/b2op/hub/Lcd.cpp`) registers the hub buttons as an LVGL encoder indev that follows `lv_group_get_default()` (up/down = RIGHT/LEFT keys → next/previous focus, increase/decrease while editing; newer firmware also focuses the first visible widget of an unfocused group, center & right = ENTER, left = ESC + leave edit mode); `Runner` resets it to an empty base group around each run. Older firmware has no indev: scenes still draw, the buttons just don't move the focus.
- **Registry / sync.** `registry.ts` (store-free) holds `{module, fileId, path, widgets:[{name, kind}]}` per scene; `sync.ts` keeps it in step with the store.
- **Language server.** Every project `.py` / `.pyi` is mirrored to pyright at `file:///workspace/<path>` (`lsp/projectFiles.ts` → `LspService.setProjectFiles`): `pyright/createFile` puts it on the worker's file system (import resolution only sees files there — a plain `didOpen` is not enough), then it stays open as a virtual document with the store's text. The editor opens the active file at that same URI and takes the document over while it's open. So `import menu` resolves to the real scene module, as does any other sibling import.
- **Editor** (`SceneView.tsx`, with `SceneCanvas`, `Outline`, `WidgetProperties`, `sceneOps.ts` and `preview.ts`): outline tree, palette, a stage drawn at `BASE` × zoom with `useCanvasView` for pan / zoom, 1 px drag / resize (Shift = 4 px), properties, a read-only Python drawer, and a Preview mode that simulates the button focus order / edit mode / events on a local copy. `widgets.tsx` draws HTML/SVG look-alikes of the LVGL default (light) theme.
- **Blocks** (`blocks/defs/scene.ts`, `generators/scene.ts`): dynamic *Scenes* category (`sceneFlyout()`), `FieldSceneRef` (scene or `module.widget`, filtered by kind, keeps undefined values with a warning). Generators emit `import <module>` (and `import lvgl as lv`, so loops get `lv.timer_handler()`) and kind-specific LVGL calls. The `scene_on_event` hat is emitted by `workspaceToPython` as `def _on_<module>_<widget>(…)` + `<module>.on("<widget>", …)`; scene module names are added to the generator's reserved words. Blocks naming a deleted / not yet created scene or widget emit no import and no call (a `pass` comment, or a default value for reporters); event hats for them are dropped.
