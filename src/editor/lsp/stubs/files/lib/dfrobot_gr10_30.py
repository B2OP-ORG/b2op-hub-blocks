"""DFRobot Gravity GR10-30 gesture sensor (SEN0543), I2C mode.

Port of DFRobot's DFRobot_GR10_30 Python driver to MicroPython on the
hub's shared internal I2C bus (``hub.i2c``). Registers are 16-bit
big-endian; the SEN0543 exposes them over I2C as SMBus-style
``read_i2c_block_data`` / ``write_i2c_block_data`` transactions.

Datasheet register map:
  INPUT_PID              0x00  device product ID
  INPUT_VID              0x01  vendor ID (0x3343)
  INPUT_ADDR             0x02
  INPUT_BAUDRATE         0x03
  INPUT_STOPBIT          0x04
  INPUT_VERSION          0x05
  INPUT_DATA_READY       0x06  1 = gesture detected, poll then read STATE
  INPUT_INTERRUPT_STATE  0x07  gesture bitfield (13 gestures)
  INPUT_EXIST_STATE      0x08  1 = object present
  HOLDING_INTERRUPT_MODE 0x09  which gestures to enable (bitfield)
  ...                          (window/range/hover/rotate config regs)
  HOLDING_RESET          0x18  write 0x5500 to reset

Reference: https://github.com/DFRobot/DFRobot_GR10_30
"""

import hub
import struct

DEV_ADDRESS = 0x73

# Input registers (read-only)
REG_PID              = 0x00
REG_VID              = 0x01
REG_ADDR             = 0x02
REG_DATA_READY       = 0x06
REG_INTERRUPT_STATE  = 0x07
REG_EXIST_STATE      = 0x08

# Holding registers (read/write)
REG_INTERRUPT_MODE   = 0x09
REG_LRUP_WIN         = 0x0A
REG_L_RANGE          = 0x0B
REG_R_RANGE          = 0x0C
REG_U_RANGE          = 0x0D
REG_D_RANGE          = 0x0E
REG_FORWARD_RANGE    = 0x0F
REG_BACKWARD_RANGE   = 0x10
REG_WAVE_COUNT       = 0x11
REG_HOVR_WIN         = 0x12
REG_HOVR_TIMER       = 0x13
REG_CWS_ANGLE        = 0x14
REG_CCW_ANGLE        = 0x15
REG_CWS_ANGLE_COUNT  = 0x16
REG_CCW_ANGLE_COUNT  = 0x17
REG_RESET            = 0x18

# Gesture bitfield (INTERRUPT_STATE + INTERRUPT_MODE)
GESTURE_UP                    = 1 << 0
GESTURE_DOWN                  = 1 << 1
GESTURE_LEFT                  = 1 << 2
GESTURE_RIGHT                 = 1 << 3
GESTURE_FORWARD               = 1 << 4
GESTURE_BACKWARD              = 1 << 5
GESTURE_CLOCKWISE             = 1 << 6
GESTURE_COUNTERCLOCKWISE      = 1 << 7
GESTURE_WAVE                  = 1 << 8
GESTURE_HOVER                 = 1 << 9
GESTURE_UNKNOWN               = 1 << 10
GESTURE_CLOCKWISE_C           = 1 << 14
GESTURE_COUNTERCLOCKWISE_C    = 1 << 15
# Mask: valid bits only (bits 11..13 reserved).
GESTURE_ALL                   = 0xC7FF

_NAMES = {
    GESTURE_UP: "up",
    GESTURE_DOWN: "down",
    GESTURE_LEFT: "left",
    GESTURE_RIGHT: "right",
    GESTURE_FORWARD: "forward",
    GESTURE_BACKWARD: "backward",
    GESTURE_CLOCKWISE: "cw",
    GESTURE_COUNTERCLOCKWISE: "ccw",
    GESTURE_WAVE: "wave",
    GESTURE_HOVER: "hover",
    GESTURE_UNKNOWN: "unknown",
    GESTURE_CLOCKWISE_C: "cw-cont",
    GESTURE_COUNTERCLOCKWISE_C: "ccw-cont",
}


