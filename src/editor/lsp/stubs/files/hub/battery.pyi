"""The hub's own battery: how full it is and whether it is charging.

Values update about every 2 seconds.
"""

UNKNOWN: int
"""State: not known yet."""
ON_BATTERY: int
"""State: running on battery, no charger plugged in."""
CHARGING: int
"""State: plugged in and charging."""
FULLY_CHARGED: int
"""State: plugged in and the battery is full."""

def voltage() -> int:
    """Battery voltage in millivolts (1000 mV = 1 V). ``0`` if it can't be measured."""
    ...
def percent() -> int:
    """How full the battery is, from 0 to 100 %."""
    ...
def state() -> int:
    """What the battery is doing: ``UNKNOWN``, ``ON_BATTERY``, ``CHARGING`` or ``FULLY_CHARGED``."""
    ...
def charging() -> bool:
    """``True`` while the battery is charging."""
    ...
def fully_charged() -> bool:
    """``True`` when a charger is plugged in and the battery is full."""
    ...
