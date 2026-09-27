"""HubProtocol V2 — binary frame parser. See docs/source/hub/protocol.rst.

Frame format:  [0x7E][LEN:varint][SEQ:u8][FLAGS:u8][KIND:u8][PAYLOAD:LEN bytes]

LEN  LEB128 LE, up to 5 bytes. Bit 7 = continuation; 5th byte always last.
SEQ  Host→Device: monotonic counter 0x00–0xFF. Device→Host: 0xFF = unsolicited.
FLAGS  bit 0 NO_ACK: don't reply, SEQ still valid for ordering.
KIND   see constants below.
"""
import sys
import os
import time
import uselect
import lvgl as lv

import runner
import hub as _hub
try:
    import ble_uart as _ble_uart
except ImportError:
    _ble_uart = None

# ── Kind constants ────────────────────────────────────────────────────────────
KIND_HELLO_REQ = 0x01
KIND_PING      = 0x10
KIND_MTU_REQ   = 0x11
KIND_RUN       = 0x12
KIND_STOP      = 0x13
KIND_UPLOAD    = 0x14
KIND_READ      = 0x15
KIND_LS        = 0x16
KIND_MV        = 0x17
KIND_CP        = 0x18
KIND_RM        = 0x19

KIND_HELLO     = 0x20
KIND_OK        = 0x21
KIND_ERR       = 0x22
KIND_ACK       = 0x23
KIND_PROGRESS  = 0x24
KIND_DATA      = 0x25
KIND_STDOUT    = 0x30
KIND_STDERR    = 0x31
KIND_PROG_END  = 0x32

FLAGS_NO_ACK = 0x01

FRAME_MAGIC     = 0x7E
SEQ_UNSOLICITED = 0xFF

PROTO_VER = 2  # Protocol v1.0.0

_FORBIDDEN = (
    # "/main.py", "/boot.py", "/boot.mpy", "/runner.py",
    # "/protocol.py", "/menu.py", "/listview.py",
    # "/config.py", "/battery.py", "/ble_uart.py",
)

_poller = uselect.poll()
_poller.register(sys.stdin, uselect.POLLIN)

_buf = bytearray()

# Optional hook called after every RUN completes (menu uses this to rebuild UI).
on_run_finished = None
# Optional hook called after an UPLOAD/transfer completes (no button-wait needed).
on_transfer_finished = None
_running = False

_screen = None

def set_screen(scr):
    global _screen
    _screen = scr

def _show_transfer(label):
    if _screen is None:
        return
    try:
        from listview import text_screen
        _screen.clean()
        text_screen(_screen, "Transferring", label)
        lv.timer_handler()
    except Exception:
        pass

def _restore_menu(transfer=False):
    cb = on_transfer_finished if transfer and on_transfer_finished else on_run_finished
    if cb:
        try:
            cb()
            lv.timer_handler()
        except Exception as e:
            print("_restore_menu failed:", e)

def _check_stop_incoming():
    """Check input buffer for a STOP frame between KIND_READ streaming chunks."""
    global _buf
    data = _read_available()
    if data:
        _buf = bytearray(_buf) + bytearray(data)
    for i in range(len(_buf) - 4):
        if (_buf[i] == FRAME_MAGIC and _buf[i + 1] == 0x00
                and _buf[i + 4] == KIND_STOP):
            return True
    return False

_DEBUG = False

# NO_ACK reorder buffer  seq -> (kind, flags, payload)
_no_ack_buf = {}
_no_ack_next_seq = 0
_NO_ACK_WINDOW = 16

# Set True inside _flush_no_ack so reply helpers suppress output.
_no_ack_active = False


# ── Varint helpers ────────────────────────────────────────────────────────────

def _encode_varint(n):
    """Encode n as LEB128, up to 5 bytes LE."""
    out = []
    for _ in range(4):
        b = n & 0x7F
        n >>= 7
        if n == 0:
            out.append(b)
            return bytes(out)
        out.append(b | 0x80)
    out.append(n & 0xFF)  # 5th byte, no continuation check
    return bytes(out)


def _decode_varint(buf, offset):
    """Decode LEB128 from buf[offset:]. Returns (value, new_offset) or (-1, offset)."""
    result = 0
    shift = 0
    for i in range(4):
        if offset + i >= len(buf):
            return -1, offset
        b = buf[offset + i]
        result |= (b & 0x7F) << shift
        shift += 7
        if not (b & 0x80):
            return result, offset + i + 1
    # 5th byte
    if offset + 4 >= len(buf):
        return -1, offset
    result |= buf[offset + 4] << shift
    return result, offset + 5


