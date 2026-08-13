import lpf2, hub

vHub = lpf2.hub_emulation()

vHub.attachPort(lpf2.port_num.controlplus.A, hub.ports.A)
vHub.attachPort(lpf2.port_num.controlplus.B, hub.ports.B)
vHub.attachPort(lpf2.port_num.controlplus.C, hub.ports.C)
vHub.attachPort(lpf2.port_num.controlplus.D, hub.ports.D)
vHub.attachPort(lpf2.port_num.controlplus.ACCELEROMETER, hub.ports.gyro)
vHub.attachPort(lpf2.port_num.controlplus.GYRO, hub.ports.accelerometer)
vHub.attachPort(lpf2.port_num.controlplus.LED, hub.ports.LED)

vHub.setName('Not a LEGO Hub')

vHub.start()
