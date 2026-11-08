"""
Port expander emulation on port F.

Ports A-D are exposed to a connected LPF2 host (e.g. PoweredUp app or
Technic Hub) as a port expander device attached to port F.

Wire the hub's port F TX/RX to the host port. The hub will hold TX low
(break condition) until the host sends CMD_SPEED, then enumerate as a
port expander device.
"""
import hub, lpf2, time

pn = lpf2.port_expander.port_num

# Build the virtual port expander device and wire ports A-D into it.
device = lpf2.port_expander.virtual_port_expander_device()
device.attachPort(pn.A, hub.ports.A)
device.attachPort(pn.B, hub.ports.B)
device.attachPort(pn.C, hub.ports.C)
device.attachPort(pn.D, hub.ports.D)

# Create the emulated port on port F.
# This disables port F's normal UART scanning, takes over its UART, and calls
# init() internally — do not call init() again after construction.
emu = lpf2.local.emulated_port(hub.ports.F)
emu.attachDevice(device)

print("Port expander ready on port F. Press center to stop.")

while not hub.buttons.center():
    time.sleep_ms(50)