# ── Frame builder & transport ─────────────────────────────────────────────────

def _make_frame(kind, seq, flags, payload=b""):
    return (bytes([FRAME_MAGIC]) + _encode_varint(len(payload))
            + bytes([seq, flags, kind]) + payload)


def _write(frame):
    try:
        _hub.raw_write(frame)
    except Exception:
        pass


def _ble_sink(buf):
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
    """Enable C-level stdout framing. Idempotent. Also sends HELLO."""
    global _stdout_installed
    if not _stdout_installed:
        try:
            _hub.set_frame_sink(_ble_sink)
        except Exception:
            pass
        _hub.set_framed_output(True)
        _stdout_installed = True
        if _ble_uart is not None:
            _ble_uart.on_connect = install_stream_redirect
    # PROG_END clears stale run-in-progress state on the host after a device
    # reset or BLE reconnect (host never saw PROG_END if the device crashed).
    _prog_end(False, b"reset")
    _hello()


# ── Reply helpers ─────────────────────────────────────────────────────────────

def _as_bytes(msg):
    return msg if isinstance(msg, (bytes, bytearray)) else msg.encode("utf-8")


def _hello():
    try:
        name = getattr(_hub.board, "BOARD_NAME", "unknown")
        ver  = getattr(_hub.board, "BOARD_VERSION", "")
        fw   = getattr(_hub, "fw_version", "")
    except Exception:
        name, ver, fw = "unknown", "", ""
    payload = (bytes([PROTO_VER]) + name.encode() + b"\x00"
               + ver.encode() + b"\x00" + fw.encode() + b"\x00")
    _write(_make_frame(KIND_HELLO, SEQ_UNSOLICITED, 0, payload))


def _ok(seq, msg=b""):
    if _no_ack_active:
        return
    _write(_make_frame(KIND_OK, seq, 0, _as_bytes(msg)))


def _err(seq, msg=b""):
    if _no_ack_active:
        return
    _write(_make_frame(KIND_ERR, seq, 0, _as_bytes(msg)))


def _ack(seq, msg=b""):
    if _no_ack_active:
        return
    _write(_make_frame(KIND_ACK, seq, 0, _as_bytes(msg)))


def _progress(seq, sent, total):
    if _no_ack_active:
        return
    payload = sent.to_bytes(4, "big") + total.to_bytes(4, "big")
    _write(_make_frame(KIND_PROGRESS, seq, 0, payload))


def _data(seq, payload):
    if _no_ack_active:
        return
    _write(_make_frame(KIND_DATA, seq, 0, payload))


def _prog_end(ok, msg=b""):
    payload = bytes([1 if ok else 0]) + _as_bytes(msg)
    _write(_make_frame(KIND_PROG_END, SEQ_UNSOLICITED, 0, payload))


# ── I/O helpers ───────────────────────────────────────────────────────────────

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
    """Read exactly n bytes. Drains _buf first, then polls stdin + BLE."""
    global _buf
    got = bytearray()
    if _buf:
        take = min(n, len(_buf))
        got += _buf[:take]
        _buf = _buf[take:]
    if _DEBUG:
        print("[proto] _read_exact n=%d preloaded=%d" % (n, len(got)))
    last_reported = 0
    if progress_cb is not None and len(got) >= progress_every:
        progress_cb(len(got), n)
        last_reported = len(got)
    deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
    inst = _ble_uart.instance() if _ble_uart is not None else None
    while len(got) < n:
        made_progress = False
        if _poller.poll(0):
            need = n - len(got)
            try:
                chunk = sys.stdin.buffer.read(min(512, need))
            except AttributeError:
                chunk = sys.stdin.read(min(512, need))
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
                    _buf = bytearray(chunk[need:]) + _buf
                else:
                    got += chunk
                made_progress = True
                if _DEBUG:
                    print("[proto] BLE rx %d bytes, total %d/%d" % (len(chunk), len(got), n))
        if made_progress:
            if progress_cb is not None and len(got) - last_reported >= progress_every:
                progress_cb(len(got), n)
                last_reported = len(got)
        else:
            if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                if _DEBUG:
                    print("[proto] _read_exact TIMEOUT: got %d/%d" % (len(got), n))
                return None
            time.sleep_ms(2)
    if progress_cb is not None and last_reported != n:
        progress_cb(n, n)
    return bytes(got)


