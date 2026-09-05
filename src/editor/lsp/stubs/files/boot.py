import hub,gc,lpf2,lvgl,bluetooth

gc.enable()
gc.threshold(4096)

# Init BLE stack once at boot. lpf2.hub_emulation and the user-facing
# `bluetooth` module both share this stack (lpf2 no longer owns it).
try:
    bluetooth.BLE().active(True)
except Exception as e:
    print("BLE init failed:", e)

if hasattr(hub, 'lcd'):
    hub.lcd.init()
    hub.lcd.off()
    scr = lvgl.screen_active()
    scr.invalidate()


if hasattr(hub, 'led'):
    hub.led.setColorIdx(lpf2.color.GREEN)