"""Port monitor — shows connected device type and readings for each port."""
import lvgl as lv
import hub
from listview import (
    SCREEN_W, SCREEN_H, HEADER_H,
    COLOR_BG, COLOR_TEXT, COLOR_MUTED, COLOR_ACCENT,
    apply_screen_bg, new_header,
)
from icons import (
    icon_motor, icon_encoder_motor, icon_color_sensor,
    icon_distance_sensor, icon_force_sensor, icon_light, icon_unknown,
)

# ── Device-group classification ───────────────────────────────────────────────
_MOTOR_TYPES    = frozenset({1, 2, 38, 39, 41})
_ENCODER_TYPES  = frozenset({46, 47, 48, 49, 75, 76, 100, 101})
_COLOR_TYPES    = frozenset({37, 43, 61})
_DISTANCE_TYPES = frozenset({62})
_FORCE_TYPES    = frozenset({63})
_LIGHT_TYPES    = frozenset({8})


def _device_group(dtype):
    if dtype in _MOTOR_TYPES:    return "motor"
    if dtype in _ENCODER_TYPES:  return "encoder"
    if dtype in _COLOR_TYPES:    return "color"
    if dtype in _DISTANCE_TYPES: return "dist"
    if dtype in _FORCE_TYPES:    return "force"
    if dtype in _LIGHT_TYPES:    return "light"
    return "?"


_ICON_DRAW = {
    "motor":   icon_motor.draw,
    "encoder": icon_encoder_motor.draw,
    "color":   icon_color_sensor.draw,
    "dist":    icon_distance_sensor.draw,
    "force":   icon_force_sensor.draw,
    "light":   icon_light.draw,
}
_ICON_DEFAULT = icon_unknown.draw

# ── Color-sensor palette ──────────────────────────────────────────────────────
_COLOR_RGB = {
    0: 0x1A1A1A, 1: 0xFF69B4, 2: 0x9B30FF, 3: 0x4466FF,
    4: 0xADD8E6, 5: 0x00FFFF, 6: 0x00C040, 7: 0xFFFF00,
    8: 0xFF8000, 9: 0xFF2222, 10: 0xFFFFFF, 255: 0x334155,
}
_COLOR_NAMES = {
    0: "black", 1: "pink",   2: "purple", 3: "blue",
    4: "lblue", 5: "cyan",   6: "green",  7: "yellow",
    8: "orange", 9: "red",  10: "white", 255: "none",
}

# ── Ports present on this board ───────────────────────────────────────────────
_PORT_NAMES = []
for _n in ("A", "B", "C", "D", "E", "F"):
    if getattr(hub.board, "HAS_PORT_" + _n, 0):
        _PORT_NAMES.append(_n)

# ── Cell style constants ──────────────────────────────────────────────────────
_CELL_BG     = 0x1E293B
_CELL_BORDER = 0x334155


def _make_icon(parent, group):
    fn = _ICON_DRAW.get(group, _ICON_DEFAULT)
    obj = fn(parent)
    obj.align(lv.ALIGN.TOP_RIGHT, -3, 2)
    return obj


