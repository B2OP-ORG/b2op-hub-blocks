"""Everything built into the hub.

Start your program with ``import hub``. Then use ``hub.ports`` for
motors and sensors, ``hub.led`` for the light, ``hub.buttons``,
``hub.imu`` (motion sensor), ``hub.lcd`` (screen), ``hub.audio``
(sound), ``hub.battery`` and more.
"""

from lpf2.devices import hub_led as _hub_led
from lpf2.devices import accelerometer as _accelerometer
from lpf2.devices import gyroscope as _gyroscope
from machine import SDCard, I2C
from typing import NoReturn, Optional
from . import ports as ports, log as log, buttons as buttons, battery as battery, board as board, imu as imu, lcd as lcd, video as video, audio as audio, settings as settings

fw_version: str
"""Which firmware version the hub is running, e.g. ``"2.1.0"``."""


led: _hub_led
"""The hub's built-in colored light. Try ``hub.led.setColor(255, 0, 0)`` for red."""
accelerometer: _accelerometer
"""The built-in accelerometer: measures pushes and gravity along x, y and z."""
gyro: _gyroscope
"""The built-in gyroscope: measures how fast the hub spins around x, y and z."""
i2c: I2C
"""The I2C connection on the hub's Grove connector, for extra sensors and gadgets.

It is a ready-to-use ``machine.I2C`` — try ``hub.i2c.scan()`` to list
what's connected. Some built-in parts of the hub share this connection.
"""

def sd_card() -> Optional[SDCard]:
    """The SD card, or ``None`` if there is no card.

    Files on the card are found under ``/sd``, e.g. ``/sd/song.mid``.
    """
    ...

def sd_remount() -> None:
    """Re-connect the SD card at ``/sd``.

    Use it after turning off USB drive mode (see :func:`set_usb_msc`) so
    your program can use the card again.
    """
    ...

def usb_msc_mode() -> bool:
    """``True`` while the SD card is shown as a USB drive on your computer."""
    ...

def set_usb_msc(enabled: bool) -> None:
    """Show (``True``) or hide (``False``) the SD card as a USB drive on your computer.

    While it's shown as a drive, your program can't use the card. After
    hiding it, call :func:`sd_remount` to use it again.
    """
    ...

def exit() -> NoReturn:
    """Stop your program right here.

    The hub shows "Done", just like when a program reaches its end.
    """
    ...

def stop_callbacks() -> int:
    """Stop every button callback (:func:`hub.buttons.on`) that is still
    running.

    Each one stops at its next line of Python or inside its current
    ``time.sleep_ms``. Returns how many were told to stop. Calling it from
    inside a callback stops all the others, not the caller. Registered
    callbacks stay registered and run again on the next press.
    """
    ...

def powerOff() -> NoReturn:
    """Turn the hub off.

    If a USB cable keeps it powered, the hub stops motors, the screen and
    Bluetooth and goes to sleep instead; press the center button to wake it.
    """
    ...


