import lvgl as lv
import hub
import os
import sys
import gc
import time

import runner
import protocol
import battery
from config import Config
from listview import (
    SCREEN_W, SCREEN_H,
    COLOR_BG, COLOR_TEXT, COLOR_MUTED, COLOR_ACCENT,
    apply_screen_bg, new_header, ListView, text_screen,
)

POLL_MS = 30

IDLE_DIM_MS = 300_000
IDLE_OFF_MS = 420_000
BACKLIGHT_ACTIVE = 150
BACKLIGHT_DIM = 20

MENU_ITEMS = ["Run program", "Hardware", "Settings", "Power off"]
HARDWARE_ITEMS = ["About HW", "Calibrate IMU"]
(STATE_MAIN, STATE_BROWSE, STATE_ABOUT, STATE_SETTINGS,
 STATE_CONFIRM_POWEROFF, STATE_HARDWARE) = range(6)


def about_hw(parent):
    v = sys.version.split(";")[0]
    info = "\n".join([
        "Board: LEGO Hub",
        "MCU:   ESP32-S3",
        "MP: " + v,
        "Free: {} B".format(gc.mem_free()),
    ])
    return text_screen(parent, "About HW", info, hint="left/center: back")


def _is_dir(path):
    try:
        return (os.stat(path)[0] & 0x4000) != 0
    except OSError:
        return False


def _join(parent, name):
    if parent.endswith("/"):
        return parent + name
    return parent + "/" + name


def list_dir(path):
    dirs, files = [], []
    try:
        entries = os.listdir(path)
    except OSError:
        return dirs, files
    for name in entries:
        if name.startswith(".") or name == "System Volume Information":
            continue
        full = _join(path, name)
        if _is_dir(full):
            dirs.append(name)
        elif name.endswith(".py"):
            files.append(name)
    dirs.sort()
    files.sort()
    return dirs, files


def _display_items(dirs, files, at_root):
    items, kinds = [], []
    if not at_root:
        items.append(".. (up)")
        kinds.append("up")
    for d in dirs:
        items.append(d + "/")
        kinds.append("dir")
    for f in files:
        items.append(f)
        kinds.append("file")
    if not items:
        items.append("(empty)")
        kinds.append("empty")
    return items, kinds


def calibrate_imu(scr):
    scr.clean()
    hub.imu.start_calibration()

    root = lv.obj(scr)
    apply_screen_bg(root)
    root.set_style_border_width(0, 0)
    root.set_style_radius(0, 0)
    root.set_style_pad_all(0, 0)
    root.set_size(SCREEN_W, SCREEN_H)
    root.center()
    root.set_flex_flow(lv.FLEX_FLOW.COLUMN)
    root.set_style_pad_row(0, 0)

    new_header(root, "Calibrate IMU")

    body = lv.obj(root)
    body.set_style_border_width(0, 0)
    body.set_style_radius(0, 0)
    body.set_style_bg_color(lv.color_hex(COLOR_BG), 0)
    body.set_width(SCREEN_W)
    body.set_flex_grow(1)
    body.set_style_pad_all(6, 0)

    instr = lv.label(body)
    instr.set_text("figure-8 motion\ntilt through several\nflat orientations")
    instr.set_style_text_color(lv.color_hex(COLOR_TEXT), 0)
    instr.set_width(SCREEN_W - 12)

    status = lv.label(body)
    status.set_style_text_color(lv.color_hex(COLOR_ACCENT), 0)
    status.align(lv.ALIGN.BOTTOM_LEFT, 0, -14)

    hint = lv.label(body)
    hint.set_text("center: save  left: exit")
    hint.set_style_text_color(lv.color_hex(COLOR_MUTED), 0)
    hint.align(lv.ALIGN.BOTTOM_LEFT, 0, 0)

    getters = (hub.buttons.up, hub.buttons.down,
               hub.buttons.left, hub.buttons.right, hub.buttons.center)
    while any(g() for g in getters):
        time.sleep_ms(POLL_MS)

    while True:
        battery.refresh()
        cal = hub.imu.calibrated
        status.set_text("cal: OK" if cal else "cal: ...")

        if hub.buttons.left():
            while hub.buttons.left():
                time.sleep_ms(POLL_MS)
            break
        if hub.buttons.center() or hub.buttons.right():
            if cal:
                ok = hub.imu.save_calibration()
                status.set_text("SAVED" if ok else "save failed")
                while hub.buttons.center() or hub.buttons.right():
                    time.sleep_ms(POLL_MS)
                time.sleep_ms(600)
                break
            else:
                status.set_text("not calibrated")
                while hub.buttons.center() or hub.buttons.right():
                    time.sleep_ms(POLL_MS)
        time.sleep_ms(POLL_MS)

    root.delete()


