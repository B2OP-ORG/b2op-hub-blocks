# B2OP-Hub-blocks

Browser-based IDE for programming B2OP Hub (ESP32-S3) microcontrollers. Build programs visually with drag-and-drop blocks or write MicroPython directly in the built-in editor — then upload and run them on the hub over Bluetooth or USB, with live console output streamed back to the browser.

## What it is

B2OP-Hub-blocks generates MicroPython from a Blockly block workspace, uploads the source to the hub via a custom binary protocol over BLE NUS or USB CDC, and streams program output back in real time. A Monaco-based Python editor with optional Pyright LSP completions is available as an alternative to the block view.

No native install needed. Runs entirely in the browser (Chrome / Edge with Web Bluetooth or Web Serial support).

## Tech stack

- **UI** — React 19, Zustand
- **Block editor** — Blockly + scratch-blocks (Scratch-style rounded blocks)
- **Python editor** — Monaco Editor
- **LSP** — in-browser stub-driven Pyright worker (default) or remote Pyright over WebSocket
- **Device** — custom HubProtocol over BLE NUS (Web Bluetooth) and USB CDC (Web Serial)
- **Build** — Vite, TypeScript

## Getting started

```sh
npm install
npm run dev
```

Open `http://localhost:5173` in Chrome or Edge.

To connect a hub: click **Connect** in the header, then choose **Bluetooth** or **USB**. The hub must be running the B2OP firmware with `main.py` active.

## Build

```sh
npm run build
```

Output goes to `dist/`. Serve as a static site.

## Testing

```sh
npm test
```

Runs the Vitest suite (protocol, LSP, codegen, project format, mock device).

## Documentation

| Document | What it covers |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | High-level architecture: three layers, data flow, key design decisions |
| [docs/PROGRAM_MODEL.md](docs/PROGRAM_MODEL.md) | How programs execute on the hub, block categories, Hub Python API reference |
| [docs/HUB_PROTOCOL.md](docs/HUB_PROTOCOL.md) | Full HubProtocol spec: frame format, command semantics, firmware requirements |
| [docs/PYTHON_EDITOR_LSP.md](docs/PYTHON_EDITOR_LSP.md) | LSP pipeline, file map, how to extend completions, known limits |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Deferred features: LVGL blocks, advanced hub/motor, backend, scratch-blocks migration |
| [docs/lsp-server/README.md](docs/lsp-server/README.md) | Running the optional remote Pyright server for full type checking |

## License

Copyright (C) 2026 — [Rbel12b](https://github.com/Rbel12b)

Licensed under the GNU Affero General Public License. See [LICENSE](LICENSE.txt).
