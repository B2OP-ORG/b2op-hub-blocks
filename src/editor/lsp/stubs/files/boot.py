import hub,machine,vfs,gc,lpf2,lvgl,bluetooth

gc.enable()
gc.threshold(4096)

# Init BLE stack once at boot. lpf2.hub_emulation and the user-facing
# `bluetooth` module both share this stack (lpf2 no longer owns it).
try:
    bluetooth.BLE().active(True)
except Exception as e:
    print("BLE init failed:", e)

hub.lcd.init()
scr = lvgl.screen_active()
scr.invalidate()

try:
    if hub.board.SD_MODE == 2:
        print("Initializing SD card in SD mode...")
        width = hub.board.SD_WIDTH
        if width == 1:
            sd = machine.SDCard(slot=hub.board.SD_SLOT, width=hub.board.SD_WIDTH, cmd=hub.board.SD_CMD, sck=hub.board.SD_CLK, data=[hub.board.SD_D0]) # pyright: ignore[reportArgumentType]
        else:
            sd = machine.SDCard(slot=hub.board.SD_SLOT, width=hub.board.SD_WIDTH, cmd=hub.board.SD_CMD, sck=hub.board.SD_CLK, data=(hub.board.SD_D0, hub.board.SD_D1, hub.board.SD_D2, hub.board.SD_D3))
    elif hub.board.SD_MODE == 1:
        print("Initializing SD card in SPI mode...")
        if hub.board.SD_CS <= 0:
            raise Exception("SD card CS pin not configured.")
        else:
            sd = machine.SDCard(slot=hub.board.SD_SLOT, sck=hub.board.SD_SCK, mosi=hub.board.SD_MOSI, miso=hub.board.SD_MISO, cs=hub.board.SD_CS)
    else:
        print("No SD card mode configured for this board.")
        sd = None
    vfs.mount(sd, '/sd')
    print("SD card mounted at /sd")
except Exception as e:
    print("Failed to mount SD card:", e)

hub.led.setColorIdx(lpf2.color.GREEN)

hub.lcd.backlight(150)