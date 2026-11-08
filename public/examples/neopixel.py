import hub, machine, time
from neopixel import NeoPixel

_hue = 0.0


def hsv_to_rgb(h, s, v):
    """
    h: hue, 0.0-1.0 (wraps around, so any float works via mod)
    s: saturation, 0.0-1.0
    v: value/brightness, 0.0-1.0
    returns: (r, g, b) each 0-255
    """
    h = h % 1.0
    i = int(h * 6.0)  # always 0-5 since h is 0.0-1.0
    f = (h * 6.0) - i
    p = v * (1.0 - s)
    q = v * (1.0 - s * f)
    t = v * (1.0 - s * (1.0 - f))

    if i == 0:
        r, g, b = v, t, p
    elif i == 1:
        r, g, b = q, v, p
    elif i == 2:
        r, g, b = p, v, t
    elif i == 3:
        r, g, b = p, q, v
    elif i == 4:
        r, g, b = t, p, v
    else:
        r, g, b = v, p, q

    return (int(r * 255), int(g * 255), int(b * 255))


def draw_rainbow(strip, start_hue=0.0, hue_increment=0.125, saturation=1.0, value=1.0):
    """
    Fills `strip` (a NeoPixel-like object) with a rainbow gradient.

    start_hue: hue of pixel 0, 0.0-1.0
    hue_increment: how much hue advances per pixel (wraps automatically)
    saturation, value: constant across the strip, 0.0-1.0
    """
    n = strip.n if hasattr(strip, "n") else len(strip)
    for i in range(n):
        hue = start_hue + i * hue_increment
        r, g, b = hsv_to_rgb(hue, saturation, value)
        strip[i] = (r, g, b)
    strip.write()


hub.ports.D.disable()
leds = NeoPixel(machine.Pin(hub.board.PORT_D_ID1_PIN), 8)


@hub.buttons.on("center")
def on_exit():
    hub.ports.D.disable(False)

while not hub.buttons.center():
    draw_rainbow(leds, start_hue=_hue, hue_increment=0.01, saturation=1.0, value=0.2)
    _hue += 0.01  # animate — remove this line for a static rainbow
