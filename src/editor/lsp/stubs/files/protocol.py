"""HubProtocol frame parser. See docs/source/hub/protocol.rst.

Reads `#FR:`-marked frames from sys.stdin (dupterm'd with USB CDC and BLE NUS),
dispatches RUN/UPLOAD/READ/STOP/PING, replies via hub.raw_write (bypasses the
C-level `#FR:OUT` framing wrapper) and to BLE NUS.
"""
import sys
import os
import time
import uselect

import runner
import hub as _hub
try:
    import ble_uart as _ble_uart
except ImportError:
    _ble_uart = None

# Frame delimiter. Must be a byte sequence that survives MP's stdout path
# (device→web) AND stdin (web→device). Control bytes < 0x20 get filtered by
# some MP builds on the output side, so use a printable multi-char marker.
FRAME_MARK = b"#FR:"
_FRAME_FIRST = FRAME_MARK[0]  # '#'
_FRAME_LEN = len(FRAME_MARK)

_FORBIDDEN = (
    "/main.py", "/boot.py", "/boot.mpy", "/runner.py",
    "/protocol.py", "/menu.py", "/listview.py",
    "/config.py", "/battery.py", "/ble_uart.py",
)

_poller = uselect.poll()
_poller.register(sys.stdin, uselect.POLLIN)

_buf = bytearray()

# Optional hook called after every RUN completes (both menu-triggered and
# BLE/USB-triggered paths converge through _handle here). Menu registers it to
# wait for a button press and rebuild the main view.
on_run_finished = None
_running = False


def _write(frame):
    # Send raw bytes via the C-level unframed stdout path (bypasses the
    # framing wrapper installed by hub.set_framed_output). BLE fan-out is
    # handled by the frame-sink callback registered from install_stream_redirect.
    try:
        _hub.raw_write(frame)
    except Exception:
        pass


def _ble_sink(buf):
    # Called from mphalport.c under GIL after each framed flush and raw_write
    # so the exact bytes reaching UART/USB also hit the BLE NUS TX characteristic.
    if _ble_uart is None:
        return
    inst = _ble_uart.instance()
    if inst is None or not inst.connected():
        return
    try:
        inst.write_tx(buf)
    except Exception:
        pass


_stdout_installed = False


def install_stream_redirect():
    """Enable C-level stdout framing. Idempotent.

    After this, every mp_hal_stdout_tx_strn call (print, traceback, REPL echo)
    is wrapped in a `#FR:OUT <len>\\n<bytes>` frame before hitting UART/CDC/JTAG.
    Protocol replies use hub.raw_write() to bypass the wrapper.

    Note: sys.stdout in this MP build is an immutable dummy, so a Python-side
    redirect can't intercept print() — framing must happen in C.
    """
    global _stdout_installed
    if _stdout_installed:
        return
    try:
        _hub.set_frame_sink(_ble_sink)
    except Exception:
        pass
    _hub.set_framed_output(True)
    _stdout_installed = True


def _ok(msg=""):
    _write(FRAME_MARK + b"OK " + msg.encode("utf-8") + b"\n")


def _err(msg=""):
    _write(FRAME_MARK + b"ERR " + msg.encode("utf-8") + b"\n")


def _ack(msg=""):
    # Long-running commands emit ACK immediately after parsing the header so
    # the host can extend its idle timeout while payload transfer / disk write
    # proceed. Final OK still signals completion.
    _write(FRAME_MARK + b"ACK " + msg.encode("utf-8") + b"\n")


def _progress(msg=""):
    _write(FRAME_MARK + b"PROGRESS " + msg.encode("utf-8") + b"\n")


def _data(payload, msg=""):
    header = FRAME_MARK + b"DATA " + str(len(payload)).encode("ascii")
    if msg:
        header += b" " + msg.encode("utf-8")
    _write(header + b"\n" + payload)


def _read_available():
    out = bytearray()
    while _poller.poll(0):
        try:
            ch = sys.stdin.buffer.read(1)
        except AttributeError:
            ch = sys.stdin.read(1)
            if isinstance(ch, str):
                ch = ch.encode("utf-8")
        if not ch:
            break
        out += ch
    if _ble_uart is not None:
        inst = _ble_uart.instance()
        if inst is not None:
            out += inst.read_rx()
    return bytes(out)


def _read_exact(n, timeout_ms=5000, progress_cb=None, progress_every=2048):
    """Read exactly n bytes. Drains parser `_buf` (bytes that arrived alongside
    the header) first, then polls stdin + BLE. If progress_cb is given, invokes
    it as progress_cb(received, total) every ~progress_every bytes."""
    global _buf
    got = bytearray()
    if _buf:
        take = min(n, len(_buf))
        got += _buf[:take]
        _buf = _buf[take:]
    last_reported = 0
    if progress_cb is not None and len(got) >= progress_every:
        progress_cb(len(got), n)
        last_reported = len(got)
    deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
    inst = _ble_uart.instance() if _ble_uart is not None else None
    while len(got) < n:
        made_progress = False
        if _poller.poll(20):
            try:
                chunk = sys.stdin.buffer.read(min(64, n - len(got)))
            except AttributeError:
                chunk = sys.stdin.read(min(64, n - len(got)))
                if isinstance(chunk, str):
                    chunk = chunk.encode("utf-8")
            if chunk:
                got += chunk
                made_progress = True
        if inst is not None and len(got) < n:
            chunk = inst.read_rx()
            if chunk:
                need = n - len(got)
                if len(chunk) > need:
                    got += chunk[:need]
                    # Anything past `need` bytes belongs to the next frame;
                    # push it back so poll() sees it on the next tick.
                    _buf = bytearray(chunk[need:]) + _buf
                else:
                    got += chunk
                made_progress = True
        if made_progress and progress_cb is not None and len(got) - last_reported >= progress_every:
            progress_cb(len(got), n)
            last_reported = len(got)
        if not made_progress and time.ticks_diff(deadline, time.ticks_ms()) <= 0:
            return None
    if progress_cb is not None and last_reported != n:
        progress_cb(n, n)
    return bytes(got)


