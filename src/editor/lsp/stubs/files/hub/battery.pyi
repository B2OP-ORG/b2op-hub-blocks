"""Battery voltage + charging status.

Voltage comes from the on-board resistor divider ADC; charging
state is decoded from the IP2366's ISTAT (RXD0) and CSTAT (SC16IS750
P0) open-drain outputs. Values are refreshed on the C-side hub loop
(every ~2 s).
"""

UNKNOWN: int
"""State value: pins not sampled yet, or both LOW (unusual)."""
ON_BATTERY: int
"""State value: no charger present / charger detached."""
CHARGING: int
"""State value: charge current flowing (ISTAT LOW)."""
FULLY_CHARGED: int
"""State value: charger present, charge cycle complete (CSTAT LOW)."""

def voltage() -> int:
    """Latest pack voltage in millivolts (0 if ADC not configured)."""
    ...
def percent() -> int:
    """Voltage mapped to 0..100 % via the Lpf2 default linear curve."""
    ...
def state() -> int:
    """Current state: one of the module constants above."""
    ...
def charging() -> bool:
    """True when charge current is actively flowing."""
    ...
def fully_charged() -> bool:
    """True when charger is present and the charge cycle has completed."""
    ...
