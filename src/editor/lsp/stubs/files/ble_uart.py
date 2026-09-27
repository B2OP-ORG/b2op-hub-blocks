"""BLE Nordic UART Service peripheral.

Bridged into HubProtocol via protocol.py directly (not os.dupterm — MP dupterm
rejects Python-level streams). Central RX writes → `read_rx()` returns bytes.
Device replies via `write_tx(bytes)` → NOTIFY on TX characteristic.
See docs/PROTOCOL.md section 1.1.
"""
import bluetooth
import time as _time
from micropython import const
try:
    from hub import _ble_drain as _hub_ble_drain
except (ImportError, AttributeError):
    _hub_ble_drain = None
try:
    from hub import ble_conn_update as _hub_ble_conn_update
    from hub import ble_set_phy_2m as _hub_ble_set_phy_2m
except (ImportError, AttributeError):
    _hub_ble_conn_update = None
    _hub_ble_set_phy_2m = None

_IRQ_CENTRAL_CONNECT = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE = const(3)
_IRQ_MTU_EXCHANGED = const(21)
_IRQ_CONNECTION_UPDATE = const(27)

# Max accepted interval in 1.25ms units.
# Central exceeding this triggers a re-request.
_CONN_ITVL_MAX_UNITS = const(15)

_FLAG_WRITE = const(0x0008)
_FLAG_WRITE_NO_RESPONSE = const(0x0004)
_FLAG_NOTIFY = const(0x0010)

