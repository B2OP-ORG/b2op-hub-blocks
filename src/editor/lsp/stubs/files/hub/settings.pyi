"""Persistent hub settings stored in ``/settings.json``.

All fields are read-writable; call ``save()`` to persist changes.
Settings are loaded at startup by ``hub_app_run()``.
"""

allow_full_fs: bool
"""If ``True`` the file browser root is ``/``; otherwise ``/sd``."""
usb_msc: bool
"""If ``True`` USB Mass Storage Class is started on boot."""
ble_adv: bool
"""If ``True`` BLE advertising starts on boot (default ``True``)."""
show_batt_pct: bool
"""If ``True`` the menu header shows battery percentage."""

def save() -> None:
    """Write current settings to ``/settings.json``."""
    ...
