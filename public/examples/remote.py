"""Remote hub scanner: mirror status + color readings to the LCD instead of serial."""

import lpf2, hub, lvgl as lv, time

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

_hub = lpf2.hub()
_port = None
_dev = None
_done = False

scr = lv.screen_active()
scr.set_style_bg_color(lv.color_hex(0x000000), 0)
scr.clean()

status = lv.label(scr)
status.set_style_text_color(lv.color_hex(0xFFFFFF), 0)
status.align(lv.ALIGN.TOP_MID, 0, 4)

detail = lv.label(scr)
detail.set_style_text_color(lv.color_hex(0xFFFF00), 0)
detail.align(lv.ALIGN.CENTER, 0, 8)


def _show(msg, val=""):
    status.set_text(msg)
    detail.set_text(val)


_show("Waiting for HUB")

@hub.buttons.on("center")
def on_exit():
    global _done
    _done = True

while not _done:
    lv.timer_handler()
    if not _hub.isConnected():
        if _hub.isConnecting():
            _show("Connecting...")
            if not _hub.connectHub():
                _show("Connect failed")
                time.sleep_ms(500)
        elif not _hub.isScanning():
            _show("Scanning...")
            _hub.init()
            time.sleep(1)
        else:
            _show("Scanning...")
            time.sleep_ms(100)
        continue

    if _port is None:
        _show("Connected")
        time.sleep_ms(100)
        port = _hub.getPort(lpf2.port_num.controlplus.LED)
        if isinstance(port, lpf2.port):
            port.setRgbColorIdx(lpf2.color.GREEN)
        _port = port
        continue

    A = _hub.getPort(lpf2.port_num.controlplus.A)
    if _dev is None:
        if A is None:
            _show("Port A missing")
            raise ValueError("Port A not found.")
        if A.isDeviceConnected():
            _dev = A.device()
            _show("Wait CYAN")
        else:
            time.sleep_ms(100)
        continue

    if isinstance(_dev, lpf2.devices.color_sensor):
        idx = _dev.getColorIdx()
        if idx == lpf2.color.CYAN:
            _show("Done.")
            _done = True
        else:
            _show("Color", _COLOR_NAMES.get(idx, str(idx)))
            time.sleep_ms(100)
    else:
        time.sleep_ms(100)
