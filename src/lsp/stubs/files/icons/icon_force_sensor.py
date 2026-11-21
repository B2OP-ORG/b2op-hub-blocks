import lvgl as lv


def draw(parent):
    obj = lv.obj(parent)
    obj.set_size(16, 16)
    obj.set_style_radius(3, 0)
    obj.set_style_bg_color(lv.color_hex(0x3B0F2A), 0)
    obj.set_style_bg_opa(lv.OPA.COVER, 0)
    obj.set_style_border_color(lv.color_hex(0xC084FC), 0)
    obj.set_style_border_width(1, 0)
    obj.set_style_pad_all(0, 0)
    # Downward arrow: vertical bar + arrowhead
    bar = lv.obj(obj)
    bar.set_size(2, 7)
    bar.set_style_radius(0, 0)
    bar.set_style_bg_color(lv.color_hex(0xC084FC), 0)
    bar.set_style_bg_opa(lv.OPA.COVER, 0)
    bar.set_style_border_width(0, 0)
    bar.set_style_pad_all(0, 0)
    bar.align(lv.ALIGN.CENTER, 0, -2)
    for dx, dy in ((-3, 2), (3, 2)):
        wing = lv.obj(obj)
        wing.set_size(2, 4)
        wing.set_style_radius(0, 0)
        wing.set_style_bg_color(lv.color_hex(0xC084FC), 0)
        wing.set_style_bg_opa(lv.OPA.COVER, 0)
        wing.set_style_border_width(0, 0)
        wing.set_style_pad_all(0, 0)
        wing.align(lv.ALIGN.CENTER, dx, 3)
    return obj
