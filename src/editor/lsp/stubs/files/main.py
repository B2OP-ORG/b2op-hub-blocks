import micropython
import hub
import time

micropython.kbd_intr(-1)

_has_menu_hw = hasattr(hub, 'lcd') and hasattr(hub, 'buttons')

if not _has_menu_hw:
    _missing = []
    if not hasattr(hub, 'lcd'):     _missing.append('LCD')
    if not hasattr(hub, 'buttons'): _missing.append('buttons')
    print("Required hardware not available:", ', '.join(_missing))

try:
    import ble_uart
    import protocol
    ble_uart.start()
    ble_uart.adv_reset()
    protocol.install_stream_redirect()
    hub.on("poll", protocol.poll)
except Exception as e:
    print("Protocol init failed:", e)
    print("Dropping to REPL.")
else:
    if _has_menu_hw:
        hub.lcd.backlight(150)
        import os
        from config import Config
        _cfg = Config()
        if _cfg.usb_msc:
            try:
                os.umount("/sd")
            except OSError:
                pass
            try:
                sd = hub.sd_card()
                if sd is not None:
                    sd.deinit()
            except Exception:
                pass
            hub.set_usb_msc(True)
        import menu
        while hub.buttons.center():
            time.sleep_ms(50)
            pass
        menu.run()
    else:
        print("Running protocol only.")
        while True:
            time.sleep_ms(50)
