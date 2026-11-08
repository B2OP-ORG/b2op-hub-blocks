import hub, lvgl as lv, time

hub.lcd.init()
hub.lcd.on()
scr = lv.screen_active()
btn = lv.button(scr)
btn.center()
lv.label(btn).set_text("hi")

# Idle loop — keeps the script alive so the LCD stays visible.
while not hub.buttons.center():
    lv.timer_handler()
