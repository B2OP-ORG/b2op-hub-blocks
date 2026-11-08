"""Motion sensor: which way the hub is tilted and turned.

``pitch``, ``roll`` and ``yaw`` are angles in degrees, from -180 to 180:

* **pitch** — nose up / nose down,
* **roll** — tilting left / right,
* **yaw** — turning around, like a compass.

Wait until :data:`calibrated` is ``True`` before trusting the values.
On some hubs yaw slowly drifts over time; call :func:`reset` to set it
back to 0.
"""

class _vec3:
    """Three numbers ``x``, ``y`` and ``z`` — one for each direction."""
    x: float
    """Left/right part."""
    y: float
    """Forward/backward part."""
    z: float
    """Up/down part."""
    def __init__(self, x: float, y: float, z: float) -> None: ...
    def length(self) -> float:
        """How big the vector is overall, ignoring direction."""
        ...
    def distance_to(self, other: "_vec3") -> float:
        """How far this vector is from ``other``."""
        ...


pitch: float
"""Nose up (+) or down (-), in degrees."""
yaw: float
"""Which way the hub is facing, in degrees. Use :func:`reset` to set the current direction as 0."""
roll: float
"""Tilt to the side, in degrees."""

pitch_accel: float
"""Advanced: pitch measured only from gravity. Jumpy, but never drifts. Degrees."""
roll_accel: float
"""Advanced: roll measured only from gravity. Jumpy, but never drifts. Degrees."""

pitch_gyro: float
"""Advanced: pitch measured only from rotation. Smooth, but drifts over time. Degrees."""
yaw_gyro: float
"""Advanced: yaw measured only from rotation. Smooth, but drifts over time. Degrees."""
roll_gyro: float
"""Advanced: roll measured only from rotation. Smooth, but drifts over time. Degrees."""

acceleration: _vec3
"""How hard the hub is being pushed (including gravity), in milli-g.

Lying still and flat, ``z`` is about 1000 (that's gravity).
"""
gyro_rate: _vec3
"""How fast the hub is spinning around each direction, in degrees per second."""

calibrated: bool
"""``True`` once the sensor is ready and its readings can be trusted.

Right after start-up (or after :func:`reset`) keep the hub still for
about 2 seconds until this turns ``True``.
"""

def reset() -> None:
    """Set the current direction as yaw = 0.

    On some hubs this also re-calibrates the sensor — keep the hub still
    for about 2 seconds afterwards.
    """
    ...

def start_calibration() -> bool:
    """Start calibrating the sensor more precisely.

    Move the hub in a figure-8, then put it down flat on each side for a
    few seconds. Returns ``True`` if calibration started.
    """
    ...

def save_calibration() -> bool:
    """Remember the current calibration, so it survives a restart.

    Call it once :data:`calibrated` is ``True``. Not every hub can store a
    calibration; on those this does nothing. Returns ``True`` on success.
    """
    ...