def _stream_to_file(path, n, seq, idle_timeout_ms=3000, progress_every=2048):
    """Read exactly n bytes from transport and write directly to path.

    Returns True on success, False on timeout/IO error (sends ERR reply itself).
    Caller must call _restore_menu() in either case.
    idle_timeout_ms: max ms with no incoming data before aborting.
    """
    global _buf
    mk_err = _mkdirs(path.rsplit("/", 1)[0])
    if mk_err:
        _err(seq, mk_err.encode())
        return False
    try:
        f = open(path, "wb")
    except OSError as e:
        _err(seq, ("write: " + str(e)).encode())
        return False

    remaining = n

    try:
        written = 0
        last_reported = 0
        deadline = time.ticks_add(time.ticks_ms(), idle_timeout_ms)
        inst = _ble_uart.instance() if _ble_uart is not None else None
        # Drain whatever _read_exact left in _buf first
        if _buf and remaining > 0:
            take = min(remaining, len(_buf))
            f.write(_buf[:take])
            _buf = _buf[take:]
            written += take
            remaining -= take
        while remaining > 0:
            made_progress = False
            if _poller.poll(0):
                chunk = None
                try:
                    chunk = sys.stdin.buffer.read(min(512, remaining))
                except AttributeError:
                    chunk = sys.stdin.read(min(512, remaining))
                    if isinstance(chunk, str):
                        chunk = chunk.encode("utf-8")
                if chunk:
                    f.write(chunk)
                    written += len(chunk)
                    remaining -= len(chunk)
                    made_progress = True
            if inst is not None and remaining > 0:
                chunk = inst.read_rx()
                if chunk:
                    if len(chunk) > remaining:
                        f.write(chunk[:remaining])
                        _buf = bytearray(chunk[remaining:]) + _buf
                        written += remaining
                        remaining = 0
                    else:
                        f.write(chunk)
                        written += len(chunk)
                        remaining -= len(chunk)
                    made_progress = True
            if made_progress:
                deadline = time.ticks_add(time.ticks_ms(), idle_timeout_ms)
                if written - last_reported >= progress_every:
                    _progress(seq, written, n)
                    last_reported = written
            else:
                if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                    if _DEBUG:
                        print("[proto] _stream_to_file TIMEOUT: %d/%d" % (written, n))
                    _err(seq, b"UPLOAD: timeout")
                    _discard_transport(remaining)
                    return False
                time.sleep_ms(2)
        if last_reported != n:
            _progress(seq, n, n)
    except OSError as e:
        _err(seq, ("write: " + str(e)).encode())
        _discard_transport(remaining)
        return False
    finally:
        f.close()
    return True


def _discard_transport(n, idle_timeout_ms=3000):
    """Read and discard exactly n bytes from transport.

    Called after a failed _stream_to_file to purge the remainder of the
    upload frame from BLE/USB so _buf is clean for the next poll() iteration.
    """
    global _buf
    inst = _ble_uart.instance() if _ble_uart is not None else None
    remaining = n
    if _buf and remaining > 0:
        take = min(remaining, len(_buf))
        _buf = _buf[take:]
        remaining -= take
    deadline = time.ticks_add(time.ticks_ms(), idle_timeout_ms)
    while remaining > 0:
        got = False
        if _poller.poll(0):
            try:
                chunk = sys.stdin.buffer.read(min(512, remaining))
            except AttributeError:
                chunk = sys.stdin.read(min(512, remaining))
                if isinstance(chunk, str):
                    chunk = chunk.encode("utf-8")
            if chunk:
                remaining -= min(len(chunk), remaining)
                got = True
        if inst is not None and remaining > 0:
            chunk = inst.read_rx()
            if chunk:
                remaining -= min(len(chunk), remaining)
                got = True
        if got:
            deadline = time.ticks_add(time.ticks_ms(), idle_timeout_ms)
        elif time.ticks_diff(deadline, time.ticks_ms()) <= 0:
            break
        else:
            time.sleep_ms(2)


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


# ── Command dispatch ──────────────────────────────────────────────────────────

