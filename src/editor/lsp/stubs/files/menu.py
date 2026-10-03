import lvgl as lv
import hub
import os
import sys
import gc
import time

import runner
import protocol
import battery
try:
    import ble_uart as _ble_uart
except ImportError:
    _ble_uart = None
from config import Config
from menu_node import Menu
from listview import (
    SCREEN_W, SCREEN_H,
    COLOR_BG, COLOR_TEXT, COLOR_MUTED, COLOR_ACCENT,
    apply_screen_bg, new_header, ListView, text_screen,
)

POLL_MS = 30

IDLE_DIM_MS = 300_000
IDLE_OFF_MS = 420_000
IDLE_OFF_BLE_MS = 1_800_000
BACKLIGHT_ACTIVE = 150
BACKLIGHT_DIM = 20

_BLOCKED_SCRIPTS = ("main.py", "boot.py")
_DEBOUNCE_MS = 60


def _show_about(scr):
    scr.clean()
    apply_screen_bg(scr)

    root = lv.obj(scr)
    root.set_size(SCREEN_W, SCREEN_H)
    root.center()
    root.set_style_bg_color(lv.color_hex(COLOR_BG), 0)
    root.set_style_bg_opa(lv.OPA.COVER, 0)
    root.set_style_border_width(0, 0)
    root.set_style_radius(0, 0)
    root.set_style_pad_all(0, 0)
    root.set_flex_flow(lv.FLEX_FLOW.COLUMN)
    root.set_style_pad_row(0, 0)
    new_header(root, "About")

    body = lv.obj(root)
    body.set_style_bg_color(lv.color_hex(COLOR_BG), 0)
    body.set_style_bg_opa(lv.OPA.COVER, 0)
    body.set_style_border_width(0, 0)
    body.set_style_radius(0, 0)
    body.set_width(SCREEN_W)
    body.set_flex_grow(1)
    body.set_style_pad_all(6, 0)
    body.set_scroll_dir(lv.DIR.HOR | lv.DIR.VER)

    v = sys.version.split(";")[0]
    ports_present = ", ".join(
        n for n in ("A", "B", "C", "D", "E", "F")
        if getattr(hub.board, "HAS_PORT_" + n, 0)
    )
    try:
        import uos as _uos
        _st = _uos.statvfs("/")
        fs_free  = _st[0] * _st[3] // 1024
        fs_total = _st[0] * _st[2] // 1024
        fs_info  = "{}/{} kB".format(fs_free, fs_total)
    except Exception:
        fs_info = "n/a"

    lines = [
        "Board:  {} {}".format(hub.board.BOARD_NAME, hub.board.BOARD_VERSION),
        "MCU:    ESP32-S3",
        "MicroPython: {}".format(v),
        "Heap free: {} B".format(gc.mem_free()),
        "VFS free: " + fs_info,
        "Ports: " + (ports_present or "none"),
    ]
    try:
        batt_pct = hub.battery.percent()
        batt_mv  = hub.battery.voltage()
        lines.append("Battery: {}% {}mV".format(batt_pct, batt_mv))
    except Exception:
        pass

    lbl = lv.label(body)
    lbl.set_width(512)
    lbl.set_text("\n".join(lines))
    lbl.set_style_text_color(lv.color_hex(COLOR_TEXT), 0)

    getters = (hub.buttons.up, hub.buttons.down,
               hub.buttons.left, hub.buttons.right, hub.buttons.center)
    while any(g() for g in getters):
        lv.timer_handler()
        time.sleep_ms(POLL_MS)

    SCROLL_PX = 12
    while True:
        battery.refresh()

        if hub.buttons.center():
            while hub.buttons.center():
                lv.timer_handler()
                time.sleep_ms(POLL_MS)
            break

        dy = dx = 0
        if hub.buttons.up():    dy =  SCROLL_PX
        if hub.buttons.down():  dy = -SCROLL_PX
        if hub.buttons.left():  dx =  SCROLL_PX
        if hub.buttons.right(): dx = -SCROLL_PX
        if dx or dy:
            body.scroll_by(dx, dy, False)

        lv.timer_handler()
        time.sleep_ms(POLL_MS)

    root.delete()


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
        lv.timer_handler()
        time.sleep_ms(POLL_MS)

    while True:
        battery.refresh()
        cal = hub.imu.calibrated
        status.set_text("cal: OK" if cal else "cal: ...")

        if hub.buttons.left():
            while hub.buttons.left():
                lv.timer_handler()
                time.sleep_ms(POLL_MS)
            break
        if hub.buttons.center() or hub.buttons.right():
            if cal:
                ok = hub.imu.save_calibration()
                status.set_text("SAVED" if ok else "save failed")
                while hub.buttons.center() or hub.buttons.right():
                    lv.timer_handler()
                    time.sleep_ms(POLL_MS)
                lv.timer_handler()
                time.sleep_ms(600)
                break
            else:
                status.set_text("not calibrated")
                while hub.buttons.center() or hub.buttons.right():
                    lv.timer_handler()
                    time.sleep_ms(POLL_MS)
        lv.timer_handler()
        time.sleep_ms(POLL_MS)

    root.delete()


