import lvgl as lv


def draw(parent):
    obj = lv.obj(parent)
    obj.set_size(16, 16)
    obj.set_style_radius(3, 0)
    obj.set_style_bg_color(lv.color_hex(0x1E293B), 0)
    obj.set_style_bg_opa(lv.OPA.COVER, 0)
    obj.set_style_border_color(lv.color_hex(0x64748B), 0)
    obj.set_style_border_width(1, 0)
    obj.set_style_pad_all(0, 0)
    # 3 expanding horizontal bars (sonar / distance waves)
    for i, (w, dy) in enumerate(((4, -3), (7, 0), (10, 3))):
        bar = lv.obj(obj)
        bar.set_size(w, 1)
        bar.set_style_radius(0, 0)
        bar.set_style_bg_color(lv.color_hex(0x22D3EE), 0)
        bar.set_style_bg_opa(lv.OPA.COVER, 0)
        bar.set_style_border_width(0, 0)
        bar.set_style_pad_all(0, 0)
        bar.align(lv.ALIGN.LEFT_MID, 2, dy)
    return obj