def _wait_any_button_edge():
    """Full press-and-release cycle. Drains any stuck-held button first, then
    waits for a fresh press, then waits for release so the same event doesn't
    re-fire the caller's next menu action."""
    getters = (hub.buttons.up, hub.buttons.down,
               hub.buttons.left, hub.buttons.right, hub.buttons.center)
    while any(g() for g in getters):
        battery.refresh()
        protocol.poll()
        time.sleep_ms(POLL_MS)
    while not any(g() for g in getters):
        battery.refresh()
        protocol.poll()
        time.sleep_ms(POLL_MS)
    while any(g() for g in getters):
        battery.refresh()
        protocol.poll()
        time.sleep_ms(POLL_MS)


def _settings_items(cfg):
    mark = "[x]" if cfg.allow_full_fs else "[ ]"
    return [mark + " Full FS root"]


def _new_main(scr):
    return ListView(scr, "Menu", MENU_ITEMS)


def _unregister_all():
    for name in ("center", "up", "down", "left", "right"):
        hub.buttons.off(name)


def _reset_to_main(scr, ui):
    scr.clean()
    ui["view"] = _new_main(scr)
    ui["state"] = STATE_MAIN


_BLOCKED_SCRIPTS = ("main.py", "boot.py")


def _run_from_menu(scr, ui, path):
    name = path.rsplit("/", 1)[-1]
    if name in _BLOCKED_SCRIPTS:
        scr.clean()
        text_screen(scr, "Blocked", name + " is a boot script", hint="press any button")
        _wait_any_button_edge()
        _reset_to_main(scr, ui)
        return
    runner.run_program(path, poll_stdin=protocol.poll)
    # runner leaves Done/Error text_screen up; wait for a fresh button cycle,
    # then rebuild the main menu.
    _wait_any_button_edge()
    _reset_to_main(scr, ui)


