"""MIDI file browser — navigate .mid files on the SD card and play them.

Controls:
  UP / DOWN   scroll file list
  CENTER      play selected file  (press again to stop)
  LEFT        exit

Place Standard MIDI Files (format 0 or 1) on the SD card as /sd/*.mid.
Up to 8 voices play simultaneously; uses the sine wave type by default.

Convert any MIDI to format 0 with:
    midicsv song.mid | grep -v "^[0-9]*, [^0], " | csvmidi > song_f0.mid
or export as "format 0" from your DAW.
"""

import hub, lvgl as lv, time, os

MIDI_DIR  = "/sd"
WAVE_TYPE = "sine"      # "sine", "square", or "sawtooth"
VISIBLE   = 6           # rows visible on screen at once

# ── init LCD ────────────────────────────────────────────────────────────────

hub.lcd.init()
hub.lcd.on()
scr = lv.screen_active()
scr.set_style_bg_color(lv.color_hex(0x000000), 0)

# ── scan files ───────────────────────────────────────────────────────────────

def scan_midi(path):
    try:
        return sorted(f for f in os.listdir(path) if f.lower().endswith(".mid"))
    except OSError:
        return []

files = scan_midi(MIDI_DIR)

# ── UI widgets ───────────────────────────────────────────────────────────────

WHITE  = lv.color_hex(0xFFFFFF)
YELLOW = lv.color_hex(0xFFFF00)
GRAY   = lv.color_hex(0x888888)

status_lbl = lv.label(scr)
status_lbl.set_pos(0, 2)
status_lbl.set_width(160)
status_lbl.set_style_text_color(GRAY, 0)

list_lbl = lv.label(scr)
list_lbl.set_pos(2, 20)
list_lbl.set_width(158)
list_lbl.set_style_text_color(WHITE, 0)
list_lbl.set_recolor(True)

playing_lbl = lv.label(scr)
playing_lbl.set_pos(0, 110)
playing_lbl.set_width(160)
playing_lbl.set_style_text_color(YELLOW, 0)
playing_lbl.set_text("")

# ── display helpers ───────────────────────────────────────────────────────────

selected = 0
playing  = False

def stem(filename):
    name = filename[:-4] if filename.lower().endswith(".mid") else filename
    return name[:16] + "~" if len(name) > 17 else name

def refresh():
    if not files:
        status_lbl.set_text("No .mid files on /sd/")
        list_lbl.set_text("")
        playing_lbl.set_text("")
        return

    status_lbl.set_text(f"{selected + 1} / {len(files)}")

    start = max(0, selected - VISIBLE // 2)
    start = min(start, max(0, len(files) - VISIBLE))

    lines = []
    for i in range(start, min(start + VISIBLE, len(files))):
        arrow = "#ffff00 ># " if i == selected else "  "
        lines.append(arrow + stem(files[i]))
    list_lbl.set_text("\n".join(lines))

    if playing:
        playing_lbl.set_text(f"Playing: {stem(files[selected])}")
    else:
        playing_lbl.set_text("CENTER to play")

refresh()

# ── main loop ─────────────────────────────────────────────────────────────────

prev_up = prev_down = prev_center = False

while not hub.buttons.left():
    cur_up     = hub.buttons.up()
    cur_down   = hub.buttons.down()
    cur_center = hub.buttons.center()

    up_edge     = cur_up     and not prev_up
    down_edge   = cur_down   and not prev_down
    center_edge = cur_center and not prev_center

    if playing:
        if hub.audio.is_finished():
            playing = False
            refresh()
        elif center_edge:
            hub.audio.stop()
            playing = False
            refresh()
    else:
        if files:
            if up_edge:
                selected = (selected - 1) % len(files)
                refresh()
            if down_edge:
                selected = (selected + 1) % len(files)
                refresh()
            if center_edge:
                hub.audio.set_wave_type(WAVE_TYPE)
                hub.audio.play_midi(MIDI_DIR + "/" + files[selected], block=False)
                playing = True
                refresh()

    prev_up     = cur_up
    prev_down   = cur_down
    prev_center = cur_center

    lv.timer_handler()
    time.sleep_ms(50)
