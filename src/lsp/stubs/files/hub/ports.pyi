"""The hub's ports — the sockets where you plug in LEGO motors and sensors.

Use ``hub.ports.A`` to ``hub.ports.F``. Each one is a
:class:`lpf2.local.port`, so you can ask it what's plugged in, drive a
motor or read a sensor.
"""

from lpf2 import port as _port
from lpf2.local import port as _local_port

A: _local_port
"""Port A."""
B: _local_port
"""Port B."""
C: _local_port
"""Port C."""
D: _local_port
"""Port D."""
E: _local_port
"""Port E."""
F: _local_port
"""Port F."""
LED: _port
"""Advanced: the built-in light, as if it were plugged into a port. Usually use ``hub.led`` instead."""
accelerometer: _port
"""Advanced: the built-in accelerometer, as if it were plugged into a port. Usually use ``hub.accelerometer`` instead."""
gyro: _port
"""Advanced: the built-in gyroscope, as if it were plugged into a port. Usually use ``hub.gyro`` instead."""
