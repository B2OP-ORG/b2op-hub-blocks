import lvgl as lv


def draw(parent):
    obj = lv.obj(parent)
    obj.set_size(16, 16)
    obj.set_style_radius(3, 0)
    obj.set_style_bg_color(lv.color_hex(0x334155), 0)
    obj.set_style_bg_opa(lv.OPA.COVER, 0)
    obj.set_style_border_color(lv.color_hex(0x64748B), 0)
    obj.set_style_border_width(1, 0)
    obj.set_style_pad_all(0, 0)
    return obj