def _handle(kind, seq, payload):
    global _running

    if kind == KIND_HELLO_REQ:
        try:
            name = getattr(_hub.board, "BOARD_NAME", "unknown")
            ver  = getattr(_hub.board, "BOARD_VERSION", "")
            fw   = getattr(_hub, "fw_version", "")
        except Exception:
            name, ver, fw = "unknown", "", ""
        p = (bytes([PROTO_VER]) + name.encode() + b"\x00"
             + ver.encode() + b"\x00" + fw.encode() + b"\x00")
        _write(_make_frame(KIND_OK, seq, 0, p))
        return

    if kind == KIND_PING:
        _ok(seq)
        if _ble_uart is not None:
            _ble_uart.adv_reset()
        return

    if kind == KIND_MTU_REQ:
        mtu = 512
        if _ble_uart is not None:
            inst = _ble_uart.instance()
            if inst is not None and inst.connected():
                mtu = inst.mtu()
        _write(_make_frame(KIND_OK, seq, 0, mtu.to_bytes(2, "big")))
        return

    if kind == KIND_STOP:
        _ok(seq)
        runner.request_stop()
        return

    if kind == KIND_RUN:
        if _running:
            _err(seq, b"RUN busy")
            return
        path = payload.decode("utf-8", "replace")
        try:
            os.stat(path)
        except OSError:
            _err(seq, ("no such file: " + path).encode())
            return
        _ok(seq)
        _running = True
        try:
            err = runner.run_program(path)
        finally:
            _running = False
        if err is None:
            _prog_end(True, path.encode())
        else:
            safe = err.replace("\r", " ").replace("\n", " ")
            _prog_end(False, safe.encode())
        if on_run_finished is not None:
            try:
                on_run_finished()
            except Exception as e:
                print("on_run_finished failed:", e)
        return

    if kind == KIND_READ:
        path = payload.decode("utf-8", "replace")
        try:
            file_size = os.stat(path)[6]
        except OSError as e:
            _err(seq, ("read: " + str(e)).encode())
            return
        _show_transfer(path)
        _ack(seq)
        try:
            header = (bytes([FRAME_MAGIC]) + _encode_varint(file_size)
                      + bytes([seq, 0, KIND_DATA]))
            _hub.raw_write(header)
            with open(path, "rb") as f:
                while True:
                    if _check_stop_incoming():
                        break  # host cancelled — stop streaming cleanly
                    chunk = f.read(512 * 4)
                    if not chunk:
                        break
                    _hub.raw_write(chunk)
        except OSError:
            pass  # frame already started — can't recover cleanly
        _restore_menu(transfer=True)
        return

    if kind == KIND_LS:
        path = payload.decode("utf-8", "replace") if payload else "/"
        try:
            entries = os.listdir(path)
        except OSError as e:
            _err(seq, ("ls: " + str(e)).encode())
            return
        _ack(seq)
        out = bytearray()
        base = path.rstrip("/")
        for name in entries:
            try:
                st = os.stat(base + "/" + name)
                is_dir = 1 if (st[0] & 0x4000) else 0
            except OSError:
                is_dir = 0
            out += bytes([is_dir]) + name.encode("utf-8") + b"\x00"
        _data(seq, bytes(out))
        return

    if kind == KIND_MV:
        if len(payload) < 2:
            _err(seq, b"MV: bad payload")
            return
        src_len = payload[0]
        if len(payload) < 1 + src_len + 1:
            _err(seq, b"MV: truncated")
            return
        src = payload[1:1 + src_len].decode("utf-8", "replace")
        dst_len = payload[1 + src_len]
        dst = payload[2 + src_len:2 + src_len + dst_len].decode("utf-8", "replace")
        try:
            os.rename(src, dst)
            _ok(seq)
        except OSError as e:
            _err(seq, ("mv: " + str(e)).encode())
        return

    if kind == KIND_CP:
        if len(payload) < 2:
            _err(seq, b"CP: bad payload")
            return
        src_len = payload[0]
        if len(payload) < 1 + src_len + 1:
            _err(seq, b"CP: truncated")
            return
        src = payload[1:1 + src_len].decode("utf-8", "replace")
        dst_len = payload[1 + src_len]
        dst = payload[2 + src_len:2 + src_len + dst_len].decode("utf-8", "replace")
        _ack(seq)
        try:
            with open(src, "rb") as f:
                data = f.read()
            mk_err = _mkdirs(dst.rsplit("/", 1)[0])
            if mk_err:
                _err(seq, mk_err.encode())
                return
            with open(dst, "wb") as f:
                f.write(data)
            _ok(seq)
        except OSError as e:
            _err(seq, ("cp: " + str(e)).encode())
        return

    if kind == KIND_RM:
        path = payload.decode("utf-8", "replace")
        try:
            os.remove(path)
            _ok(seq)
        except OSError as e:
            _err(seq, ("rm: " + str(e)).encode())
        return

    _err(seq, b"unknown kind")


