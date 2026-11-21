"""The physical ports on your hub (``hub.ports.A`` …).

They work exactly like :class:`lpf2.port`, plus a few extras such as
:meth:`port.forceDeviceType` for motors that don't identify themselves.
"""

from lpf2 import port as _port
from lpf2 import mode
from lpf2.virtual import device as _virtual_device
from typing import Optional, Sequence

class port(_port):
    """A physical port on your hub, like ``hub.ports.A``.

    Everything from :class:`lpf2.port` works here too.
    """
    def forceDeviceType(self, type: int) -> None:
        """Tell the port what's plugged in, for motors that can't say it themselves.

        For example LEGO MINDSTORMS EV3 motors:
        ``hub.ports.A.forceDeviceType(device_type.EV3_LARGE_MOTOR)``, then
        drive them with :meth:`startPower`. Call :meth:`enable` to go back to
        detecting devices automatically.
        """
        ...
    def writeData(self, mode: int, buf: bytes) -> int:
        """Advanced: send raw bytes to the device for ``mode``. Returns 0 if it worked."""
        ...
    def startPower(self, pw: int) -> None:
        """Run a motor at a power from -100 to 100.

        Positive turns one way, negative the other, ``0`` stops. Works
        with every motor, even simple ones without a rotation sensor.
        """
        ...
    def setAccTime(self, time: int, profile: int) -> None:
        """How long (milliseconds) the motor takes to speed up, stored in slot ``profile`` (0..15).

        Use it with the ``useProfile`` option of the speed functions.
        """
        ...
    def setDecTime(self, time: int, profile: int) -> None:
        """How long (milliseconds) the motor takes to slow down, stored in slot ``profile`` (0..15)."""
        ...
    def startSpeed(self, speed: int = 100, maxPower: int = 100, useProfile: int = 0) -> None:
        """Run the motor at a steady ``speed`` from -100 to 100 until told otherwise.

        Unlike :meth:`startPower` the motor works harder uphill to keep
        its speed (needs a motor with a rotation sensor). ``maxPower``
        (0..100) limits how hard it may push. ``useProfile`` picks the
        speed-up/slow-down times set with :meth:`setAccTime` /
        :meth:`setDecTime` (``0x21`` = speed up with slot 1, slow down
        with slot 2).
        """
        ...
    def startSpeedForTime(self, time: int, speed: int = 100, maxPower: int = 100, endState: int = 0, useProfile: int = 0) -> None:
        """Run the motor at ``speed`` for ``time`` milliseconds, then stop.

        ``endState`` says what the motor does afterwards: ``0`` = let it
        spin freely (coast), ``127`` = brake, ``126`` = hold its position.
        """
        ...
    def startSpeedForDegrees(self, degrees: int, speed: int = 100, maxPower: int = 100, endState: int = 0, useProfile: int = 0) -> None:
        """Turn the motor by ``degrees`` (360 = one full turn), then stop.

        Give a positive number of degrees; make ``speed`` negative to turn
        the other way. ``endState`` says what the motor does afterwards: ``0`` = let it
        spin freely (coast), ``127`` = brake, ``126`` = hold its position.
        """
        ...
    def gotoAbsPosition(self, absPos: int, speed: int = 100, maxPower: int = 100, endState: int = 0, useProfile: int = 0) -> None:
        """Turn the motor to position ``absPos`` degrees, then stop.

        Position 0 is where it was at start-up or where you last called
        :meth:`presetEncoder`. ``speed`` is 0..100. ``endState`` says what the motor does afterwards: ``0`` = let it
        spin freely (coast), ``127`` = brake, ``126`` = hold its position.
        """
        ...
    def presetEncoder(self, pos: int) -> None:
        """Stop the motor and say "this position is now ``pos`` degrees" (usually 0)."""
        ...
    def setRgbColorIdx(self, idx: int) -> None:
        """Set a light to one of the colors in :mod:`lpf2.color`, e.g. ``color.RED``."""
        ...
    def setRgbColor(self, r: int, g: int, b: int) -> None:
        """Set a light to any color by mixing red, green and blue, each 0..255."""
        ...
    def setMode(self, mode: int, delta: float = 1.0) -> int:
        """Advanced: choose which kind of value the device should report (its "mode").

        ``delta`` is how much the value must change before an update is
        sent (0 = always). Returns 0 if it worked. The device classes in
        :mod:`lpf2.devices` pick modes for you.
        """
        ...
    def setModeCombo(self, idx: int, deltas: Sequence[float] = ()) -> int:
        """Advanced: have the device report several modes at once.

        ``idx`` picks one of the device's built-in combinations;
        ``deltas`` gives the minimum change for each mode in it. Returns
        0 if it worked.
        """
        ...
    def isDeviceConnected(self) -> bool:
        """``True`` if something is plugged into this port."""
        ...
    def getValue(self, mode: int, dataSet: int) -> float:
        """Read a value from the device: value number ``dataSet`` (starting at 0) of ``mode``.

        Use this for devices that have no special class in
        :mod:`lpf2.devices`; otherwise their own functions are easier.
        """
        ...
    def getValueStr(self, mode: int) -> str:
        """The value(s) of ``mode`` as readable text."""
        ...
    def getDeviceType(self) -> int:
        """A number saying what kind of device is plugged in — compare it with :mod:`lpf2.device_type`."""
        ...
    def getModeCount(self) -> int:
        """Total number of modes exposed by the device."""
        ...
    def getViewCount(self) -> int:
        """Number of modes the device would show in the LEGO app."""
        ...
    def getMode(self, num: int) -> Optional[mode]:
        """:class:`mode` descriptor for mode ``num`` or ``None``."""
        ...
    def getModeComboCount(self) -> int:
        """Number of active mode-combo entries."""
        ...
    def getModeCombo(self, combo: int) -> int:
        """Mode-combo bitmask at index ``combo``. Bit N = mode N."""
        ...
    def getInputModes(self) -> int:
        """Bitmask of modes that produce values."""
        ...
    def getOutputModes(self) -> int:
        """Bitmask of modes that accept values."""
        ...
    def getCapabilities(self) -> int:
        """Capability bitmask (bit 0x04 = combinable, if the device has combos)."""
        ...
    def getInfoStr(self) -> str:
        """Everything the port knows about its device, as text. Handy to ``print`` while exploring."""
        ...
    def speedToRaw(self, speed: int) -> int:
        """Advanced: convert a -100..100 speed to the byte (0..255) the device uses."""
        ...
    def rawToSpeed(self, raw: int) -> int:
        """Advanced: convert a device byte (0..255) back to a -100..100 speed."""
        ...


