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
    # Three colored dots: R, G, B
    colors = (0xFF4444, 0x44FF44, 0x4488FF)
    positions = ((-3, -3), (3, -3), (0, 3))
    for color, (dx, dy) in zip(colors, positions):
        dot = lv.obj(obj)
        dot.set_size(4, 4)
        dot.set_style_radius(2, 0)
        dot.set_style_bg_color(lv.color_hex(color), 0)
        dot.set_style_bg_opa(lv.OPA.COVER, 0)
        dot.set_style_border_width(0, 0)
        dot.set_style_pad_all(0, 0)
        dot.align(lv.ALIGN.CENTER, dx, dy)
    return obj
