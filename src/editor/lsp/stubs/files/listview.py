import lvgl as lv
import time

import battery

SCREEN_W = 160
SCREEN_H = 128

COLOR_BG = 0x0F172A
COLOR_HEADER_BG = 0x1E293B
COLOR_TEXT = 0xE2E8F0
COLOR_MUTED = 0x94A3B8
COLOR_ACCENT = 0x22D3EE
COLOR_ACCENT_TEXT = 0x0F172A

HEADER_H = 20
ITEM_PAD_V = 2
ITEM_PAD_H = 6
ITEM_RADIUS = 6


def apply_screen_bg(scr):
    scr.set_style_bg_color(lv.color_hex(COLOR_BG), 0)
    scr.set_style_bg_opa(lv.OPA.COVER, 0)


def _style_panel(obj):
    obj.set_style_border_width(0, 0)
    obj.set_style_radius(0, 0)
    obj.set_style_pad_all(0, 0)
    obj.set_style_bg_color(lv.color_hex(COLOR_BG), 0)
    obj.set_style_bg_opa(lv.OPA.COVER, 0)


def new_header(parent, title):
    hdr = lv.obj(parent)
    _style_panel(hdr)
    hdr.set_size(SCREEN_W, HEADER_H)
    hdr.set_style_bg_color(lv.color_hex(COLOR_HEADER_BG), 0)
    hdr.set_style_pad_left(6, 0)
    hdr.set_style_pad_right(6, 0)
    hdr.set_style_pad_top(2, 0)
    hdr.set_style_pad_bottom(2, 0)
    hdr.set_style_border_color(lv.color_hex(COLOR_ACCENT), 0)
    hdr.set_style_border_width(1, 0)
    hdr.set_style_border_side(lv.BORDER_SIDE.BOTTOM, 0)
    hdr.set_style_border_opa(lv.OPA.COVER, 0)

    lbl = lv.label(hdr)
    lbl.set_text(title)
    lbl.set_style_text_color(lv.color_hex(COLOR_ACCENT), 0)
    lbl.align(lv.ALIGN.LEFT_MID, 0, 0)

    batt = lv.label(hdr)
    batt.set_style_text_color(lv.color_hex(COLOR_MUTED), 0)
    batt.align(lv.ALIGN.RIGHT_MID, 0, 0)
    batt.set_text(battery.text())
    battery.attach(batt, COLOR_MUTED)
    return hdr, lbl


def _style_item(label, selected):
    label.set_style_pad_top(ITEM_PAD_V, 0)
    label.set_style_pad_bottom(ITEM_PAD_V, 0)
    label.set_style_pad_left(ITEM_PAD_H, 0)
    label.set_style_pad_right(ITEM_PAD_H, 0)
    label.set_style_radius(ITEM_RADIUS, 0)
    label.set_width(SCREEN_W - 8)
    if selected:
        label.set_style_bg_color(lv.color_hex(COLOR_ACCENT), 0)
        label.set_style_bg_opa(lv.OPA.COVER, 0)
        label.set_style_text_color(lv.color_hex(COLOR_ACCENT_TEXT), 0)
    else:
        label.set_style_bg_opa(lv.OPA.TRANSP, 0)
        label.set_style_text_color(lv.color_hex(COLOR_TEXT), 0)


class ListView:
    def __init__(self, parent, title, items):
        self.items = list(items)
        self.sel = 0
        self._closed = False

        self.root = lv.obj(parent)
        _style_panel(self.root)
        self.root.set_size(SCREEN_W, SCREEN_H)
        self.root.center()
        self.root.set_flex_flow(lv.FLEX_FLOW.COLUMN)
        self.root.set_style_pad_row(0, 0)

        self.header, self.title = new_header(self.root, title)

        self.body = lv.obj(self.root)
        _style_panel(self.body)
        self.body.set_width(SCREEN_W)
        self.body.set_flex_grow(1)
        self.body.set_flex_flow(lv.FLEX_FLOW.COLUMN)
        self.body.set_style_pad_all(4, 0)
        self.body.set_style_pad_row(2, 0)
        self.body.set_scroll_dir(lv.DIR.VER)

        self.labels = []
        for _ in self.items:
            self.labels.append(self._mk_label())
        self._refresh()

    def _mk_label(self):
        l = lv.label(self.body)
        _style_item(l, False)
        return l

    def set_items(self, title, items, sel=0):
        if self._closed:
            return
        self.items = list(items)
        self.sel = min(sel, max(0, len(self.items) - 1))
        try:
            self.title.set_text(title)
            while len(self.labels) < len(self.items):
                self.labels.append(self._mk_label())
            while len(self.labels) > len(self.items):
                self.labels.pop().delete()
        except Exception:
            self._closed = True
            return
        self._refresh()

    def _refresh(self):
        if self._closed:
            return
        try:
            for i, l in enumerate(self.labels):
                l.set_text(self.items[i])
                _style_item(l, i == self.sel)
            if self.labels:
                self.labels[self.sel].scroll_to_view(False)
            time.sleep_ms(0)
        except Exception:
            self._closed = True

    def move(self, d):
        if self._closed:
            return
        n = len(self.items)
        if n:
            self.sel = (self.sel + d) % n
            self._refresh()

    def close(self):
        if self._closed:
            return
        self._closed = True
        try:
            self.root.delete()
        except Exception:
            pass


def text_screen(parent, title, body_text, hint=None):
    root = lv.obj(parent)
    _style_panel(root)
    root.set_size(SCREEN_W, SCREEN_H)
    root.center()
    root.set_flex_flow(lv.FLEX_FLOW.COLUMN)
    root.set_style_pad_row(0, 0)

    new_header(root, title)

    body = lv.obj(root)
    _style_panel(body)
    body.set_width(SCREEN_W)
    body.set_flex_grow(1)
    body.set_style_pad_all(6, 0)

    lbl = lv.label(body)
    lbl.set_text(body_text)
    lbl.set_width(SCREEN_W - 12)
    lbl.set_style_text_color(lv.color_hex(COLOR_TEXT), 0)

    if hint:
        h = lv.label(body)
        h.set_text(hint)
        h.set_style_text_color(lv.color_hex(COLOR_MUTED), 0)
        h.align(lv.ALIGN.BOTTOM_LEFT, 0, 0)

    time.sleep_ms(0)
    return root
