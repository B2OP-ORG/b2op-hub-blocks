import hub, lvgl as lv, time

scr = lv.screen_active()
scr.clean()
scr.set_style_bg_color(lv.color_black(), 0)

title = lv.label(scr)
title.set_text("IMU")
title.set_style_text_color(lv.color_white(), 0)
title.align(lv.ALIGN.TOP_MID, 0, 2)

attitude = lv.label(scr)
attitude.set_style_text_color(lv.color_white(), 0)
attitude.align(lv.ALIGN.TOP_LEFT, 4, 20)

accel = lv.label(scr)
accel.set_style_text_color(lv.color_white(), 0)
accel.align(lv.ALIGN.TOP_LEFT, 4, 74)

while not hub.buttons.center():
    p = hub.imu.pitch
    y = hub.imu.yaw
    r = hub.imu.roll
    a = hub.imu.acceleration
    attitude.set_text(
        "pitch {:>6.1f}\nyaw   {:>6.1f}\nroll  {:>6.1f}".format(p, y, r)
    )
    accel.set_text(
        "ax {:>6.0f} mG\nay {:>6.0f} mG\naz {:>6.0f} mG".format(a.x, a.y, a.z)
    )
    lv.timer_handler()
