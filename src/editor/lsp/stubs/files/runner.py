"""User-program runner. Extracted from main.py so it can be imported and driven
by the web-side HubProtocol (main.py's stdin listener calls run_program on RUN
frame). Also used when the menu launches a program from the file browser.

The runner injects a `hub` module shim exposing an `on` decorator so user code
can register setup/loop handlers with `@on("setup")` / `@on("loop")`.
"""
import sys
import time
import hub, lpf2
from listview import text_screen

CENTER_HOLD_STOP_MS = 2000
POLL_MS = 30

_stop_flag = False
_running = False
_poll_stdin = None


class _StopProgram(BaseException):
    """Raised from hub.sleep/sleep_ms to unwind user code on stop request.

    BaseException (not Exception) so plain `except Exception:` in user code
    can't swallow it.
    """
    pass


def request_stop():
    """Called from stdin protocol (STOP frame). Runner exits at next loop tick."""
    global _stop_flag
    _stop_flag = True

def set_screen(scr):
    """Set the screen to use for text output during user program execution."""
    global _screen
    _screen = scr


class _HubShim:
    def __init__(self, real, on_fn):
        self._real = real
        self.on = on_fn
        self._press_start = None

    def __getattr__(self, name):
        return getattr(self._real, name)

    def _check_stop(self):
        """Return True if the runner should stop mid-sleep.

        Fires on the STOP protocol flag or on a center-button hold that
        crosses CENTER_HOLD_STOP_MS. Tracks press-start across calls via
        `self._press_start` so a hold spanning multiple sleeps still counts.
        """
        global _stop_flag
        if _stop_flag:
            return True
        if hub.buttons.center():
            now = time.ticks_ms()
            if self._press_start is None:
                self._press_start = now
            elif time.ticks_diff(now, self._press_start) >= CENTER_HOLD_STOP_MS:
                # Latch the flag so the main loop also exits after we return,
                # instead of restarting its own hold counter.
                _stop_flag = True
                return True
        else:
            self._press_start = None
        return False

    def sleep_ms(self, ms):
        """Sleep for `ms` milliseconds while polling hub buttons.

        Compatible with `time.sleep_ms`. Calls `hub.buttons.poll()` on each
        POLL_MS tick so registered button callbacks still fire. Does not
        re-enter the user `loop()`. Raises `_StopProgram` if STOP was
        requested or the center button was held for CENTER_HOLD_STOP_MS,
        so callers with their own `while True` still unwind.
        """
        global _poll_stdin
        ms = int(ms)
        if ms <= 0:
            hub.buttons.poll()
            if _poll_stdin is not None:
                _poll_stdin()
            if self._check_stop():
                raise _StopProgram()
            return
        end = time.ticks_add(time.ticks_ms(), ms)
        while True:
            hub.buttons.poll()
            if _poll_stdin is not None:
                _poll_stdin()
            if self._check_stop():
                raise _StopProgram()
            remaining = time.ticks_diff(end, time.ticks_ms())
            if remaining <= 0:
                return
            time.sleep_ms(remaining if remaining < POLL_MS else POLL_MS)

    def sleep(self, seconds):
        """Sleep for `seconds` (float) while polling hub buttons.

        Compatible with `time.sleep`. Thin wrapper over `sleep_ms` that
        converts to milliseconds; same button-poll + stop-check semantics.
        """
        self.sleep_ms(int(seconds * 1000))

    def exit(self):
        """Request the runner to stop the user program.

        Sets the global STOP flag so the main loop exits after the current
        `loop()` iteration (or immediately unwinds through any in-progress
        `hub.sleep` / `hub.sleep_ms`). Safe to call from setup, loop, button
        callbacks. Does not raise — control returns normally so the caller
        can finish its current statement first.
        """
        global _stop_flag
        _stop_flag = True
        raise _StopProgram()


def _drain_center():
    while hub.buttons.center():
        time.sleep_ms(POLL_MS)


def _reset_hw():
    """Put the physical ports back into a safe state after a user program exits.

    Sends startPower(0) to stop any motor left running and clears the disabled
    flag on each port in case the program left it set. startPower is safe on
    non-motor devices (the LPF2 stack just forwards the message); disable(False)
    is a no-op when the port is already enabled.
    """
    for name in ("A", "B", "C", "D"):
        port = getattr(hub.ports, name)
        port.disable(False)
        port.startPower(0)


def run_program(path, poll_stdin=None):
    """Execute the file at `path` under the setup/loop runner contract.

    poll_stdin: optional callable invoked each loop iteration; used by main.py
    to keep servicing protocol frames (e.g. STOP) while a user program runs.
    Returns None on normal exit, error string on exception.
    """
    global _stop_flag, _running, _poll_stdin
    if _running:
        # Re-entry (e.g. user picked main.py from the browser, which restarts
        # the menu, which then tries to run another program). Would blow the
        # native stack via nested exec()+menu-loop frames.
        _screen.clean()
        text_screen(_screen, "Error", "already running", hint="press any button")
        _drain_center()
        return "already running"
    
    _poll_stdin = poll_stdin

    _screen.clean()
    text_screen(_screen, "Running", path, hint="hold center 2s: stop")

    _stop_flag = False
    _running = True

    handlers = {"setup": None, "loop": None}

    def on(name):
        def deco(fn):
            handlers[name] = fn
            return fn
        return deco

    orig_hub = sys.modules.get("hub")
    sys.modules["hub"] = _HubShim(hub, on)  # type: ignore[assignment]

    saved_cbs = hub.buttons._snapshot()

    err = None
    try:
        with open(path) as f:
            code = f.read()
        g = {"__name__": "__main__"}
        exec(code, g)

        if handlers["setup"] is not None:
            handlers["setup"]()

        loop_fn = handlers["loop"]
        if loop_fn is not None:
            press_start = None
            while True:
                if _stop_flag:
                    break
                loop_fn()
                hub.buttons.poll()
                if poll_stdin is not None:
                    poll_stdin()
                if hub.buttons.center():
                    now = time.ticks_ms()
                    if press_start is None:
                        press_start = now
                    elif time.ticks_diff(now, press_start) >= CENTER_HOLD_STOP_MS:
                        break
                else:
                    press_start = None
    except _StopProgram:
        pass
    except Exception as e:
        err = repr(e)
    finally:
        hub.buttons._restore(saved_cbs)
        if orig_hub is not None:
            sys.modules["hub"] = orig_hub
        else:
            sys.modules.pop("hub", None)
        _reset_hw()

    _running = False
    _stop_flag = False
        
    _screen.clean()
    if err is None:
        text_screen(_screen, "Done", path, hint="press any button")
        hub.led.setColorIdx(lpf2.color.GREEN)
    else:
        text_screen(_screen, "Error", err, hint="press any button")
        hub.led.setColorIdx(lpf2.color.RED)

    _drain_center()
    hub.led.setColorIdx(lpf2.color.GREEN)
    return err