def run():
    cfg = Config()
    scr = lv.screen_active()
    runner.set_screen(scr)
    apply_screen_bg(scr)

    ui = {
        "state": STATE_MAIN,
        "view": _new_main(scr),
        "about_view": None,
        "root_path": cfg.root(),
        "cur_path": cfg.root(),
        "cur_kinds": [],
    }

    idle = {"last": time.ticks_ms(), "dimmed": False}

    def _note_activity():
        """Reset the idle timer and undim if we were dimmed.

        Called from button callbacks and after sub-flows return so the timer
        resumes from a fresh baseline instead of the stale ticks value from
        before the sub-flow blocked the main loop.
        """
        idle["last"] = time.ticks_ms()
        if idle["dimmed"]:
            hub.lcd.backlight(BACKLIGHT_ACTIVE)
            idle["dimmed"] = False

    def _wake_or_pass(fn):
        """Wrap a button callback so the first press while dimmed only wakes.

        Rising-edge callbacks fire from ``hub.buttons.poll()``. When ``dimmed``
        is set, we still want to refresh the timer and restore brightness, but
        not invoke the underlying handler — the user's intent was "wake up",
        not "trigger the menu action under the button".
        """
        def wrapped():
            was_dimmed = idle["dimmed"]
            _note_activity()
            if was_dimmed:
                return
            fn()
        return wrapped

    def _on_ble_run_finished():
        _wait_any_button_edge()
        _note_activity()
        _reset_to_main(scr, ui)
    protocol.on_run_finished = _on_ble_run_finished

    def enter_browse(path):
        dirs, files = list_dir(path)
        items, kinds = _display_items(dirs, files, at_root=(path == ui["root_path"]))
        title = "Programs" if path == ui["root_path"] else path
        if len(title) > 22:
            title = "..." + title[-19:]
        ui["cur_path"] = path
        ui["cur_kinds"] = kinds
        ui["view"].set_items(title, items, 0)

    def go_up():
        if ui["cur_path"] == ui["root_path"]:
            return False
        parent = ui["cur_path"].rsplit("/", 1)[0]
        if not parent:
            parent = "/"
        enter_browse(parent)
        return True

    def back_to_main():
        ui["view"].set_items("Menu", MENU_ITEMS, 0)
        ui["state"] = STATE_MAIN

    _MOVE_STATES = (STATE_MAIN, STATE_BROWSE, STATE_SETTINGS,
                    STATE_CONFIRM_POWEROFF, STATE_HARDWARE)

    def _on_up():
        if ui["state"] in _MOVE_STATES:
            ui["view"].move(-1)

    def _on_down():
        if ui["state"] in _MOVE_STATES:
            ui["view"].move(1)

    def _on_left():
        s = ui["state"]
        if s == STATE_BROWSE:
            if not go_up():
                back_to_main()
        elif s == STATE_ABOUT:
            if ui["about_view"] is not None:
                ui["about_view"].delete()
            ui["about_view"] = None
            ui["view"] = ListView(scr, "Hardware", HARDWARE_ITEMS)
            ui["state"] = STATE_HARDWARE
        elif s == STATE_SETTINGS:
            back_to_main()
        elif s == STATE_HARDWARE:
            back_to_main()
        elif s == STATE_CONFIRM_POWEROFF:
            back_to_main()

    def _select():
        s = ui["state"]
        if s == STATE_MAIN:
            sel = ui["view"].sel
            if sel == 0:
                ui["root_path"] = cfg.root()
                enter_browse(ui["root_path"])
                ui["state"] = STATE_BROWSE
            elif sel == 1:
                ui["view"].set_items("Hardware", HARDWARE_ITEMS, 0)
                ui["state"] = STATE_HARDWARE
            elif sel == 2:
                ui["view"].set_items("Settings", _settings_items(cfg), 0)
                ui["state"] = STATE_SETTINGS
            else:
                ui["view"].set_items("Power off?", ["No", "Yes"], 0)
                ui["state"] = STATE_CONFIRM_POWEROFF
        elif s == STATE_HARDWARE:
            sel = ui["view"].sel
            if sel == 0:
                ui["view"].close()
                ui["about_view"] = about_hw(scr)
                ui["state"] = STATE_ABOUT
            elif sel == 1:
                ui["view"].close()
                _unregister_all()
                try:
                    calibrate_imu(scr)
                finally:
                    _register_all()
                _note_activity()
                scr.clean()
                ui["view"] = ListView(scr, "Hardware", HARDWARE_ITEMS)
                ui["state"] = STATE_HARDWARE
        elif s == STATE_BROWSE:
            if not ui["cur_kinds"]:
                return
            kind = ui["cur_kinds"][ui["view"].sel]
            label = ui["view"].items[ui["view"].sel]
            if kind == "up":
                go_up()
            elif kind == "dir":
                enter_browse(_join(ui["cur_path"], label.rstrip("/")))
            elif kind == "file":
                path = _join(ui["cur_path"], label)
                ui["view"].close()
                _run_from_menu(scr, ui, path)
                _note_activity()
        elif s == STATE_ABOUT:
            _on_left()
        elif s == STATE_SETTINGS:
            if ui["view"].sel == 0:
                cfg.allow_full_fs = not cfg.allow_full_fs
                cfg.save()
                ui["view"].set_items("Settings", _settings_items(cfg), ui["view"].sel)
        elif s == STATE_CONFIRM_POWEROFF:
            if ui["view"].sel == 1:
                scr.clean()
                text_screen(scr, "Power off", "Shutting down...")
                time.sleep_ms(300)
                hub.powerOff()
            else:
                back_to_main()

    def _on_center():
        _select()

    def _on_right():
        _select()

    def _register_all():
        hub.buttons.on("up", _wake_or_pass(_on_up))
        hub.buttons.on("down", _wake_or_pass(_on_down))
        hub.buttons.on("left", _wake_or_pass(_on_left))
        hub.buttons.on("center", _wake_or_pass(_on_center))
        hub.buttons.on("right", _wake_or_pass(_on_right))
    _register_all()

    def _any_button_held():
        return (hub.buttons.center() or hub.buttons.up() or hub.buttons.down()
                or hub.buttons.left() or hub.buttons.right())

    while True:
        hub.buttons.poll()
        battery.refresh()
        protocol.poll()
        if _any_button_held():
            idle["last"] = time.ticks_ms()
        elapsed = time.ticks_diff(time.ticks_ms(), idle["last"])
        if elapsed >= IDLE_OFF_MS:
            scr.clean()
            text_screen(scr, "Power off", "Idle timeout")
            time.sleep_ms(300)
            hub.powerOff()
        elif elapsed >= IDLE_DIM_MS and not idle["dimmed"]:
            hub.lcd.backlight(BACKLIGHT_DIM)
            idle["dimmed"] = True
        time.sleep_ms(POLL_MS)
