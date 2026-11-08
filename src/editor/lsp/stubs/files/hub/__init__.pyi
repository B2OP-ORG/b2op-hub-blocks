"""Board-provided hub module.

Exposes the on-device peripherals: LPF2 ports (`hub.ports`), hub LED,
IMU (`hub.imu`), buttons, LCD (LVGL), status log and power-off. Objects
here are singletons created by the C firmware — this module is a stub;
the real implementation lives in the ESP32 port.
"""

from lpf2.devices import hub_led as _hub_led
from lpf2.devices import accelerometer as _accelerometer
from lpf2.devices import gyroscope as _gyroscope
from machine import SDCard, I2C
from typing import NoReturn, Optional
from . import ports as ports, log as log, buttons as buttons, battery as battery, board as board, imu as imu, lcd as lcd, video as video, audio as audio, settings as settings

fw_version: str
"""Firmware build version string."""


led: _hub_led
"""Built-in hub RGB LED."""
accelerometer: _accelerometer
"""Built-in accelerometer wrapped as a Devices.accelerometer."""
gyro: _gyroscope
"""Built-in gyroscope wrapped as a Devices.gyroscope."""
i2c: I2C
"""External connector I2C bus (may be shared with on-board devices).

Same object as ``machine.I2C(hub.board.HUB_I2C_MODULE_BUS)`` — a pre-initialised :class:`machine.I2C`
singleton. Pins are fixed by the board; ``scl``/``sda`` kwargs to
``hub.i2c.init()`` are accepted but ignored.
"""

def sd_card() -> Optional[SDCard]:
    """Return the mounted ``machine.SDCard`` instance, or ``None`` if no SD card is present.

    The card is initialised and mounted at ``/sd`` before ``boot.py`` runs.
    Returns ``None`` on boards without ``HAS_SD_CARD`` or when mount failed.
    """
    ...

def sd_remount() -> None:
    """Unmount the cached SD card handle and re-mount the SD card at ``/sd``.

    Call after disabling USB MSC so the SDMMC host is freed and can be
    re-initialised via ``machine.SDCard``.
    """
    ...

def usb_msc_mode() -> bool:
    """Return ``True`` if USB Mass Storage Class is currently active."""
    ...

def set_usb_msc(enabled: bool) -> None:
    """Enable or disable USB Mass Storage Class (SD card).

    When enabling, the SDMMC host is opened without a VFS mount so TinyUSB
    can own the SD card. When disabling, the SDMMC host is released so
    :func:`sd_remount` can re-mount it via MicroPython.
    """
    ...

def exit() -> NoReturn:
    """Exit the currently running user program cleanly.

    Raises ``SystemExit`` inside the program. The C runner catches it and
    shows a "Done" result screen, identical to the program returning
    normally. Use this instead of ``raise SystemExit`` for clarity.
    """
    ...

def powerOff() -> NoReturn:
    """Turn the hub off immediately. Does not return.

    If the hardware power latch does not hold (e.g. USB power is present),
    the firmware performs an orderly shutdown: disables LPF2 ports and motor
    PWM outputs, turns off the LCD backlight, deinitialises BLE and WiFi,
    signals the MicroPython task to exit (GC runs before the task deletes
    itself), throttles the CPU to 80 MHz, then enters a low-activity loop
    that keeps the battery status LED updated. Pressing the right button
    restarts the firmware.
    """
    ...


