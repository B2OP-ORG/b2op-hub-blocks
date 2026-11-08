import lvgl as lv


def draw(parent):
    obj = lv.obj(parent)
    obj.set_size(16, 16)
    obj.set_style_radius(8, 0)
    obj.set_style_bg_color(lv.color_hex(0x0F4C75), 0)
    obj.set_style_bg_opa(lv.OPA.COVER, 0)
    obj.set_style_border_color(lv.color_hex(0x22D3EE), 0)
    obj.set_style_border_width(1, 0)
    obj.set_style_pad_all(0, 0)
    lbl = lv.label(obj)
    lbl.set_text("M")
    lbl.set_style_text_color(lv.color_hex(0xFFFFFF), 0)
    lbl.align(lv.ALIGN.CENTER, 0, 0)
    return obj
