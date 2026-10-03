"""User-program runner. Executes a script as a plain Python file.

No setup/loop model — programs run to completion. Button callbacks fire
from the C firmware loop (Hub::loop) automatically; no poll() needed.
hub.exit() raises SystemExit; a 2 s centre-button hold schedules
KeyboardInterrupt from C — both are caught here as a clean exit.
"""
import sys
import time
import hub, lpf2
from listview import text_screen
import lvgl as lv

_running = False
_screen = lv.screen_active()


def request_stop():
    """Called from stdin protocol (STOP frame). Interrupts the running script."""
    if _running:
        hub._request_stop()

def set_screen(scr):
    global _screen
    _screen = scr


def _drain_center():
    while hub.buttons.center():
        lv.timer_handler()
        time.sleep_ms(30)


def _reset_hw():
    """Stop any motor left running and re-enable all ports after program exit."""
    for name in ("A", "B", "C", "D", "E", "F"):
        if not hasattr(hub.ports, name):
            continue
        port = getattr(hub.ports, name)
        port.disable(False)
        port.startPower(0)

    if hasattr(hub, "audio"):
        hub.audio.stop()
    if hasattr(hub, "video"):
        hub.video.stop()


def _run_mpy(path):
    slash = path.rfind("/")
    dirpath = path[:slash] or "/"
    modname = path[slash + 1:-4]
    prev = sys.path[:]
    if dirpath not in sys.path:
        sys.path.insert(0, dirpath)
    sys.modules.pop(modname, None)
    try:
        __import__(modname)
    finally:
        sys.path[:] = prev
        sys.modules.pop(modname, None)


def run_program(path):
    """Execute the file at `path` as a plain script.

    Returns None on clean exit, error string on exception.
    """
    global _running
    if _running:
        _screen.clean()
        text_screen(_screen, "Error", "already running", hint="press any button")
        lv.timer_handler()
        _drain_center()
        return "already running"

    _screen.clean()
    text_screen(_screen, "Running", path, hint="hold center 2s: stop")
    lv.timer_handler()
    _running = True

    saved_cbs = hub.buttons._snapshot()
    err = None
    try:
        if path.endswith(".mpy"):
            hub._sched_unlock()
            try:
                _run_mpy(path)
            except SystemExit:
                pass
            except KeyboardInterrupt:
                pass
            except Exception as e:
                err = repr(e)
            finally:
                hub._clear_stop_request()
                hub._sched_lock()
        else:
            with open(path) as f:
                code = f.read()
            hub._sched_unlock()
            try:
                exec(code, {"__name__": "__main__"})
            except SystemExit:
                pass        # hub.exit()
            except KeyboardInterrupt:
                pass        # 2 s centre-hold or USB STOP command
            except Exception as e:
                err = repr(e)
            finally:
                hub._clear_stop_request()
                hub._sched_lock()
    except Exception as e:
        err = repr(e)   # file read error
    finally:
        hub.buttons._restore(saved_cbs)
        _reset_hw()
        _running = False

    _screen.clean()
    if err is None:
        text_screen(_screen, "Done", path, hint="press any button")
        hub.led.setColorIdx(lpf2.color.GREEN)
    else:
        text_screen(_screen, "Error", err, hint="press any button")
        hub.led.setColorIdx(lpf2.color.RED)
    lv.timer_handler()

    _drain_center()
    hub.led.setColorIdx(lpf2.color.GREEN)
    return err
