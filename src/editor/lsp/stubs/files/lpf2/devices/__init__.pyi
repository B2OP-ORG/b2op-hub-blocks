"""The motors, sensors and lights you can plug into a port.

You don't create these yourself: ask the port with
``hub.ports.A.device()`` and you get the right one for whatever is
plugged in, with functions that fit that device.
"""

from __future__ import annotations
from lpf2 import port as _port

def registerDefault() -> None:
    """Advanced: teach the hub about the standard LEGO devices again.

    This already happens automatically; you never need to call it.
    """
    ...

class basic_motor:
    """A simple motor without a rotation sensor, like a train motor. You can set its power, but not its exact speed or position."""

    def startPower(self, pw: int) -> None:
        """Run the motor at a power from -100 to 100. The sign sets the direction; ``0`` stops."""
        ...
    def getDeviceType(self) -> int:
        """A number saying what kind of device this is (see :mod:`lpf2.device_type`)."""
        ...
    def name(self) -> str:
        """The device's name as text, e.g. ``"DC Motor (dumb)"``."""
        ...

class encoder_motor:
    """A motor with a rotation sensor (most Technic and BOOST motors).

    It can hold a steady speed, turn an exact number of degrees, or go to
    a position.
    """

    def startPower(self, pw: int) -> None:
        """Run the motor at a power from -100 to 100. The sign sets the direction; ``0`` stops."""
        ...
    def setAccTime(self, time: int, profile: int) -> None:
        """How long (ms) the motor takes to speed up, stored in slot ``profile`` (0..15)."""
        ...
    def setDecTime(self, time: int, profile: int) -> None:
        """How long (ms) the motor takes to slow down, stored in slot ``profile`` (0..15)."""
        ...
    def startSpeed(self, speed: int = 100, maxPower: int = 100, useProfile: int = 0) -> None:
        """Keep turning at ``speed`` (-100..100) until told otherwise. ``maxPower`` (0..100) limits how hard it pushes."""
        ...
    def startSpeedForTime(self, time: int, speed: int = 100, maxPower: int = 100, endState: int = 0, useProfile: int = 0) -> None:
        """Turn at ``speed`` for ``time`` milliseconds, then stop.

        ``endState``: ``0`` = coast, ``127`` = brake, ``126`` = hold position.
        """
        ...
    def startSpeedForDegrees(self, degrees: int, speed: int = 100, maxPower: int = 100, endState: int = 0, useProfile: int = 0) -> None:
        """Turn by ``degrees`` (360 = one full turn), then stop.

        Make ``speed`` negative to turn the other way. ``endState``: ``0`` = coast, ``127`` = brake, ``126`` = hold position.
        """
        ...
    def gotoAbsPosition(self, absPos: int, speed: int = 100, maxPower: int = 100, endState: int = 0, useProfile: int = 0) -> None:
        """Turn to position ``absPos`` degrees, then stop.

        Position 0 is set with :meth:`presetEncoder`. ``endState``: ``0`` = coast, ``127`` = brake, ``126`` = hold position.
        """
        ...
    def presetEncoder(self, pos: int) -> None:
        """Stop the motor and call its current position ``pos`` degrees (usually 0)."""
        ...
    def getDeviceType(self) -> int:
        """A number saying what kind of device this is (see :mod:`lpf2.device_type`)."""
        ...
    def name(self) -> str:
        """The device's name as text, e.g. ``"Motor with Encoder"``."""
        ...

class color_sensor:
    """The Technic Color Sensor: sees colors and how much light bounces back.

    All its readings are kept up to date at the same time, so you can
    call any of the ``get…`` functions whenever you like.
    """
    MODE_COLOR: int = 0
    """Mode number: detected color."""
    MODE_REFLT: int = 1
    """Mode number: reflected light (0..100 %)."""
    MODE_AMBI: int = 2
    """Mode number: surrounding light (0..100 %)."""
    MODE_LIGHT: int = 3
    """Mode number: the sensor's own lights."""
    MODE_RGB: int = 5
    """Mode number: red, green, blue and brightness."""
    MODE_HSV: int = 6
    """Mode number: hue, saturation and value."""

    def getColorIdx(self) -> int:
        """The color it sees, as a number from :mod:`lpf2.color` (e.g. compare with ``color.RED``)."""
        ...
    def getReflectivity(self) -> float:
        """How much light bounces back from the surface, 0..100 %. White paper is high, black is low."""
        ...
    def getRGB(self) -> tuple[int, int, int, int]:
        """How much red, green and blue it sees, plus overall brightness: ``r, g, b, i = sensor.getRGB()``."""
        ...
    def getHSV(self) -> tuple[int, int, int]:
        """The color as hue (0..360, the color wheel angle), saturation (0..100) and value/brightness: ``h, s, v = sensor.getHSV()``."""
        ...
    def setLight(self, l1: int, l2: int, l3: int) -> None:
        """Set the brightness of the sensor's three lights, each 0..100 %."""
        ...
    def setMode(self, modeNum: int, delta: float = 1.0) -> None:
        """Advanced: choose which value the sensor reports (one of the ``MODE_…`` numbers)."""
        ...
    def getDeviceType(self) -> int:
        """A number saying what kind of device this is (see :mod:`lpf2.device_type`)."""
        ...
    def name(self) -> str:
        """The device's name as text, e.g. ``"Technic Color Sensor"``."""
        ...

