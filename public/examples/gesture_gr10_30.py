"""DFRobot Gravity GR10-30 gesture sensor (SEN0543) demo.

Wire VCC/GND/SDA/SCL to hub's Grove I2C connector. Address 0x73. Set
the on-board switch to I2C mode. Detected gestures are drawn on the
LCD (no serial output).
"""

import time, hub, lvgl as lv
import lib.dfrobot.gravity.gesture as g

sensor = g.GR10_30(hub.i2c)

hub.lcd.backlight(200)

scr = lv.screen_active()
scr.set_style_bg_color(lv.color_hex(0x000000), 0)
scr.clean()

title = lv.label(scr)
title.set_text("Gesture")
title.set_style_text_color(lv.color_hex(0xFFFFFF), 0)
title.align(lv.ALIGN.TOP_MID, 0, 4)

status = lv.label(scr)
status.align(lv.ALIGN.TOP_MID, 0, 24)

value = lv.label(scr)
value.set_style_text_color(lv.color_hex(0xFFFF00), 0)
value.align(lv.ALIGN.CENTER, 0, 0)
value.set_text("-")

count_lbl = lv.label(scr)
count_lbl.set_style_text_color(lv.color_hex(0x808080), 0)
count_lbl.align(lv.ALIGN.BOTTOM_MID, 0, -6)
count_lbl.set_text("count: 0")

_count = 0
_last_poll = 0

_ALL_BITS = (
    g.GESTURE_UP, g.GESTURE_DOWN, g.GESTURE_LEFT, g.GESTURE_RIGHT,
    g.GESTURE_FORWARD, g.GESTURE_BACKWARD,
    g.GESTURE_CLOCKWISE, g.GESTURE_COUNTERCLOCKWISE,
    g.GESTURE_WAVE, g.GESTURE_HOVER, g.GESTURE_UNKNOWN,
    g.GESTURE_CLOCKWISE_C, g.GESTURE_COUNTERCLOCKWISE_C,
)


def _set_ok(msg):
    status.set_style_text_color(lv.color_hex(0x00FF00), 0)
    status.set_text(msg)


def _set_err(msg):
    status.set_style_text_color(lv.color_hex(0xFF0000), 0)
    status.set_text(msg)


if not sensor.begin():
    _set_err("not found 0x{:02X}".format(g.DEV_ADDRESS))
else:
    sensor.enable_gestures(g.GESTURE_ALL)
    _set_ok("ready  PID:0x{:04X}".format(sensor.pid()))

    while not hub.buttons.center():
        now = time.ticks_ms()
        if time.ticks_diff(now, _last_poll) >= 50:
            _last_poll = now
            if sensor.data_ready():
                bits = sensor.gesture()
                if bits:
                    names = [g.gesture_name(b) for b in _ALL_BITS if bits & b]
                    if names:
                        _count += 1
                        value.set_text(" + ".join(names))
                        count_lbl.set_text("count: {}".format(_count))
        lv.timer_handler()
        time.sleep_ms(10)
