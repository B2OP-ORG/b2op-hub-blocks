"""MPU-6050 accelerometer over the Grove I2C connector.

Reads WHO_AM_I, wakes the chip, then streams 6-byte accel bursts.
Uses the shared internal I2C bus via ``hub.i2c`` — coexists with the
PCA9685, SC16IS750, BNO085 and everything else already on Wire1.
"""

import hub, struct, time

ADDR = 0x68           # MPU-6050 / MPU-6500 default (AD0 low)
WHO_AM_I = 0x75
PWR_MGMT_1 = 0x6B
ACCEL_XOUT_H = 0x3B

print("scanning I2C bus...")
devs = hub.i2c.scan()
print("addresses:", [hex(a) for a in devs])
if ADDR not in devs:
    print(f"MPU-6050 not found at {hex(ADDR)}")
else:
    who = hub.i2c.readfrom_mem(ADDR, WHO_AM_I, 1)[0]
    print(f"WHO_AM_I: 0x{who:02X}")
    hub.i2c.writeto_mem(ADDR, PWR_MGMT_1, b"\x00")

    _buf = bytearray(6)
    _last_print = 0

    while not hub.buttons.center():
        now = time.ticks_ms()
        if time.ticks_diff(now, _last_print) >= 200:
            _last_print = now
            hub.i2c.readfrom_mem_into(ADDR, ACCEL_XOUT_H, _buf)
            ax, ay, az = struct.unpack(">hhh", _buf)
            print(f"accel  x={ax:+6}  y={ay:+6}  z={az:+6}")