_UART_UUID = bluetooth.UUID("6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
_UART_TX = (bluetooth.UUID("6E400003-B5A3-F393-E0A9-E50E24DCCA9E"), _FLAG_NOTIFY)
_UART_RX = (
    bluetooth.UUID("6E400002-B5A3-F393-E0A9-E50E24DCCA9E"),
    _FLAG_WRITE | _FLAG_WRITE_NO_RESPONSE,
)
_UART_SVC = (_UART_UUID, (_UART_TX, _UART_RX))

_ADV_INTERVAL_US = const(500000)
_RX_BUF_MAX = 4096
_RX_ATT_BUF = 2056  # 4 writes × 514 bytes at MTU 517; drain happens in write_tx retry loop

_DEBUG = False

_ADV_TIMEOUT_MS = 60_000
_adv_deadline_ms = None  # ticks_ms deadline; None = stopped intentionally


def _adv_payload(name, service_uuid):
    payload = bytearray()

    def _append(t, v):
        payload.extend(bytes((len(v) + 1, t)))
        payload.extend(v)

    _append(0x01, b"\x06")  # flags: LE general disc + BR/EDR not supported
    if name:
        _append(0x09, name.encode())
    b = bytes(service_uuid)
    _append(0x07 if len(b) == 16 else 0x03, b)
    return payload


class BLEUART:
    def __init__(self, name="B2OP Hub"):
        self._ble = bluetooth.BLE()
        self._ble.active(True)
        self._ble.config(gap_name=name)
        try:
            self._ble.config(mtu=517)
        except Exception:
            pass
        self._ble.irq(self._irq)
        result = self._ble.gatts_register_services((_UART_SVC,))
        handles = result[0]
        # First handle in the tuple = TX value (declared first in _UART_SVC),
        # last handle = RX value. Middle handle (if present) is TX CCCD.
        self._tx_h = handles[0]
        self._rx_h = handles[-1]
        self._ble.gatts_set_buffer(self._rx_h, _RX_ATT_BUF, True)
        self._conns = set()
        self._rx = bytearray()
        self._mtu = 23
        self._name = name
        self._advertise()

    def _advertise(self):
        # 16-byte NUS UUID + flags leaves no room for a name in the 31-byte adv;
        # put the name in the scan response.
        adv = _adv_payload(name=None, service_uuid=_UART_UUID)
        n = self._name.encode()
        resp = bytearray()
        resp.extend(bytes((len(n) + 1, 0x09)))
        resp.extend(n)
        try:
            self._ble.gap_advertise(_ADV_INTERVAL_US, adv_data=adv, resp_data=resp) # type: ignore
        except OSError:
            pass

    def _irq(self, event, data):
        if event == _IRQ_CENTRAL_CONNECT:
            conn_handle, _, _ = data
            self._conns.add(conn_handle)
            # ATT MTU exchange is spec-allowed from either role. Some centrals
            # (Web Bluetooth on certain browsers, older BlueZ) never initiate,
            # leaving MTU at 23 (20 B payload/notify). Request it ourselves so
            # NUS notifies can use the full 182 B/frame at MTU 185.
            try:
                self._ble.gattc_exchange_mtu(conn_handle)  # type: ignore
            except Exception:
                pass
            # Request 2M PHY — doubles raw throughput; central may ignore.
            if _hub_ble_set_phy_2m is not None:
                try:
                    _hub_ble_set_phy_2m(conn_handle)
                except Exception:
                    pass
        elif event == _IRQ_CENTRAL_DISCONNECT:
            conn_handle, _, _ = data
            self._conns.discard(conn_handle)
            self._mtu = 23
            self._rx = bytearray()
            # Re-advertising is handled by NimBLE-cpp advertiseOnDisconnect(true)
            # set in ble_gatts.cpp. Calling gap_advertise from Python (mp_task)
            # after disconnect races with the NimBLE host cleanup and crashes.
        elif event == _IRQ_GATTS_WRITE:
            _, value_handle = data
            # Some MP builds report a handle that doesn't match the tuple
            # returned by gatts_register_services. TX is notify-only, so any
            # GATTS_WRITE we get is either CCCD (empty read) or actual RX data.
            chunk = self._ble.gatts_read(value_handle)
            if chunk:
                if len(self._rx) + len(chunk) > _RX_BUF_MAX:
                    del self._rx[:len(chunk)]
                self._rx.extend(chunk)
        elif event == _IRQ_MTU_EXCHANGED:
            conn_handle, mtu = data
            self._mtu = mtu
            # Request shorter connection interval now that MTU is settled.
            # 7.5ms min / 15ms max — central accepts or ignores.
            if _hub_ble_conn_update is not None:
                try:
                    _hub_ble_conn_update(conn_handle, 8, 15)
                except Exception:
                    pass
        elif event == _IRQ_CONNECTION_UPDATE:
            # data: (conn_handle, conn_interval, conn_latency, supervision_timeout, status)
            try:
                conn_handle   = data[0]
                conn_interval = data[1]
                status        = data[4]
            except Exception:
                return
            # Central renegotiated to a longer interval (common after a burst
            # transfer). Re-request our preferred range if it exceeds the max.
            if (status == 0 and conn_interval > _CONN_ITVL_MAX_UNITS
                    and _hub_ble_conn_update is not None):
                try:
                    _hub_ble_conn_update(conn_handle, 8, 15)
                except Exception:
                    pass

    def read_rx(self):
        """Return pending RX bytes (drains buffer). Empty bytes if none."""
        # Pump BLE event queue directly (bypasses MP scheduler — safe when called
        # from hub_poll_node_cb with sched_state locked, i.e. from _read_exact).
        if _hub_ble_drain is not None:
            _hub_ble_drain()
        if not self._rx:
            return b""
        out = bytes(self._rx)
        self._rx = bytearray()
        if _DEBUG:
            print("[ble] read_rx: %d bytes" % len(out))
        return out

    def write_tx(self, buf):
        """Send bytes as ATT-MTU-chunked NOTIFY on TX to all connected centrals."""
        if not self._conns:
            return len(buf)
        chunk_max = max(20, self._mtu - 3)
        mv = memoryview(buf)
        for i in range(0, len(mv), chunk_max):
            piece = bytes(mv[i:i + chunk_max])
            for h in tuple(self._conns):
                for _ in range(500):  # retry up to ~1s; never drop
                    try:
                        self._ble.gatts_notify(h, self._tx_h, piece)  # type: ignore
                        break
                    except OSError:
                        if h not in self._conns:
                            break  # disconnected
                        if _hub_ble_drain is not None:
                            _hub_ble_drain()
                        _time.sleep_ms(2)
        return len(buf)

    def stop_advertise(self):
        try:
            self._ble.gap_advertise(None) # type: ignore
        except OSError:
            pass

    def connected(self):
        return bool(self._conns)

    def mtu(self):
        """Effective ATT MTU from most recent MTU exchange (23 pre-negotiation)."""
        return self._mtu


_instance = None


def start(name="B2OP Hub"):
    global _instance
    if _instance is not None:
        return _instance
    try:
        _instance = BLEUART(name)
    except Exception as e:
        print("ble start failed:", e)
        _instance = None
    return _instance


def instance():
    return _instance


def adv_reset():
    global _adv_deadline_ms
    _adv_deadline_ms = _time.ticks_add(_time.ticks_ms(), _ADV_TIMEOUT_MS)


def adv_start():
    global _adv_deadline_ms
    if _instance is not None:
        _instance._advertise()
    _adv_deadline_ms = _time.ticks_add(_time.ticks_ms(), _ADV_TIMEOUT_MS)


def adv_stop():
    global _adv_deadline_ms
    _adv_deadline_ms = None
    if _instance is not None:
        _instance.stop_advertise()


def adv_remaining_ms():
    if _adv_deadline_ms is None:
        return None
    return max(0, _time.ticks_diff(_adv_deadline_ms, _time.ticks_ms()))


def adv_poll():
    if _instance is None:
        return
    if _adv_deadline_ms is None:
        # Intentionally stopped. NimBLE advertiseOnDisconnect may have restarted it — re-stop.
        if not _instance.connected():
            _instance.stop_advertise()
    else:
        if _time.ticks_diff(_adv_deadline_ms, _time.ticks_ms()) <= 0:
            adv_stop()
