"""InvenSense MPU-6050 / MPU-6500 6-axis IMU driver, I2C.

Minimal driver: WHO_AM_I probe, wake from reset, streaming accel/gyro
reads. Default address is 0x68 (AD0 low); use 0x69 for AD0 high.
"""

import struct

ADDR_LOW  = 0x68
ADDR_HIGH = 0x69

_REG_SMPLRT_DIV   = 0x19
_REG_CONFIG       = 0x1A
_REG_GYRO_CONFIG  = 0x1B
_REG_ACCEL_CONFIG = 0x1C
_REG_ACCEL_XOUT_H = 0x3B
_REG_GYRO_XOUT_H  = 0x43
_REG_PWR_MGMT_1   = 0x6B
_REG_WHO_AM_I     = 0x75


class MPU6050:
    def __init__(self, i2c, addr=ADDR_LOW):
        self._i2c = i2c
        self._addr = addr
        self._buf6 = bytearray(6)
        self._buf14 = bytearray(14)

    def who_am_i(self):
        return self._i2c.readfrom_mem(self._addr, _REG_WHO_AM_I, 1)[0]

    def wake(self):
        """Clear the SLEEP bit set by power-on reset."""
        self._i2c.writeto_mem(self._addr, _REG_PWR_MGMT_1, b"\x00")

    def begin(self):
        who = self.who_am_i()
        if who not in (0x68, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x98):
            return False
        self.wake()
        return True

    def read_accel(self):
        """Raw accel (x, y, z) as 16-bit signed ints, big-endian."""
        self._i2c.readfrom_mem_into(self._addr, _REG_ACCEL_XOUT_H, self._buf6)
        return struct.unpack(">hhh", self._buf6)

    def read_gyro(self):
        self._i2c.readfrom_mem_into(self._addr, _REG_GYRO_XOUT_H, self._buf6)
        return struct.unpack(">hhh", self._buf6)

    def read_all(self):
        """Return (ax, ay, az, temp, gx, gy, gz) in a single 14-byte burst."""
        self._i2c.readfrom_mem_into(self._addr, _REG_ACCEL_XOUT_H, self._buf14)
        return struct.unpack(">hhhhhhh", self._buf14)
