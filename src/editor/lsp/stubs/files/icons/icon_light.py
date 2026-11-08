import lvgl as lv


def draw(parent):
    obj = lv.obj(parent)
    obj.set_size(16, 16)
    obj.set_style_radius(3, 0)
    obj.set_style_bg_color(lv.color_hex(0x2A1F00), 0)
    obj.set_style_bg_opa(lv.OPA.COVER, 0)
    obj.set_style_border_color(lv.color_hex(0xFBBF24), 0)
    obj.set_style_border_width(1, 0)
    obj.set_style_pad_all(0, 0)
    # Central circle
    circle = lv.obj(obj)
    circle.set_size(6, 6)
    circle.set_style_radius(3, 0)
    circle.set_style_bg_color(lv.color_hex(0xFBBF24), 0)
    circle.set_style_bg_opa(lv.OPA.COVER, 0)
    circle.set_style_border_width(0, 0)
    circle.set_style_pad_all(0, 0)
    circle.align(lv.ALIGN.CENTER, 0, 0)
    # 4 rays: top, bottom, left, right
    for (dx, dy, w, h) in ((0, -5, 2, 3), (0, 5, 2, 3), (-5, 0, 3, 2), (5, 0, 3, 2)):
        ray = lv.obj(obj)
        ray.set_size(w, h)
        ray.set_style_radius(0, 0)
        ray.set_style_bg_color(lv.color_hex(0xFBBF24), 0)
        ray.set_style_bg_opa(lv.OPA.COVER, 0)
        ray.set_style_border_width(0, 0)
        ray.set_style_pad_all(0, 0)
        ray.align(lv.ALIGN.CENTER, dx, dy)
    return obj