def _mkdirs(dirpath):
    if not dirpath or dirpath == "/":
        return None
    acc = ""
    for part in dirpath.strip("/").split("/"):
        acc += "/" + part
        try:
            os.stat(acc)
        except OSError:
            try:
                os.mkdir(acc)
            except OSError as e:
                return "mkdir " + acc + ": " + str(e)
    return None


def _handle(header):
    global _running
    if not header:
        return
    sp = header.find(" ")
    cmd = header if sp < 0 else header[:sp]
    rest = "" if sp < 0 else header[sp + 1:]

    if cmd == "PING":
        _ok("PING")
        return

    if cmd == "MTU":
        # BLE reports negotiated ATT MTU. USB CDC has no MTU concept — reply
        # with a safe large payload so web sizes writes generously.
        mtu = 512
        if _ble_uart is not None:
            inst = _ble_uart.instance()
            if inst is not None and inst.connected():
                mtu = inst.mtu()
        _ok("MTU=" + str(mtu))
        return

    if cmd == "STOP":
        runner.request_stop()
        _ok("STOP")
        return

    if cmd == "RUN":
        if _running:
            _err("RUN busy")
            return
        path = rest
        try:
            os.stat(path)
        except OSError:
            _err("no such file: " + path)
            return
        _ok("RUN " + path)
        _running = True
        err = runner.run_program(path, poll_stdin=poll)
        _running = False
        if err is None:
            _write(FRAME_MARK + b"OK done " + path.encode("utf-8") + b"\n")
        else:
            safe = err.replace("\r", " ").replace("\n", " ")
            _write(FRAME_MARK + b"ERR " + safe.encode("utf-8") + b"\n")
        if on_run_finished is not None:
            try:
                on_run_finished()
            except Exception as e:
                print("on_run_finished failed:", e)
        return

    if cmd == "READ":
        try:
            with open(rest, "rb") as f:
                payload = f.read()
            _data(payload, rest)
        except OSError as e:
            _err("read: " + str(e))
        return

    if cmd == "UPLOAD":
        parts = rest.rsplit(" ", 1)
        if len(parts) != 2:
            _err("UPLOAD: bad header")
            return
        path, len_str = parts
        try:
            n = int(len_str)
        except ValueError:
            _err("UPLOAD: bad length")
            return
        if path in _FORBIDDEN:
            _err("forbidden path: " + path)
            return
        mk_err = _mkdirs(path.rsplit("/", 1)[0])
        if mk_err is not None:
            _err(mk_err)
            return
        _ack("UPLOAD " + path + " " + str(n))
        def _cb(sent, total):
            _progress(str(sent) + "/" + str(total) + " " + path)
        payload = _read_exact(n, timeout_ms=60000, progress_cb=_cb) if n > 0 else b""
        if payload is None:
            _err("UPLOAD: timeout receiving payload")
            return
        try:
            with open(path, "wb") as f:
                f.write(payload)
        except OSError as e:
            _err("write: " + str(e))
            return
        _ok("UPLOAD " + path)
        return

    _err("unknown command: " + cmd)


def _find_mark(buf):
    """Return index of FRAME_MARK in buf, or -1."""
    n = len(buf) - _FRAME_LEN
    for i in range(n + 1):
        if buf[i] != _FRAME_FIRST:
            continue
        match = True
        for k in range(1, _FRAME_LEN):
            if buf[i + k] != FRAME_MARK[k]:
                match = False
                break
        if match:
            return i
    return -1


def poll():
    """Non-blocking; drains available stdin bytes, dispatches complete frames."""
    global _buf
    data = _read_available()
    if not data:
        return
    _buf += data
    while True:
        mark_idx = _find_mark(_buf)
        if mark_idx < 0:
            # Keep tail that might be partial mark prefix.
            if len(_buf) > _FRAME_LEN:
                _buf = _buf[-(_FRAME_LEN - 1):]
            return
        if mark_idx > 0:
            _buf = _buf[mark_idx:]
        nl_idx = -1
        for j in range(_FRAME_LEN, len(_buf)):
            if _buf[j] == 0x0a:
                nl_idx = j
                break
        if nl_idx < 0:
            return
        header = bytes(_buf[_FRAME_LEN:nl_idx]).decode("utf-8", "replace")
        _buf = _buf[nl_idx + 1:]
        _handle(header)