# ── NO_ACK reorder buffer ─────────────────────────────────────────────────────

def _flush_no_ack():
    global _no_ack_next_seq, _no_ack_active
    # In-order drain
    while _no_ack_next_seq in _no_ack_buf:
        k, _f, p = _no_ack_buf.pop(_no_ack_next_seq)
        _no_ack_next_seq = (_no_ack_next_seq + 1) & 0xFF
        _no_ack_active = True
        try:
            _handle(k, SEQ_UNSOLICITED, p)
        finally:
            _no_ack_active = False
    # Stale flush: oldest entry > WINDOW ahead of expected
    while _no_ack_buf:
        oldest = min(_no_ack_buf.keys(), key=lambda s: (s - _no_ack_next_seq) & 0xFF)
        if ((oldest - _no_ack_next_seq) & 0xFF) > _NO_ACK_WINDOW:
            k, _f, p = _no_ack_buf.pop(oldest)
            _no_ack_next_seq = (oldest + 1) & 0xFF
            _no_ack_active = True
            try:
                _handle(k, SEQ_UNSOLICITED, p)
            finally:
                _no_ack_active = False
        else:
            break


# ── Poll loop ─────────────────────────────────────────────────────────────────

def poll():
    """Non-blocking; drains available stdin bytes, dispatches complete frames."""
    global _buf
    data = _read_available()
    if data:
        _buf += data

    while True:
        # ── Find MAGIC ────────────────────────────────────────────────────────
        magic_idx = -1
        for i in range(len(_buf)):
            if _buf[i] == FRAME_MAGIC:
                magic_idx = i
                break
        if magic_idx < 0:
            _buf = bytearray()
            return
        if magic_idx > 0:
            _buf = _buf[magic_idx:]

        # ── Decode varint LEN ─────────────────────────────────────────────────
        if len(_buf) < 2:
            return
        length, hdr_end = _decode_varint(_buf, 1)
        if length < 0:
            return  # need more bytes

        # ── Read fixed header: SEQ, FLAGS, KIND ───────────────────────────────
        if len(_buf) < hdr_end + 3:
            return
        seq   = _buf[hdr_end]
        flags = _buf[hdr_end + 1]
        kind  = _buf[hdr_end + 2]
        _buf  = _buf[hdr_end + 3:]

        # ── UPLOAD: send ACK before reading (potentially large) payload ───────
        if kind == KIND_UPLOAD:
            if _running:
                _err(seq, b"busy")
                return
            if _DEBUG:
                print("[proto] UPLOAD seq=%d payload_len=%d" % (seq, length))
            _ack(seq)
            _show_transfer("upload...")
            if _DEBUG:
                print("[proto] ACK sent")
            # Read path header (1-byte len + path) — small, fits in memory.
            hdr = _read_exact(1, timeout_ms=3000)
            if hdr is None:
                _restore_menu(transfer=True)
                return
            path_len = hdr[0]
            path_bytes = _read_exact(path_len, timeout_ms=3000) if path_len else b""
            if path_len and path_bytes is None:
                _restore_menu(transfer=True)
                return
            path = path_bytes.decode("utf-8", "replace") if path_bytes else ""
            data_len = length - 1 - path_len
            if _DEBUG:
                print("[proto] UPLOAD path=%s data_len=%d" % (path, data_len))
            if not path:
                _err(seq, b"UPLOAD: empty path")
                _restore_menu(transfer=True)
            elif path in _FORBIDDEN:
                _err(seq, ("forbidden path: " + path).encode())
                _restore_menu(transfer=True)
            elif data_len < 0:
                _err(seq, b"UPLOAD: bad path_len")
                _restore_menu(transfer=True)
            else:
                ok = _stream_to_file(path, data_len, seq)
                if ok:
                    _ok(seq)
                _restore_menu(transfer=True)
        else:
            # ── Read payload ──────────────────────────────────────────────────
            if length > 0:
                payload = _read_exact(length, timeout_ms=60000)
                if payload is None:
                    return
            else:
                payload = b""

            # ── Dispatch ──────────────────────────────────────────────────────
            if flags & FLAGS_NO_ACK:
                _no_ack_buf[seq] = (kind, flags, payload)
                _flush_no_ack()
            else:
                _handle(kind, seq, payload)

        # Check for more frames
        data = _read_available()
        if data:
            _buf += data
