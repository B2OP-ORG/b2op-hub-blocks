import hub, lpf2, time

emu = lpf2.hub_emulation()

emu.attachPort(0, hub.ports.A)
emu.attachPort(1, hub.ports.B)
emu.attachPort(2, hub.ports.C)
emu.attachPort(3, hub.ports.D)
if hasattr(hub.board, "HAS_PORT_E") and hub.board.HAS_PORT_E: # type: ignore
    emu.attachPort(4, hub.ports.E) # type: ignore
if hasattr(hub.board, "HAS_PORT_F") and hub.board.HAS_PORT_F: # type: ignore
    emu.attachPort(5, hub.ports.F) # type: ignore
emu.attachPort(lpf2.port_num.controlplus.LED, hub.ports.LED)

emu.start()

while not hub.buttons.center():
    pass

emu.stop()