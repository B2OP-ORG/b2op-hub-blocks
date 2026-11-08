"""Port expanders: one port in, four ports out.

To use a real expander, plug it in and call ``hub.ports.A.device().getPort(0)``
(see :class:`lpf2.devices.port_expander`). This module lets you build a
pretend one.
"""

from __future__ import annotations
from lpf2 import port as _port
from lpf2.port_expander import port_num as port_num
from lpf2.virtual import device as _virtual_device

class virtual_port_expander_device(_virtual_device):
    """Advanced: a pretend port expander that combines up to four ports into one.

    Add ports with :meth:`attachPort`, then put it into a
    :class:`lpf2.virtual.port` or :class:`lpf2.local.emulated_port`.
    """

    def __init__(self) -> None:
        """Create an empty pretend expander."""
        ...
    def attachPort(self, port_num: int, port: _port) -> None:
        """Use ``port`` as expander port ``port_num`` (0..3, see :mod:`lpf2.port_expander.port_num`)."""
        ...
