# Hub Communication Protocol (HubProtocol)

Custom side-channel over the same byte stream (BLE NUS / USB CDC). Replaces the raw MicroPython REPL entirely for all web-app operations. The device disables `micropython.kbd_intr(-1)` at boot so control bytes on stdin are NOT interpreted as REPL commands — they belong to HubProtocol.

---

## Overview

The protocol is designed around three needs:

1. **Binary-safe file upload** — source files may contain any byte sequence; length-prefixed payloads avoid delimiter collisions.
2. **Reliable program output streaming** — `OUT` and `STDERR` frames carry live stdout/stderr from the running program back to the browser console.
3. **Async stop** — `STOP` signals the runner to exit at the next safe checkpoint without killing the MicroPython runtime.

The same sub-protocol runs identically over BLE NUS and USB CDC. The web app picks the transport based on how the user connected.

---

## Connection flow

1. **Scan / select** — user picks a hub via Web Bluetooth (BLE) or Web Serial (USB).
2. **Connect** — transport opens; for BLE, ATT MTU is negotiated to ≥ 185 bytes.
3. **PING** — web sends `\x1ePING\n`; hub replies `\x1eOK PING\n`. Confirms protocol is live.
4. **MTU query** (BLE only) — web sends `\x1eMTU\n`; hub replies `\x1eOK MTU=<n>\n`. Web uses this to size upload chunks.
5. **Version check** — web uploads a probe or reads `/version.txt` to negotiate firmware feature flags (`fwVersion.ts`).
6. **Protocol ready** — `deviceClient` emits `connected`; UI enables Run / Upload buttons.

---

## 1. Transports

Two byte-pipe transports. Sub-protocol is identical on both.

### 1.1 BLE — Nordic UART Service (NUS)

| Role | UUID |
| --- | --- |
| Service | `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` |
| RX (host → device, WRITE) | `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` |
| TX (device → host, NOTIFY) | `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` |

Firmware advertises the NUS service UUID and negotiates ATT MTU ≥ 185.

### 1.2 USB Serial (CDC)

ESP32-S3 native USB CDC. Baud 115200 8N1.

### 1.3 Firmware bridge

Firmware bridges the byte pipe to MicroPython `sys.stdin` / `sys.stdout`. No framing added by firmware. Framing below is applied by the on-device `main.py` protocol listener + web-side `HubProtocol` client.

---

## 2. Frame format

Delimiter: **`0x1E`** (ASCII Record Separator, RS). Any byte on the wire outside a frame is stdout (device → web) or discarded (web → device).

### 2.1 Web → Device

```text
\x1e RUN <path>\n                          launch runner.run_program(path)
\x1e UPLOAD <path> <length>\n<length bytes> write file (raw bytes follow header)
\x1e STOP\n                                sets runner._stop_flag; loop exits at next tick
\x1e READ <path>\n                         read file; reply DATA
\x1e PING\n                                health check
\x1e MTU\n                                 query effective ATT MTU (reply: OK MTU=<n>)
```

Header line is UTF-8 up to `\n`. For UPLOAD, exactly `<length>` raw bytes follow the header line — the device reads them via `sys.stdin.buffer.read` without further parsing (bytes may contain any value including 0x1E).

### 2.2 Device → Web

```text
\x1e OK <msg>\n                            control success
\x1e ERR <msg>\n                           control error (message = traceback or reason)
\x1e DATA <length> <msg>\n<length bytes>   binary reply (READ)
\x1e OUT <length>\n<length bytes>          stdout chunk (unsolicited, from sys.stdout)
\x1e STDERR <length>\n<length bytes>       stderr chunk (unsolicited, from sys.stderr)
<other bytes>                              stdout fallback (pre-redirect / raw REPL)
```

For RUN, the device replies `OK RUN <path>` immediately once the file is confirmed to exist, then streams program output as `OUT` / `STDERR` frames, then either `OK done <path>` or `ERR <traceback>` when the runner returns. Web pairs each control command with the next OK/ERR/DATA reply; OUT/STDERR frames are unsolicited and routed to console sinks.

`sys.stdout` and `sys.stderr` are redirected at boot (`main.py` → `protocol.install_stream_redirect()`) so `print()` and traceback output travel as framed OUT / STDERR chunks over every attached transport (USB CDC + BLE NUS). Payload is length-prefixed and binary-safe — literal `#FR:` inside output is not misparsed. The raw-bytes fallback remains for pre-redirect boot messages and for users on a raw REPL.

---

## 3. RUN semantics

- `runner.run_program(path)` sets up a `sys.modules["hub"]` shim exposing an `on` decorator.
- User code is executed at module scope. `@on("setup")` and `@on("loop")` registrations are captured.
- After module-scope execution, `setup()` runs once, then `loop()` runs repeatedly.
- The runner also polls `_stop_flag` (set by STOP frame) and center-button-held-2s to exit cleanly.
- On exit, hub button callbacks captured before the program ran are restored (menu resumes).

---

## 4. UPLOAD path allowlist

Client-side and device-side both reject:

- `/main.py`, `/boot.py`, `/boot.mpy`, `/runner.py` — always.
- Any path outside `/sd/` unless `settings.allowRoot` is enabled.

---

## 5. STOP semantics

STOP is asynchronous: it sets `runner._stop_flag`. The runner checks the flag before each loop iteration. Long `time.sleep_ms` calls inside `loop()` delay the response — programs should sleep in ≤ 100 ms chunks.

---

## 6. Firmware checklist

- [ ] Advertise NUS service UUID.
- [ ] Bridge NUS RX/TX ↔ MicroPython stdin/stdout.
- [ ] Bridge USB CDC ↔ same stdin/stdout.
- [ ] `main.py` calls `micropython.kbd_intr(-1)` before starting its protocol poller.
- [ ] `main.py` polls stdin in its idle loop via `uselect.poll(sys.stdin)`.
- [ ] `runner.py` shim: `_HubShim` + `on()` + `run_program(path, poll_stdin)`.

---

## 7. REPL is unavailable

Because `kbd_intr` is disabled and the device consumes control bytes as protocol frames, the classic MicroPython REPL is unusable while `main.py` runs. **Every program must be uploaded** — there is no way to run a snippet interactively. Web-app **Run** button uploads the current source to `/sd/<title>.py` then sends a RUN frame.