class emulated_port:
    """Advanced: turn one of your hub's ports around, so it acts like a device.

    Connect that port with a cable to another LEGO hub, and the other hub
    sees whatever pretend device you attach (see :class:`lpf2.virtual.device`).
    For example, your hub can pretend to be a port expander.
    """

    def __init__(self, port: port) -> None:
        """Use ``port`` (e.g. ``hub.ports.F``) as a device port.

        The port stops detecting devices; call ``port.enable()`` later to
        use it normally again.
        """
        ...

    def init(self) -> None:
        """Start waiting for the other hub to connect. Call once, after :meth:`attachDevice`."""
        ...

    def update(self) -> None:
        """Advanced: process news right now. Not needed — this already happens in the background."""
        ...

    def isHostConnected(self) -> bool:
        """``True`` once the other hub has recognised the device and is talking to it."""
        ...

    def setSlowEnumeration(self, slow: bool) -> None:
        """Pass ``True`` when connecting to a LEGO MINDSTORMS EV3 instead of a Powered Up hub.

        Call it before :meth:`init`.
        """
        ...

    def isSlowEnumeration(self) -> bool:
        """``True`` if set up for an EV3 (see :meth:`setSlowEnumeration`)."""
        ...

    def attachDevice(self, device: _virtual_device) -> None:
        """Choose the pretend device the other hub will see — a :class:`lpf2.virtual.device` or a port expander."""
        ...

    def detachDevice(self) -> None:
        """Remove the pretend device again."""
        ...