def gesture_name(bit):
    return _NAMES.get(bit, "0x{:04X}".format(bit))


class GR10_30:
    def __init__(self, i2c, addr=DEV_ADDRESS):
        self._i2c = i2c
        self._addr = addr

    def _read_u16(self, reg):
        return struct.unpack(">H", self._i2c.readfrom_mem(self._addr, reg, 2))[0]

    def _write_u16(self, reg, val):
        self._i2c.writeto_mem(self._addr, reg, struct.pack(">H", val))

    def begin(self):
        """Verify the device answers on the bus, then reset it to defaults."""
        try:
            if self._read_u16(REG_ADDR) != self._addr:
                return False
        except OSError:
            return False
        self.reset()
        hub.sleep_ms(500)
        return True

    def pid(self):
        return self._read_u16(REG_PID)

    def vid(self):
        return self._read_u16(REG_VID)

    def enable_gestures(self, mask):
        """Enable the gestures set in ``mask`` (OR of ``GESTURE_*`` bits).

        Note: rotating (CW/CCW) and wave cannot both be enabled reliably;
        hover disables the other gestures when set. See datasheet.
        """
        self._write_u16(REG_INTERRUPT_MODE, mask & GESTURE_ALL)
        hub.sleep_ms(100)

    def reset(self):
        """Restore defaults."""
        self._write_u16(REG_RESET, 0x5500)
        hub.sleep_ms(100)

    def data_ready(self):
        """True if a gesture has been captured and is waiting in the state reg."""
        return self._read_u16(REG_DATA_READY) == 1

    def gesture(self):
        """Return the captured gesture bitfield (0 if nothing pending)."""
        return self._read_u16(REG_INTERRUPT_STATE)

    def object_present(self):
        return self._read_u16(REG_EXIST_STATE) == 1

    # --- configuration helpers -----------------------------------------

    def set_udlr_window(self, ud, lr):
        """Detection window size (1..30 each)."""
        self._write_u16(REG_LRUP_WIN, ((lr & 0x1F) << 8) | (ud & 0x1F))
        hub.sleep_ms(100)

    def set_left_range(self, r):        self._write_u16(REG_L_RANGE, r & 0x1F); hub.sleep_ms(100)
    def set_right_range(self, r):       self._write_u16(REG_R_RANGE, r & 0x1F); hub.sleep_ms(100)
    def set_up_range(self, r):          self._write_u16(REG_U_RANGE, r & 0x1F); hub.sleep_ms(100)
    def set_down_range(self, r):        self._write_u16(REG_D_RANGE, r & 0x1F); hub.sleep_ms(100)
    def set_forward_range(self, r):     self._write_u16(REG_FORWARD_RANGE, r & 0x1F); hub.sleep_ms(100)
    def set_backward_range(self, r):    self._write_u16(REG_BACKWARD_RANGE, r & 0x1F); hub.sleep_ms(100)
    def set_wave_count(self, n):        self._write_u16(REG_WAVE_COUNT, n & 0x0F); hub.sleep_ms(100)

    def set_hover_window(self, ud, lr):
        self._write_u16(REG_HOVR_WIN, ((lr & 0x1F) << 8) | (ud & 0x1F))
        hub.sleep_ms(100)

    def set_hover_timer(self, ticks_10ms):
        """How long hand must hover to fire HOVER. Max 200 (=2 s)."""
        self._write_u16(REG_HOVR_TIMER, ticks_10ms & 0x3FF)
        hub.sleep_ms(100)

    def set_cw_angle(self, count):      self._write_u16(REG_CWS_ANGLE, count & 0x1F); hub.sleep_ms(100)
    def set_ccw_angle(self, count):     self._write_u16(REG_CCW_ANGLE, count & 0x1F); hub.sleep_ms(100)
    def set_cw_angle_count(self, c):    self._write_u16(REG_CWS_ANGLE_COUNT, c & 0x1F); hub.sleep_ms(100)
    def set_ccw_angle_count(self, c):   self._write_u16(REG_CCW_ANGLE_COUNT, c & 0x1F); hub.sleep_ms(100)
