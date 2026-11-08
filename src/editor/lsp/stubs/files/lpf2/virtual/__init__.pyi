"""Advanced: pretend devices that you program yourself in Python.

Make a :class:`device` (usually your own class based on it), put it in a
:class:`port`, and it behaves like a real LEGO device. Combine it with
:class:`lpf2.hub_emulation` so a LEGO app can "see" your custom
gadget, or put it behind a port expander.
"""

from __future__ import annotations
from typing import Sequence
from lpf2 import port as _port
from lpf2 import device_descriptor

class port(_port):
    """A pretend port that holds a pretend :class:`device`.

    It works like any other :class:`lpf2.port`; commands sent to it go to
    your device's functions.
    """

    def attachDevice(self, device: device) -> None:
        """Put ``device`` into this port (replacing any device already there)."""
        ...
    def detachDevice(self) -> None:
        """Take the device out; the port is then empty."""
        ...

class device:
    """A pretend device whose behaviour you write in Python.

    Make your own class based on it and write functions like
    :meth:`startPower` to decide what happens when someone drives your
    "motor". By default every command is just printed to the log, and
    calling ``super().startPower(pw)`` from your version does the same.
    Describe its modes with a :class:`lpf2.device_descriptor`.
    """

    def setModeData(self, mode: int, buf: bytes) -> None:
        """Publish a new value (as raw bytes) for ``mode`` — like a sensor reporting a reading."""
        ...
    def setWriteDataCallback(self, cb: object) -> None:
        """Run ``cb(mode, data, userData)`` whenever raw data is sent to the device."""
        ...
    def startPower(self, pw: int) -> None:
        """Called when someone sets the motor power (-100..100). Default: print it to the log."""
        ...
    def setAccTime(self, time: int, profile: int) -> None:
        """Called when someone sets the speed-up time. Default: print it to the log."""
        ...
    def setDecTime(self, time: int, profile: int) -> None:
        """Called when someone sets the slow-down time. Default: print it to the log."""
        ...
    def startSpeed(self, speed: int = 100, maxPower: int = 100, useProfile: int = 0) -> None:
        """Called when someone asks for a steady speed. Default: print it to the log."""
        ...
    def startSpeedForTime(self, time: int, speed: int = 100, maxPower: int = 100, endState: int = 0, useProfile: int = 0) -> None:
        """Called when someone asks to run for a time. Default: print it to the log."""
        ...
    def startSpeedForDegrees(self, degrees: int, speed: int = 100, maxPower: int = 100, endState: int = 0, useProfile: int = 0) -> None:
        """Called when someone asks to turn by some degrees. Default: print it to the log."""
        ...
    def gotoAbsPosition(self, absPos: int, speed: int = 100, maxPower: int = 100, endState: int = 0, useProfile: int = 0) -> None:
        """Called when someone asks to go to a position. Default: print it to the log."""
        ...
    def presetEncoder(self, pos: int) -> None:
        """Called when someone resets the position. Default: print it to the log."""
        ...
    def writeData(self, mode: int, buf: bytes) -> int:
        """Called when raw data is sent to ``mode``. Default: run the :meth:`setWriteDataCallback` function, or print it. Return 0 if OK."""
        ...
    def setMode(self, mode: int, delta: float = 1.0) -> int:
        """Called when someone picks a mode. Default: print it to the log. Returns 0."""
        ...
    def setModeCombo(self, idx: int, deltas: Sequence[float] = ()) -> int:
        """Called when someone picks a mode combination. Default: print it to the log. Returns 0."""
        ...
    def __init__(self, descriptor: device_descriptor) -> None:
        """Create a pretend device described by ``descriptor`` (its modes and versions)."""
        ...
