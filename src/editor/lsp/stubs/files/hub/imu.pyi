"""On-board IMU (BNO085 or LSM6DSL, depending on board).

Attitude fields are in degrees, wrapped to [-180, 180]. On BNO085
boards the fusion is 9-DoF (accel + gyro + mag) done on-chip via the
SH-2 Rotation Vector report — yaw has an absolute reference. On
LSM6DSL boards fusion is a complementary filter on pitch/roll and
gyro-integrated yaw (drifts; no magnetometer).
"""

class _vec3:
    """3-component float vector used for IMU acceleration / gyro samples."""
    x: float
    """X component."""
    y: float
    """Y component."""
    z: float
    """Z component."""
    def __init__(self, x: float, y: float, z: float) -> None: ...
    def length(self) -> float:
        """Euclidean length: ``sqrt(x*x + y*y + z*z)``."""
        ...
    def distance_to(self, other: "_vec3") -> float:
        """Euclidean distance between this vector and ``other``."""
        ...


pitch: float
"""Fused pitch, degrees."""
yaw: float
"""Fused yaw, degrees."""
roll: float
"""Fused roll, degrees."""

pitch_accel: float
"""Raw accel-derived pitch. Noisy but no drift. Degrees."""
roll_accel: float
"""Raw accel-derived roll. Noisy but no drift. Degrees."""

pitch_gyro: float
"""Pure gyro-integrated pitch. Drifts. Degrees."""
yaw_gyro: float
"""Pure gyro-integrated yaw. Drifts. Degrees."""
roll_gyro: float
"""Pure gyro-integrated roll. Drifts. Degrees."""

acceleration: _vec3
"""Latest acceleration sample in mG, hub frame."""
gyro_rate: _vec3
"""Latest gyro-rate sample in dps, hub frame. Calibrated bias subtracted."""

calibrated: bool
"""LSM6DSL: post-reset gyro-bias averaging finished (~2 s after
boot/reset). While False, gyro readings and yaw are held at 0.
BNO085: rotation-vector status byte >= 2 (medium/high accuracy)."""

def reset() -> None:
    """Zero yaw.

    LSM6DSL: restarts gyro-bias calibration — hub must be held
    stationary for ~2 s afterwards.
    BNO085: captures the current fused yaw as the new zero (Tare);
    no wait required.
    """
    ...

def start_calibration() -> bool:
    """Enable all backend-supported calibrators.

    BNO085 already runs continuous cal by default; this makes it
    explicit. Perform figure-8 motion (mag) and place the hub in
    several flat orientations for a few seconds each (accel/gyro).
    Returns True on success.
    """
    ...

def save_calibration() -> bool:
    """Persist current calibration to the sensor's non-volatile storage.

    BNO085: saves the Dynamic Calibration Data (DCD) into on-chip
    flash. LSM6DSL: no-op (gyro bias is recomputed every boot).
    Call once ``calibrated`` reads True. Returns True on success.
    """
    ...
