"""Physical hub ports, exposed as :class:`lpf2.local.port` objects.

``A``..``D`` are the external LPF2 sockets; ``LED``, ``accelerometer``
and ``gyro`` wrap the built-in devices behind LPF2-style ports.
"""

from lpf2 import port as _port
from lpf2.local import port as _local_port

A: _local_port
"""External port A."""
B: _local_port
"""External port B."""
C: _local_port
"""External port C."""
D: _local_port
"""External port D."""
E: _local_port
"""External port E."""
F: _local_port
"""External port F."""
LED: _port
"""Virtual port wrapping the built-in hub RGB LED."""
accelerometer: _port
"""Virtual port wrapping the on-board accelerometer."""
gyro: _port
"""Virtual port wrapping the on-board gyroscope."""
