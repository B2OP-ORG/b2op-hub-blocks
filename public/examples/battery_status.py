import hub, lvgl as lv, time

STATE_NAMES = {
    hub.battery.UNKNOWN: "unknown",
    hub.battery.ON_BATTERY: "on battery",
    hub.battery.CHARGING: "charging",
    hub.battery.FULLY_CHARGED: "full",
}

scr = lv.screen_active()
scr.set_style_bg_color(lv.color_hex(0x000000), 0)
scr.clean()

title_lbl = lv.label(scr)
title_lbl.set_text("Battery")
title_lbl.set_style_text_color(lv.color_hex(0xFFFFFF), 0)
title_lbl.align(lv.ALIGN.TOP_MID, 0, 4)

pct_lbl = lv.label(scr)
pct_lbl.set_style_text_color(lv.color_hex(0x00FF00), 0)
pct_lbl.align(lv.ALIGN.TOP_MID, 0, 22)

bar = lv.bar(scr)
bar.set_size(140, 14)
bar.set_range(0, 100)
bar.align(lv.ALIGN.CENTER, 0, -4)

volt_lbl = lv.label(scr)
volt_lbl.set_style_text_color(lv.color_hex(0xFFFFFF), 0)
volt_lbl.align(lv.ALIGN.CENTER, 0, 22)

state_lbl = lv.label(scr)
state_lbl.set_style_text_color(lv.color_hex(0xFFFF00), 0)
state_lbl.align(lv.ALIGN.BOTTOM_MID, 0, -6)


def refresh():
    pct = hub.battery.percent()
    mv = hub.battery.voltage()
    st = hub.battery.state()

    pct_lbl.set_text("{} %".format(pct))
    volt_lbl.set_text("{}.{:03d} V".format(mv // 1000, mv % 1000))
    state_lbl.set_text(STATE_NAMES.get(st, "?"))
    bar.set_value(pct, 0)

    if hub.battery.charging():
        color = 0x00A0FF
    elif hub.battery.fully_charged():
        color = 0x00FF00
    elif pct < 20:
        color = 0xFF0000
    else:
        color = 0xFFFFFF
    pct_lbl.set_style_text_color(lv.color_hex(color), 0)


refresh()

next_ms = 0
while not hub.buttons.center():
    now = time.ticks_ms()
    if time.ticks_diff(now, next_ms) >= 0:
        refresh()
        next_ms = time.ticks_add(now, 1000)
    lv.timer_handler()
