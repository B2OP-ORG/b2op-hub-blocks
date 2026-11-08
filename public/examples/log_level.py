import hub, lvgl as lv, time

LEVELS = [
    (0, "NONE",    0x888888),
    (1, "ERROR",   0xFF4444),
    (2, "WARN",    0xFF8800),
    (3, "INFO",    0x44AAFF),
    (4, "DEBUG",   0x44FF88),
    (5, "VERBOSE", 0x800080),
]

_idx = hub.log.getLevel()

scr      = lv.screen_active()
title_lbl = lv.label(scr)
num_lbl   = lv.label(scr)
name_lbl  = lv.label(scr)
hint_lbl  = lv.label(scr)


def _apply():
    lvl_num, lvl_name, color = LEVELS[_idx]
    hub.log.setLevel(lvl_num)
    num_lbl.set_text(str(lvl_num))
    name_lbl.set_text(lvl_name)
    name_lbl.set_style_text_color(lv.color_hex(color), 0)

def setup():
    global title_lbl, num_lbl, name_lbl, hint_lbl, scr
    scr = lv.screen_active()
    scr.set_style_bg_color(lv.color_hex(0x000000), 0)
    scr.clean()

    title_lbl = lv.label(scr)
    title_lbl.set_text("Log Level")
    title_lbl.set_style_text_color(lv.color_hex(0xFFFFFF), 0)
    title_lbl.align(lv.ALIGN.TOP_MID, 0, 6)

    num_lbl = lv.label(scr)
    num_lbl.set_style_text_color(lv.color_hex(0xAAAAAA), 0)
    num_lbl.set_style_text_font(lv.font_montserrat_14, 0)
    num_lbl.align(lv.ALIGN.CENTER, 0, -18)

    name_lbl = lv.label(scr)
    name_lbl.set_style_text_font(lv.font_montserrat_16, 0)
    name_lbl.align(lv.ALIGN.CENTER, 0, 8)

    hint_lbl = lv.label(scr)
    hint_lbl.set_text("UP / DOWN to change")
    hint_lbl.set_style_text_color(lv.color_hex(0x555555), 0)
    hint_lbl.align(lv.ALIGN.BOTTOM_MID, 0, -6)

    _apply()


@hub.buttons.on("up")
def on_up():
    global _idx
    if _idx < len(LEVELS) - 1:
        _idx += 1
        _apply()


@hub.buttons.on("down")
def on_down():
    global _idx
    if _idx > 0:
        _idx -= 1
        _apply()

exit_requested = False
@hub.buttons.on("center")
def on_exit():
    global exit_requested
    exit_requested = True

setup()
while not exit_requested:
    lv.timer_handler()
    time.sleep_ms(5)
