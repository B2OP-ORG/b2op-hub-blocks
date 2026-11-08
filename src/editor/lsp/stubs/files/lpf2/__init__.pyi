"""Talk to LEGO Powered Up motors, sensors, lights and hubs.

The ports on your hub (``hub.ports.A`` …) are :class:`port` objects:
use them to see what's plugged in and to drive motors. ``lpf2`` also
lets you connect to other LEGO hubs over Bluetooth (:class:`hub`) or
make your hub pretend to be a LEGO hub (:class:`hub_emulation`).
Useful lists of numbers live in sub-modules like :mod:`~lpf2.color`
and :mod:`~lpf2.device_type`.
"""

from __future__ import annotations
from typing import Optional, Sequence, Union
from lpf2 import port_num as port_num
from lpf2 import hub_type as hub_type
from lpf2 import hub_property as hub_property
from lpf2 import device_type as device_type
from lpf2 import alerts as alerts
from lpf2 import battery_type as battery_type
from lpf2 import button_state as button_state
from lpf2 import color as color
from lpf2 import local as local
from lpf2 import virtual as virtual
from lpf2 import devices as devices
from lpf2 import port_expander as port_expander
from typing import Callable

class battery:
    """Advanced: battery level calculation for custom battery setups.

    For the hub's own battery use ``hub.battery`` instead. Here you can
    set what voltage counts as full (default 9000 mV) and empty (default
    6000 mV); the percentage is worked out between those two.
    Use it as ``lpf2.battery.getPercent()`` — no need to create one.
    """

    @staticmethod
    def setMaxVoltage(mv: int) -> None:
        """Set the full-charge voltage in mV."""
        ...
    @staticmethod
    def setMinVoltage(mv: int) -> None:
        """Set the cut-off (0%) voltage in mV."""
        ...
    @staticmethod
    def getMaxVoltage() -> int:
        """Get the full-charge voltage in mV."""
        ...
    @staticmethod
    def getMinVoltage() -> int:
        """Get the cut-off (0%) voltage in mV."""
        ...
    @staticmethod
    def setCurrentVoltage(mv: int) -> None:
        """Manually update the current battery voltage (mV).

        Use this if you have your own voltage source (not the built-in
        ADC divider).
        """
        ...
    @staticmethod
    def getCurrentVoltage() -> int:
        """Get the last-known current battery voltage in mV."""
        ...
    @staticmethod
    def getPercent() -> int:
        """How full the battery is, 0..100 %, based on the current voltage."""
        ...
    @staticmethod
    def setPercentFunc(fn: Optional[Callable[[int, int, int], int]]) -> None:
        """Use your own function to turn a voltage into a percentage.

        ``fn(mV, vmin, vmax)`` must return 0..100. Pass ``None`` to go back
        to the default (a straight line between empty and full).
        """
        ...
    @staticmethod
    def setupAdcDivider(
        adc_channel: int,
        adc_unit: int,
        r_top_ohms: float,
        r_bottom_ohms: float,
        vref_mv: int = 3300,
        samples: int = 8,
    ) -> bool:
        """Advanced: measure a battery through a voltage divider on an analog pin.

        ``adc_channel`` / ``adc_unit`` pick the ESP32 analog input;
        ``r_top_ohms`` / ``r_bottom_ohms`` are the two resistors (battery
        → middle → ground). Returns ``True`` if it worked.
        """
        ...
    @staticmethod
    def readBatteryVoltage() -> int:
        """Measure the battery now (see :meth:`setupAdcDivider`) and return millivolts, or 0 if not set up."""
        ...

class _motor_settings:
    """Advanced: tuning values that control how smoothly a motor reaches its speed or position.

    Changing a field takes effect immediately. Only touch these if a
    motor overshoots, wobbles or stalls.
    """
    id: int
    """Motor type identifier."""
    rated_max_speed: int
    """Rated max speed in device units."""
    max_voltage_mv: int
    """Voltage cap fed to the H-bridge."""
    speed_ksp: float
    """Speed-loop proportional gain."""
    speed_ksi: float
    """Speed-loop integral gain."""
    speed_int_clamp: float
    """Anti-windup clamp on the speed-loop integrator."""
    speed_deadband_pct: float
    """Deadband (%) below which speed error is treated as zero."""
    pos_kp: float
    """Position-loop proportional gain."""
    pos_ki: float
    """Position-loop integral gain."""
    pos_kd: float
    """Position-loop derivative gain."""
    pos_int_clamp: float
    """Anti-windup clamp on the position-loop integrator."""
    pos_deadband_deg: float
    """Deadband (deg) below which position error is treated as zero."""
    pos_decel_mdps2: float
    """Position-loop deceleration limit in mdeg/s^2."""
    breakaway_pct: float
    """Extra power (%) added on startup to overcome static friction."""
    kinetic_floor_pct: float
    """Minimum power (%) held while the motor is moving."""