# ── PortCell ──────────────────────────────────────────────────────────────────
class PortCell:
    def __init__(self, parent, x, y, w, h, port_name):
        self._port_obj = getattr(hub.ports, port_name, None)
        self._group    = None

        self._root = lv.obj(parent)
        self._root.set_pos(x, y)
        self._root.set_size(w, h)
        self._root.set_style_bg_color(lv.color_hex(_CELL_BG), 0)
        self._root.set_style_bg_opa(lv.OPA.COVER, 0)
        self._root.set_style_border_color(lv.color_hex(_CELL_BORDER), 0)
        self._root.set_style_border_width(1, 0)
        self._root.set_style_radius(4, 0)
        self._root.set_style_pad_all(0, 0)

        # Port letter
        name_lbl = lv.label(self._root)
        name_lbl.set_text(port_name)
        name_lbl.set_style_text_color(lv.color_hex(COLOR_ACCENT), 0)
        name_lbl.align(lv.ALIGN.TOP_LEFT, 3, 2)

        # Device icon (swapped on group change)
        self._icon = _make_icon(self._root, "?")

        # Group label (muted, above reading)
        self._group_lbl = lv.label(self._root)
        self._group_lbl.set_text("---")
        self._group_lbl.set_style_text_color(lv.color_hex(COLOR_MUTED), 0)
        self._group_lbl.align(lv.ALIGN.BOTTOM_LEFT, 3, -14)

        # Color dot (circle, hidden by default)
        self._dot = lv.obj(self._root)
        self._dot.set_size(8, 8)
        self._dot.set_style_radius(4, 0)
        self._dot.set_style_bg_color(lv.color_hex(0x334155), 0)
        self._dot.set_style_bg_opa(lv.OPA.COVER, 0)
        self._dot.set_style_border_color(lv.color_hex(0x888888), 0)
        self._dot.set_style_border_width(1, 0)
        self._dot.set_style_pad_all(0, 0)
        self._dot.align(lv.ALIGN.BOTTOM_LEFT, 3, -3)
        self._dot.set_style_opa(lv.OPA.TRANSP, 0)

        # Reading label (inset to leave room for dot when visible)
        self._reading_lbl = lv.label(self._root)
        self._reading_lbl.set_text("")
        self._reading_lbl.set_style_text_color(lv.color_hex(COLOR_TEXT), 0)
        self._reading_lbl.align(lv.ALIGN.BOTTOM_LEFT, 13, -2)

    def update(self):
        if self._port_obj is None or not self._port_obj.isDeviceConnected():
            if self._group is not None:
                self._group = None
                self._group_lbl.set_text("---")
                self._reading_lbl.set_text("")
                self._dot.set_style_opa(lv.OPA.TRANSP, 0)
                self._icon.delete()
                self._icon = _make_icon(self._root, "?")
            return

        dtype = self._port_obj.getDeviceType()
        group = _device_group(dtype)

        if group != self._group:
            self._group = group
            self._group_lbl.set_text(group)
            self._icon.delete()
            self._icon = _make_icon(self._root, group)

        try:
            if group == "motor":
                v = int(self._port_obj.getValue(0, 0))
                self._reading_lbl.set_text("{}%".format(v))
                self._dot.set_style_opa(lv.OPA.TRANSP, 0)

            elif group == "encoder":
                spd = int(self._port_obj.getValue(1, 0))
                pos = int(self._port_obj.getValue(2, 0))
                self._reading_lbl.set_text("{:+d}% {}d".format(spd, pos))
                self._dot.set_style_opa(lv.OPA.TRANSP, 0)

            elif group == "color":
                idx = int(self._port_obj.getValue(0, 0))
                name = _COLOR_NAMES.get(idx, str(idx))
                rgb  = _COLOR_RGB.get(idx, 0x334155)
                self._dot.set_style_bg_color(lv.color_hex(rgb), 0)
                self._dot.set_style_opa(lv.OPA.COVER, 0)
                self._reading_lbl.set_text(name)

            elif group in ("dist", "force"):
                self._reading_lbl.set_text(self._port_obj.getValueStr(0))
                self._dot.set_style_opa(lv.OPA.TRANSP, 0)

            else:
                self._reading_lbl.set_text("type {}".format(dtype))
                self._dot.set_style_opa(lv.OPA.TRANSP, 0)

        except Exception:
            self._reading_lbl.set_text("?")
            self._dot.set_style_opa(lv.OPA.TRANSP, 0)


import time

# ── Init ──────────────────────────────────────────────────────────────────────
scr = lv.screen_active()
scr.clean()
apply_screen_bg(scr)

new_header(scr, "Ports")

n      = len(_PORT_NAMES)
rows   = (n + 1) // 2
body_y = HEADER_H
body_h = SCREEN_H - HEADER_H
cell_w = SCREEN_W // 2
cell_h = body_h // rows if rows else body_h

_cells = []
for i, name in enumerate(_PORT_NAMES):
    col = i % 2
    row = i // 2
    x   = col * cell_w
    y   = body_y + row * cell_h
    h   = cell_h if (row < rows - 1) else (body_h - row * cell_h)
    _cells.append(PortCell(scr, x, y, cell_w, h, name))

# ── Main loop ─────────────────────────────────────────────────────────────────
while not hub.buttons.center():
    for cell in _cells:
        cell.update()
    lv.timer_handler()
    time.sleep_ms(150)
