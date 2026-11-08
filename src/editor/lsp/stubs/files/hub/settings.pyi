"""Hub settings that are remembered after a restart.

Change a value, then call :func:`save` to keep it.
"""

allow_full_fs: bool
"""Show the hub's whole file system in the Run program menu, not just the SD card."""
usb_msc: bool
"""Show the SD card as a USB drive on your computer when the hub starts."""
ble_adv: bool
"""Make the hub visible over Bluetooth when it starts (on by default)."""
show_batt_pct: bool
"""Show the battery percentage at the top of the hub's screen."""

def save() -> None:
    """Save the current settings so they are used after a restart."""
    ...