class motor_setting:
    """Advanced: the tuning values used for each kind of LEGO motor."""
    medium_linear: _motor_settings
    """Medium linear motor."""
    technic_large_linear: _motor_settings
    """Technic Large linear motor."""
    technic_xlarge_linear: _motor_settings
    """Technic XL linear motor."""
    technic_medium_angular: _motor_settings
    """Technic Medium Angular motor."""
    technic_large_angular: _motor_settings
    """Technic Large Angular motor."""
    technic_medium_angular_grey: _motor_settings
    """Technic Medium Angular motor (grey Control+ variant)."""
    technic_large_angular_grey: _motor_settings
    """Technic Large Angular motor (grey Control+ variant)."""

class mode:
    """Advanced: describes one "mode" of a device — one kind of value it can report or accept.

    For example a color sensor has a mode for color, one for reflected
    light, and so on. Holds the mode's name and value ranges.
    """
    name: str
    """Mode name (from the device)."""
    min: float
    """Raw value minimum."""
    max: float
    """Raw value maximum."""
    PCTmin: float
    """Percent-scale minimum."""
    PCTmax: float
    """Percent-scale maximum."""
    SImin: float
    """SI-scale minimum."""
    SImax: float
    """SI-scale maximum."""
    inMapping: int
    """Input-mapping bitmask (see LWP spec)."""
    outMapping: int
    """Output-mapping bitmask (see LWP spec)."""
    dataSets: int
    """Number of datasets per sample."""
    format: int
    """Sample element format (0=int8, 1=int16, 2=int32, 3=float)."""
    figures: int
    """Total display figures (integer + decimals)."""
    decimals: int
    """Decimals shown for display."""
    motorBias: int
    """Motor bias, per LWP."""
    flags: int
    """Capability/flags bitmask."""
    rawData: bytes
    """Latest raw payload for this mode."""

class version:
    """A version number made of Major.Minor.Bugfix.Build."""
    Build: int
    """Build number."""
    Major: int
    """Major version."""
    Minor: int
    """Minor version."""
    Bugfix: int
    """Bugfix version."""

