"""
Hub/port stubs for Pyodide live-mode execution.
Hardware calls forward to the main thread via JS bridge functions injected by pyodideRunner.ts:
  _b2op_send_cmd(cmdId, args)       -> None (fire-and-forget binary commands)
  _b2op_send_cmd_data(cmdId, args)  -> list[float] (returns sensor data)
  _b2op_exec_repl(code)             -> None (exec Python on device for calls without a binary cmd)
"""
import asyncio
from js import _b2op_send_cmd, _b2op_send_cmd_data, _b2op_exec_repl  # noqa: F401  injected at runtime

_PORT_IDX = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5, "LED": 6, "Accel": 7, "Gyro": 8}


def _u16be(v):
    return [(v >> 8) & 0xFF, v & 0xFF]


def _u32be(v):
    return [(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF]


def _i32be(v):
    return _u32be(v & 0xFFFFFFFF)


# ── lpf2 constants ────────────────────────────────────────────────────────────

class _Color:
    BLACK = 0; PINK = 1; PURPLE = 2; BLUE = 3; LIGHTBLUE = 4
    CYAN = 5; GREEN = 6; YELLOW = 7; ORANGE = 8; RED = 9; WHITE = 10
    NUM_COLORS = 11; NONE = 255


class _DeviceType:
    UNKNOWNDEVICE = 0; SIMPLE_MEDIUM_LINEAR_MOTOR = 1; TRAIN_MOTOR = 2
    LIGHT = 8; VOLTAGE_SENSOR = 20; CURRENT_SENSOR = 21; PIEZO_BUZZER = 22
    HUB_LED = 23; TILT_SENSOR = 34; MOTION_SENSOR = 35
    COLOR_DISTANCE_SENSOR = 37; MEDIUM_LINEAR_MOTOR = 38
    MOVE_HUB_MEDIUM_LINEAR_MOTOR = 39; MOVE_HUB_TILT_SENSOR = 40
    DUPLO_TRAIN_BASE_MOTOR = 41; TECHNIC_LARGE_LINEAR_MOTOR = 46
    TECHNIC_XLARGE_LINEAR_MOTOR = 47; TECHNIC_MEDIUM_ANGULAR_MOTOR = 48
    TECHNIC_LARGE_ANGULAR_MOTOR = 49; TECHNIC_MEDIUM_HUB_GEST_SENSOR = 54
    REMOTE_CONTROL_BUTTON = 55; TECHNIC_MEDIUM_HUB_ACCELEROMETER = 57
    TECHNIC_MEDIUM_HUB_GYRO_SENSOR = 58; TECHNIC_MEDIUM_HUB_TILT_SENSOR = 59
    TECHNIC_MEDIUM_HUB_TEMPERATURE_SENSOR = 60; TECHNIC_COLOR_SENSOR = 61
    TECHNIC_DISTANCE_SENSOR = 62; TECHNIC_FORCE_SENSOR = 63
    TECHNIC_MEDIUM_ANGULAR_MOTOR_GREY = 75; TECHNIC_LARGE_ANGULAR_MOTOR_GREY = 76
    EV3_MEDIUM_MOTOR = 100; EV3_LARGE_MOTOR = 101


class lpf2:
    color = _Color()
    device_type = _DeviceType()


# ── Port/device stubs ─────────────────────────────────────────────────────────

class _Device:
    def __init__(self, port_idx):
        self._p = port_idx

    async def startPower(self, power):
        await _b2op_send_cmd(0x01, [self._p, power & 0xFF])

    async def startSpeed(self, speed, max_power=100):
        await _b2op_send_cmd(0x02, [self._p, speed & 0xFF, max_power])

    async def startSpeedForTime(self, ms, speed=100, max_power=100, end_state=0):
        await _b2op_send_cmd(0x03, [self._p, *_u16be(ms), speed & 0xFF, max_power, end_state])

    async def startSpeedForDegrees(self, deg, speed=100, max_power=100, end_state=0):
        await _b2op_send_cmd(0x04, [self._p, *_u32be(deg), speed & 0xFF, max_power, end_state])

    async def gotoAbsPosition(self, pos, speed=100, max_power=100, end_state=0):
        await _b2op_send_cmd(0x05, [self._p, *_i32be(pos), speed, max_power, end_state])

    async def presetEncoder(self, pos=0):
        await _b2op_send_cmd(0x06, [self._p, *_i32be(pos)])

    async def getValue(self, mode=0, dataset=0):
        return await _b2op_send_cmd_data(0x10, [self._p, mode, dataset])

    async def setRgb(self, r, g, b):
        await _b2op_send_cmd(0x09, [self._p, r, g, b])

    async def setRgbIdx(self, idx):
        await _b2op_send_cmd(0x0A, [self._p, idx])

    async def setMode(self, mode):
        await _b2op_send_cmd(0x0B, [self._p, mode])


class _Port:
    def __init__(self, name):
        self._idx = _PORT_IDX[name]
        self._dev = _Device(self._idx)

    def device(self):
        return self._dev


class _Ports:
    A = _Port("A")
    B = _Port("B")
    C = _Port("C")
    D = _Port("D")
    E = _Port("E")
    F = _Port("F")
    LED = _Port("LED")
    Accel = _Port("Accel")
    Gyro = _Port("Gyro")


# ── Hub LED ───────────────────────────────────────────────────────────────────

class _HubLed:
    """Hub built-in RGB LED. Uses binary cmds (port index 6 = LED)."""

    async def setColorIdx(self, idx):
        await _b2op_send_cmd(0x0A, [6, int(idx)])

    async def setRgb(self, r, g, b):
        await _b2op_send_cmd(0x09, [6, int(r), int(g), int(b)])


# ── Hub ───────────────────────────────────────────────────────────────────────

class hub:
    ports = _Ports()
    led = _HubLed()

    @staticmethod
    async def poweroff():
        await _b2op_exec_repl("hub.poweroff()")

    @staticmethod
    async def reboot():
        await _b2op_exec_repl("hub.reboot()")