def _wait_any_button_edge():
    """Full press-and-release cycle. Drains any stuck-held button first, then
    waits for a fresh press, then waits for stable release so contact bounce
    on release cannot re-fire the caller's next menu poll as a rising edge.

    Unlocks the MicroPython scheduler for the duration so protocol.poll()
    can fire at VM branch points and process USB commands while waiting.
    """
    hub._sched_unlock()
    try:
        getters = (hub.buttons.up, hub.buttons.down,
                   hub.buttons.left, hub.buttons.right, hub.buttons.center)
        while any(g() for g in getters):
            battery.refresh()
            time.sleep_ms(POLL_MS)
        while not any(g() for g in getters):
            battery.refresh()
            time.sleep_ms(POLL_MS)
        released_since = None
        while True:
            battery.refresh()
            if any(g() for g in getters):
                released_since = None
            elif released_since is None:
                released_since = time.ticks_ms()
            elif time.ticks_diff(time.ticks_ms(), released_since) >= _DEBOUNCE_MS:
                return
            time.sleep_ms(POLL_MS)
    finally:
        hub._sched_lock()


def run():
    cfg = Config()
    if _ble_uart is not None and not cfg.ble_adv:
        _ble_uart.adv_stop()
    scr = lv.screen_active()
    runner.set_screen(scr)
    protocol.set_screen(scr)
    apply_screen_bg(scr)

    # ---- idle tracking ----
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

    # ---- nav + view state (populated below) ----
    nav = {}
    ui  = {}

    # ---- view helpers ----
    def _children():
        return nav["current"].get_children()

    def _ch_names(ch):
        return [c.name for c in ch]

    def _rebuild_view():
        ch = _children()
        s  = min(nav["sel"], max(0, len(ch) - 1))
        ui["view"] = ListView(scr, nav["current"].title, _ch_names(ch))
        if s > 0:
            ui["view"].sel = s
            ui["view"]._refresh()

    def _refresh_items():
        ch = _children()
        ui["view"].set_items(nav["current"].title, _ch_names(ch), nav["sel"])

    # ---- file browser ----
    def _dir_items(path):
        dirs, files = list_dir(path)
        items = []
        for d in dirs:
            p = _join(path, d)
            t = p if len(p) <= 22 else "..." + p[-19:]
            items.append(Menu(d + "/", dynamic_items=lambda p=p: _dir_items(p), title=t))
        for f in files:
            p = _join(path, f)
            items.append(Menu(f, callback=lambda p=p: _run_file(p), screen_flow=True))
        if not items:
            items.append(Menu("(empty)"))
        return items

    def _run_file(path):
        name = path.rsplit("/", 1)[-1]
        if name in _BLOCKED_SCRIPTS:
            text_screen(scr, "Blocked", name + " is a boot script", hint="press any button")
            _wait_any_button_edge()
            return
        runner.run_program(path)
        _note_activity()
        _wait_any_button_edge()

    # ---- BLE advertise ----
    def _ble_adv_action():
        if _ble_uart is not None:
            rem = _ble_uart.adv_remaining_ms()
            if rem is None or rem <= 0:
                _ble_uart.adv_start()
    
        while any(g() for g in (hub.buttons.up, hub.buttons.down,
                                hub.buttons.left, hub.buttons.right, hub.buttons.center)):
            battery.refresh()
            protocol.poll()
            time.sleep_ms(POLL_MS)

        while True:
            rem = _ble_uart.adv_remaining_ms() if _ble_uart is not None else None
            secs = (rem + 999) // 1000 if rem is not None and rem > 0 else 0
            text_screen(scr, "BLE Advertise", "Active\n{}s remaining".format(secs), hint="press any button")

            if any(g() for g in (hub.buttons.up, hub.buttons.down,
                                 hub.buttons.left, hub.buttons.right, hub.buttons.center)):
                break

            lv.timer_handler()
            battery.refresh()
            protocol.poll()
            time.sleep_ms(POLL_MS)

    # ---- settings ----
    def _toggle_full_fs():
        cfg.allow_full_fs = not cfg.allow_full_fs
        cfg.save()

    def _toggle_ble_adv():
        cfg.ble_adv = not cfg.ble_adv
        cfg.save()
        if not cfg.ble_adv and _ble_uart is not None:
            _ble_uart.adv_stop()

    def _settings_items():
        mark     = "[x]" if cfg.allow_full_fs else "[ ]"
        ble_mark = "[x]" if cfg.ble_adv else "[ ]"
        return [
            Menu(mark + " Full FS root", callback=_toggle_full_fs),
            Menu(ble_mark + " BLE Adv",  callback=_toggle_ble_adv),
        ]

    # ---- USB MSC ----
    def _turn_off_usb_msc():
        hub.set_usb_msc(False)
        hub.sd_remount()
        cfg.usb_msc = False
        cfg.save()
        nav["current"] = nav["root"]
        nav["sel"]     = 0
        scr.clean()
        _rebuild_view()

    # ---- power off ----
    def _do_poweroff():
        text_screen(scr, "Power off", "Shutting down...")
        time.sleep_ms(300)
        hub.powerOff()

    # ---- static menu tree ----
    hardware = Menu("Hardware", title="Hardware", submenus=[
        Menu("Ports",         callback=lambda: runner.run_program("/ports_view.py"),
             screen_flow=True),
        Menu("About",         callback=lambda: _show_about(scr),    screen_flow=True),
        Menu("Calibrate IMU", callback=lambda: calibrate_imu(scr),  screen_flow=True),
        Menu("BLE Advertise", callback=lambda: _ble_adv_action(),   screen_flow=True),
    ])

    poweroff = Menu("Power off", title="Power off?", submenus=[
        Menu("No"),
        Menu("Yes", callback=_do_poweroff),
    ])

    root = Menu("Menu", submenus=[
        Menu("Run program", title="Programs",
             dynamic_items=lambda: _dir_items(cfg.root())),
        hardware,
        Menu("Settings", dynamic_items=_settings_items),
        poweroff,
    ])

    # ---- initial nav state ----
    if cfg.usb_msc:
        msc_root = Menu("USB MSC Active", title="USB MSC Active", submenus=[
            Menu("Turn off USB MSC", callback=_turn_off_usb_msc),
        ])
        nav["current"] = msc_root
    else:
        nav["current"] = root

    nav["sel"]  = 0
    nav["root"] = root

    initial_ch = nav["current"].get_children()
    ui["view"]  = ListView(scr, nav["current"].title, _ch_names(initial_ch))

    # ---- navigation engine ----
    def _nav_select():
        ch  = _children()
        if not ch:
            return
        idx   = nav["sel"]
        child = ch[min(idx, len(ch) - 1)]

        if child.isMenu:
            nav["current"].last_position = idx
            nav["current"] = child
            nav["sel"]     = child.last_position
            _refresh_items()

        elif child.callback is None:
            _nav_back()

        elif child.screen_flow:
            nav["current"].last_position = idx
            ui["view"].close()
            _unregister_all()
            try:
                child.callback()
            finally:
                _register_all()
            _note_activity()
            scr.clean()
            _rebuild_view()

        else:
            child.callback()
            nav["sel"] = min(idx, max(0, len(_children()) - 1))
            _refresh_items()

    def _nav_back():
        if nav["current"].parent is not None:
            nav["current"] = nav["current"].parent
            nav["sel"]     = nav["current"].last_position
            _refresh_items()

    # ---- button callbacks ----
    def _on_up():
        ui["view"].move(-1)
        nav["sel"] = ui["view"].sel

    def _on_down():
        ui["view"].move(1)
        nav["sel"] = ui["view"].sel

    def _on_left():   _nav_back()
    def _on_center(): _nav_select()
    def _on_right():  _nav_select()

    def _wake_or_pass(fn):
        """Wrap a button callback so the first press while dimmed only wakes.

        When ``dimmed`` is set, we still want to refresh the timer and
        restore brightness, but not invoke the underlying handler — the user's
        intent was "wake up", not "trigger the menu action under the button".
        """
        def wrapped():
            was_dimmed = idle["dimmed"]
            _note_activity()
            if not was_dimmed:
                fn()
        return wrapped

    def _register_all():
        hub.buttons.on("up",     _wake_or_pass(_on_up))
        hub.buttons.on("down",   _wake_or_pass(_on_down))
        hub.buttons.on("left",   _wake_or_pass(_on_left))
        hub.buttons.on("center", _wake_or_pass(_on_center))
        hub.buttons.on("right",  _wake_or_pass(_on_right))

    def _unregister_all():
        for n in ("center", "up", "down", "left", "right"):
            hub.buttons.off(n)

    _register_all()

    # ---- BLE run-finished hook ----
    def _on_ble_run_finished():
        # runner.run_program calls scr.clean() which deletes the view's LVGL
        # objects without setting _closed. Close it now so button callbacks that
        # fire during _wait_any_button_edge don't try to update a dead view.
        ui["view"].close()
        _wait_any_button_edge()
        _note_activity()
        nav["current"] = nav["root"]
        nav["sel"]     = nav["root"].last_position
        scr.clean()
        _refresh_items()
        _rebuild_view()
        scr.invalidate()
        lv.timer_handler()

    protocol.on_run_finished = _on_ble_run_finished

    def _on_transfer_finished():
        ui["view"].close()
        _note_activity()
        scr.clean()
        _rebuild_view()
        scr.invalidate()
        lv.timer_handler()

    protocol.on_transfer_finished = _on_transfer_finished

    # ---- main loop ----
    getters = (hub.buttons.center, hub.buttons.up, hub.buttons.down,
               hub.buttons.left, hub.buttons.right)

    while True:
        battery.refresh()
        if _ble_uart is not None:
            _ble_uart.adv_poll()
        if any(g() for g in getters):
            idle["last"] = time.ticks_ms()
        elapsed = time.ticks_diff(time.ticks_ms(), idle["last"])
        _ble_on = False
        _ble_uart_instance = _ble_uart.instance() if _ble_uart is not None else None
        if _ble_uart_instance is not None:
            _ble_on = _ble_uart_instance.connected()

        _off_ms = IDLE_OFF_BLE_MS if _ble_on else IDLE_OFF_MS
        if elapsed >= _off_ms:
            scr.clean()
            text_screen(scr, "Power off", "Idle timeout")
            time.sleep_ms(300)
            hub.powerOff()
        elif elapsed >= IDLE_DIM_MS and not idle["dimmed"]:
            hub.lcd.backlight(BACKLIGHT_DIM)
            idle["dimmed"] = True
        time.sleep_ms(POLL_MS)