class port:
    """A port where a LEGO motor, sensor or light can be plugged in.

    ``hub.ports.A`` and friends are ports. Ask :meth:`isDeviceConnected`
    whether something is plugged in, get it with :meth:`device`, or
    drive a motor directly with :meth:`startPower`, :meth:`startSpeed`
    and friends. The hub keeps every port up to date in the background,
    so you just read the values.

    Speeds and powers go from -100 to 100: the sign picks the direction.
    """

    def init(self) -> None:
        """Advanced: one-time setup hook. Does nothing by default."""
        ...
    def update(self) -> None:
        """Advanced: check the port for news right now.

        You don't need this — the hub already does it for every port
        many times per second.
        """
        ...
    def disable(self, disable: bool = True) -> None:
        """Switch the port off (or back on with ``disable(False)``).

        While switched off the hub stops talking to the device and frees
        the port's pins, so you can use them for something else — for
        example an LED strip (see the NeoPixel example).
        """
        ...
    def enable(self) -> None:
        """Switch a port back on after :meth:`disable`."""
        ...
    def isDisabled(self) -> bool:
        """``True`` while the port is switched off with :meth:`disable`."""
        ...
    def device(self) -> Union[
        devices.basic_motor,
        devices.encoder_motor,
        devices.color_sensor,
        devices.distance_sensor,
        devices.port_expander,
        devices.hub_led,
        devices.accelerometer,
        devices.gyroscope,
        None,
    ]:
        """The motor, sensor or light plugged into this port, or ``None`` if nothing is plugged in.

        What you get depends on the device — for example an
        :class:`~lpf2.devices.encoder_motor` or a
        :class:`~lpf2.devices.color_sensor` — each with its own handy
        functions.
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

class device_descriptor:
    """Advanced: describes a pretend device — its modes and version numbers.

    Used together with :class:`lpf2.virtual.device`.
    """
    modes: list[mode]
    """List of mode descriptors, indexed by mode number."""
    fwVersion: version
    """Firmware version reported by the device."""
    hwVersion: version
    """Hardware version reported by the device."""

class hub:
    """Connect to another LEGO hub (Powered Up, Control+, BOOST…) over Bluetooth.

    Call :meth:`init` to start searching, wait until :meth:`isConnected`
    and :meth:`infoReady` are ``True``, then use :meth:`getPort` to
    control its motors and sensors — just like your own ports.
    """

    def __init__(self) -> None: ...
    def init(self, addr_or_scan: Union[str, int, None] = None, scan_duration: int = 10) -> None:
        """Start searching for a LEGO hub to connect to.

        ``addr_or_scan`` can be a hub's Bluetooth address (text like
        ``"aa:bb:cc:dd:ee:ff"``) to connect to that exact hub, a number of
        seconds to search for, or left out to search for ``scan_duration``
        seconds.
        """
        ...
    def update(self) -> None:
        """Advanced: process Bluetooth news right now. Not needed — the hub does this in the background."""
        ...
    def connectHub(self) -> bool:
        """Try to connect to the hub that was found. Returns ``True`` if it worked."""
        ...
    def isConnected(self) -> bool:
        """``True`` while connected to the other hub."""
        ...
    def isConnecting(self) -> bool:
        """``True`` while trying to connect."""
        ...
    def isScanning(self) -> bool:
        """``True`` while searching for hubs."""
        ...
    def shutDownHub(self) -> None:
        """Turn the other hub off."""
        ...
    def infoReady(self) -> bool:
        """``True`` once the other hub has told us all about itself and its ports. Wait for this before using :meth:`getPort`."""
        ...
    def getName(self) -> str:
        """The other hub's name."""
        ...
    def setName(self, name: str) -> None:
        """Rename the other hub. It remembers the new name."""
        ...
    def getBatteryType(self) -> int:
        """What kind of batteries the other hub uses (see :mod:`lpf2.battery_type`)."""
        ...
    def getHubType(self) -> int:
        """What kind of hub it is (see :mod:`lpf2.hub_type`)."""
        ...
    def getHubAddress(self) -> str:
        """The other hub's Bluetooth address."""
        ...
    def getAllInfoStr(self) -> str:
        """Everything known about the other hub and its ports, as text."""
        ...
    def getHubPropStr(self, prop_id: int) -> str:
        """One fact about the other hub as text, e.g. its firmware version (see :mod:`lpf2.hub_property`)."""
        ...
    def getPort(self, port_num: int) -> Optional[port]:
        """One of the other hub's ports, or ``None`` if it doesn't exist.

        Port numbers depend on the hub type — see :mod:`lpf2.port_num`, e.g.
        ``lpf2.port_num.poweredup.A``. The port works like ``hub.ports.A``.
        """
        ...
    def setPortMode(self, port_num: int, mode: int, delta: int, notify: bool = True) -> int:
        """Advanced: choose which value a port on the other hub reports. Returns 0 if it worked."""
        ...
    def setPortModeCombo(self, port_num: int, combo_idx: int, nibble_pairs: Sequence[int], deltas_per_mode: Sequence[int]) -> int:
        """Advanced: have a port on the other hub report several values at once.

        Each byte in ``nibble_pairs`` is ``mode * 16 + value number``;
        ``deltas_per_mode`` lists the minimum change for each, in the same order.
        """
        ...

class hub_emulation:
    """Make your hub pretend to be a LEGO hub, so LEGO apps can connect to it.

    Set it up first (name, battery…), choose which ports the app may use
    with :meth:`attachPort`, then call :meth:`start`.
    """

    def start(self) -> None:
        """Become visible over Bluetooth so apps can connect."""
        ...
    def stop(self) -> None:
        """Stop pretending: disconnect and become invisible."""
        ...
    def setUseBuiltInDevices(self, use: bool) -> None:
        """Also show the hub's built-in light and motion sensor to the app (``True``) or only your attached ports (``False``).

        Call this before :meth:`start`.
        """
        ...
    def setBatteryLevel(self, level: int) -> None:
        """The battery level (0..100 %) shown to the app."""
        ...
    def setBatteryType(self, type: int) -> None:
        """The battery type shown to the app (see :mod:`lpf2.battery_type`)."""
        ...
    def setName(self, name: str) -> None:
        """The hub name shown in the app."""
        ...
    def setFirmwareVersion(self, v: version) -> None:
        """The firmware version shown to the app."""
        ...
    def setHardwareVersion(self, v: version) -> None:
        """The hardware version shown to the app."""
        ...
    def setButtonState(self, state: int) -> None:
        """Tell the app the hub's button was pressed or released (see :mod:`lpf2.button_state`)."""
        ...
    def setAlert(self, alert: int, on: bool) -> None:
        """Turn a warning such as "low battery" on or off in the app (see :mod:`lpf2.alerts`)."""
        ...
    def getName(self) -> str:
        """The hub name shown in the app."""
        ...
    def attachPort(self, port_num: int, p: port) -> None:
        """Let the app use port ``p`` as port number ``port_num`` (0 = A, 1 = B, …).

        Keep ``p`` in a variable for as long as the emulation runs.
        """
        ...
