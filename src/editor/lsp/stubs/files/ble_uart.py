"""BLE Nordic UART Service peripheral.

Bridged into HubProtocol via protocol.py directly (not os.dupterm — MP dupterm
rejects Python-level streams). Central RX writes → `read_rx()` returns bytes.
Device replies via `write_tx(bytes)` → NOTIFY on TX characteristic.
See docs/PROTOCOL.md section 1.1.
"""
import bluetooth
from micropython import const

_IRQ_CENTRAL_CONNECT = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE = const(3)
_IRQ_MTU_EXCHANGED = const(21)

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
_RX_ATT_BUF = 512


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
    def __init__(self, name="LEGO Hub"):
        self._ble = bluetooth.BLE()
        self._ble.active(True)
        self._ble.config(gap_name=name)
        try:
            self._ble.config(mtu=185)
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
        elif event == _IRQ_CENTRAL_DISCONNECT:
            conn_handle, _, _ = data
            self._conns.discard(conn_handle)
            self._mtu = 23
            self._advertise()
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
            _, mtu = data
            self._mtu = mtu

    def read_rx(self):
        """Return pending RX bytes (drains buffer). Empty bytes if none."""
        if not self._rx:
            return b""
        out = bytes(self._rx)
        self._rx = bytearray()
        return out

    def write_tx(self, buf):
        """Send bytes as ATT-MTU-chunked NOTIFY on TX to all connected centrals."""
        if not self._conns:
            return len(buf)
        chunk_max = max(20, self._mtu - 3)
        mv = memoryview(buf)
        fails = 0
        pieces = 0
        for i in range(0, len(mv), chunk_max):
            piece = bytes(mv[i:i + chunk_max])
            pieces += 1
            for h in tuple(self._conns):
                try:
                    self._ble.gatts_notify(h, self._tx_h, piece) # type: ignore
                except OSError as e:
                    fails += 1
        return len(buf)

    def connected(self):
        return bool(self._conns)

    def mtu(self):
        """Effective ATT MTU from most recent MTU exchange (23 pre-negotiation)."""
        return self._mtu


_instance = None


def start(name="LEGO Hub"):
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
