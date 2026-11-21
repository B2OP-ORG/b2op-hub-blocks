"""The hub's screen.

Turn the backlight on and off or change its brightness. To draw on the
screen use the ``lvgl`` module, which is ready as soon as your program
starts. While your program runs, call ``lvgl.timer_handler()`` regularly
(for example every 5 ms in your main loop) so the screen keeps updating.

The hub buttons work as an LVGL encoder input device, so focusable
widgets (buttons, lists, rollers, sliders, dropdowns, checkboxes,
switches, scrollable containers) can be used without a touchscreen:

- up / down: move focus to the previous / next widget. While a widget is
  being edited they decrease / increase its value or scroll it instead.
  Holding repeats.
- center (or right): click the focused widget. On rollers, sliders,
  dropdowns and scrollable containers it switches edit mode on and off.
- left: leave edit mode (and send ``lvgl.EVENT.CANCEL``).

Input goes to LVGL's *default* group. Make a group the default with
``group.set_default()`` and add widgets to it with ``group.add_obj(w)``
(widgets created while a group is the default join it automatically).
Each program starts with an empty default group. Callbacks registered
with ``hub.buttons.on()`` still run as well.

Functions marked *Advanced* talk to the screen hardware directly and
are only needed for testing or new screen types.
"""

def init() -> None:
    """Advanced: restart the screen's drawing system (LVGL).

    Not needed normally — it is already running when your program
    starts. Only use it if you shut LVGL down yourself.
    """
    ...

def on() -> None:
    """Turn the screen's backlight fully on."""
    ...

def off() -> None:
    """Turn the screen's backlight off."""
    ...

def backlight(duty: int) -> None:
    """Set the screen brightness from 0 (off) to 255 (brightest)."""
    ...

def reset() -> None:
    """Advanced: restart the screen hardware."""
    ...

def fill(rgb565: int) -> None:
    """Advanced: fill the whole screen with one color, skipping LVGL.

    The color is a 16-bit RGB565 number, e.g. ``0xF800`` is red,
    ``0x07E0`` green and ``0x001F`` blue. Handy to test the screen.
    """
    ...

def setInvert(on: bool) -> None:
    """Advanced: swap all screen colors for their opposites."""
    ...

def setMadctl(byte: int) -> None:
    """Advanced: set the screen's orientation/mirroring register (MADCTL).

    Bits: MY(0x80) MX(0x40) MV(0x20) ML(0x10) BGR(0x08).
    """
    ...

def setOffset(x: int, y: int) -> None:
    """Advanced: shift the picture on the panel by ``x`` columns and ``y`` rows.

    Some screen variants need this to line up, e.g. ``(2, 3)`` or ``(26, 1)``.
    """
    ...

def cmd(cmd: int, data: bytes = b"") -> None:
    """Advanced: send a raw command (and optional data bytes) to the screen chip."""
    ...

def loop() -> None:
    """Advanced: run one screen update step.

    Call this repeatedly (about every 5 ms) if you drive LVGL from your
    own thread. Most programs use ``lvgl.timer_handler()`` in their main
    loop instead.
    """
    ...
