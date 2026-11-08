"""Continuously watch port A and show color/distance sensor readings on the LCD."""

import hub, lpf2, lvgl as lv, time

_COLOR = lpf2.device_type.TECHNIC_COLOR_SENSOR
_DISTANCE = lpf2.device_type.TECHNIC_DISTANCE_SENSOR

_COLOR_NAMES = {
    lpf2.color.BLACK: "black",
    lpf2.color.PINK: "pink",
    lpf2.color.PURPLE: "purple",
    lpf2.color.BLUE: "blue",
    lpf2.color.LIGHTBLUE: "lightblue",
    lpf2.color.CYAN: "cyan",
    lpf2.color.GREEN: "green",
    lpf2.color.YELLOW: "yellow",
    lpf2.color.ORANGE: "orange",
    lpf2.color.RED: "red",
    lpf2.color.WHITE: "white",
    lpf2.color.NONE: "none",
}

hub.lcd.init()
hub.lcd.on()
hub.lcd.backlight(200)

scr = lv.screen_active()
scr.set_style_bg_color(lv.color_hex(0x000000), 0)
scr.clean()

title = lv.label(scr)
title.set_style_text_color(lv.color_hex(0xFFFFFF), 0)
title.align(lv.ALIGN.TOP_MID, 0, 4)
title.set_text("Port A")

kind = lv.label(scr)
kind.set_style_text_color(lv.color_hex(0x808080), 0)
kind.align(lv.ALIGN.TOP_MID, 0, 28)
kind.set_text("no sensor")

value = lv.label(scr)
value.set_style_text_color(lv.color_hex(0xFFFF00), 0)
value.align(lv.ALIGN.CENTER, 0, 8)
value.set_text("-")

while not hub.buttons.center():
    port = hub.ports.A
    if port.isDeviceConnected():
        t = port.getDeviceType()
        if t == _COLOR:
            kind.set_text("color")
            idx = int(port.getValue(0, 0))
            value.set_text(_COLOR_NAMES.get(idx, str(idx)))
        elif t == _DISTANCE:
            kind.set_text("distance")
            value.set_text(port.getValueStr(0))
        else:
            kind.set_text("type {}".format(t))
            value.set_text("-")
    else:
        kind.set_text("no sensor")
        value.set_text("-")
    lv.timer_handler()