class distance_sensor:
    """The Technic Distance Sensor (the one with two "eyes"): measures how far away things are."""

    MODE_LIGHT: int = 5
    """Mode number: the lights around the eyes."""

    def setLight(self, l1: int, l2: int, l3: int, l4: int) -> None:
        """Set the brightness of the four lights around the eyes, each 0..100 %."""
        ...
    def getDistance(self) -> float:
        """How far away the nearest object is, in centimeters."""
        ...
    def setMode(self, modeNum: int, delta: float = 1.0) -> None:
        """Advanced: choose which value the sensor reports (one of the ``MODE_…`` numbers)."""
        ...
    def getDeviceType(self) -> int:
        """A number saying what kind of device this is (see :mod:`lpf2.device_type`)."""
        ...
    def name(self) -> str:
        """The device's name as text, e.g. ``"Technic Distance Sensor"``."""
        ...

class color_distance_sensor:
    """The BOOST Color & Distance Sensor: sees colors and roughly how far away things are."""

    MODE_COLOR: int = 0
    """Mode number: detected color."""
    MODE_DIST: int = 1
    """Mode number: distance."""
    MODE_REFLT: int = 3
    """Mode number: reflected light."""
    MODE_AMBI: int = 4
    """Mode number: surrounding light."""
    MODE_LED: int = 5
    """Mode number: the sensor's light color."""
    MODE_RGB: int = 6
    """Red, green and blue amounts: ``r, g, b = sensor.getRgb()``."""
    MODE_IR: int = 7
    """Mode number: infrared remote-control signals."""

    def getColorIdx(self) -> int:
        """The color it sees, as a number from :mod:`lpf2.color` (e.g. compare with ``color.RED``)."""
        ...
    def getDistance(self) -> float:
        """How far away the nearest object is, in centimeters."""
        ...
    def getReflectedLight(self) -> int:
        """How much light bounces back from the surface, 0..100 %. White paper is high, black is low."""
        ...
    def getAmbientLight(self) -> int:
        """How bright the surroundings are, 0..100 %."""
        ...
    def getRgb(self) -> tuple[int, int, int]:
        """Red, green and blue amounts: ``r, g, b = sensor.getRgb()``."""
        ...
    def setIrTx(self, value: int) -> None:
        """Advanced: send an infrared code, like an old LEGO Power Functions remote."""
        ...
    def setLedColor(self, color: int) -> None:
        """Set the sensor's light to a color from :mod:`lpf2.color`."""
        ...
    def setMode(self, modeNum: int, delta: float = 1.0) -> None:
        """Advanced: choose which value the sensor reports (one of the ``MODE_…`` numbers)."""
        ...
    def getDeviceType(self) -> int:
        """A number saying what kind of device this is (see :mod:`lpf2.device_type`)."""
        ...
    def name(self) -> str:
        """The device's name as text, e.g. ``"Color Distance Sensor"``."""
        ...

class hub_led:
    """A hub's built-in colored light (``hub.led``)."""

    def setColorIdx(self, color: int) -> None:
        """Set the light to a named color from :mod:`lpf2.color`, e.g. ``hub.led.setColorIdx(color.GREEN)``."""
        ...
    def setColor(self, r: int, g: int, b: int) -> None:
        """Set the light to any color by mixing red, green and blue, each 0..255. ``setColor(0, 0, 0)`` is off."""
        ...
    def getDeviceType(self) -> int:
        """A number saying what kind of device this is (see :mod:`lpf2.device_type`)."""
        ...
    def name(self) -> str:
        """The device's name as text, e.g. ``"Hub LED"``."""
        ...

class accelerometer:
    """The hub's built-in accelerometer (``hub.accelerometer``): measures pushes and gravity in milli-g (1000 = gravity)."""

    def getX(self) -> float:
        """Push along the x direction, in milli-g."""
        ...
    def getY(self) -> float:
        """Push along the y direction, in milli-g."""
        ...
    def getZ(self) -> float:
        """Push along the z direction (up/down), in milli-g."""
        ...
    def getDeviceType(self) -> int:
        """A number saying what kind of device this is (see :mod:`lpf2.device_type`)."""
        ...
    def name(self) -> str:
        """The device's name as text, e.g. ``"Hub Accelerometer"``."""
        ...

class gyroscope:
    """The hub's built-in gyroscope (``hub.gyro``): measures how fast the hub spins, in degrees per second."""

    def getX(self) -> float:
        """Spin speed around the x direction, degrees per second."""
        ...
    def getY(self) -> float:
        """Spin speed around the y direction, degrees per second."""
        ...
    def getZ(self) -> float:
        """Spin speed around the z direction, degrees per second."""
        ...
    def getDeviceType(self) -> int:
        """A number saying what kind of device this is (see :mod:`lpf2.device_type`)."""
        ...
    def name(self) -> str:
        """The device's name as text, e.g. ``"Hub Gyroscope"``."""
        ...

class port_expander:
    """A Port Expander: plugs into one port and gives you four more."""

    def getPort(self, port_num: int) -> _port:
        """One of the expander's four ports, numbered 0..3 (see :mod:`lpf2.port_expander.port_num`).

        It works just like ``hub.ports.A``.
        """
        ...
    def getDeviceType(self) -> int:
        """A number saying what kind of device this is (see :mod:`lpf2.device_type`)."""
        ...
    def name(self) -> str:
        """The device's name as text, e.g. ``"Port Expander"``."""
        ...
