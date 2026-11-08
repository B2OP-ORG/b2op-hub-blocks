"""LCD panel + LVGL control.

The LCD is driven by ESP-IDF `esp_lcd` (ST7735) with an LVGL
display layer on top. Some methods are LVGL-independent (raw panel
access) and are useful to sanity-check wiring before LVGL is
initialised.
"""

def init() -> None:
    """Initialise LVGL.

    Must be called once from a MicroPython script before
    ``import lvgl`` — LVGL allocates via the MicroPython GC, whose
    state is thread-local to ``mp_task``, so C-side auto-init from
    ``hub_main_task`` crashes with LoadProhibited.
    """
    ...

def on() -> None:
    """Backlight fully on (via PCA9685)."""
    ...

def off() -> None:
    """Backlight off."""
    ...

def backlight(duty: int) -> None:
    """Set backlight duty (0..255, mapped to PCA9685 0..4095)."""
    ...

def reset() -> None:
    """Pulse the panel RESET line and re-init the panel driver."""
    ...

def fill(rgb565: int) -> None:
    """Fill the panel with a solid RGB565 colour.

    Bypasses LVGL — useful to confirm the panel + SPI wiring work
    before LVGL renders anything.
    """
    ...

def setInvert(on: bool) -> None:
    """Toggle panel colour inversion (ST7735 INVON / INVOFF)."""
    ...

def setMadctl(byte: int) -> None:
    """Send raw MADCTL byte.

    Bits: MY(0x80) MX(0x40) MV(0x20) ML(0x10) BGR(0x08).
    """
    ...

def setOffset(x: int, y: int) -> None:
    """Column/row start offsets applied to every CASET/RASET.

    Depends on panel variant (e.g. GreenTab wants (2, 3); 0.96"
    80x160 wants (26, 1)).
    """
    ...

def cmd(cmd: int, data: bytes = b"") -> None:
    """Send an arbitrary command + optional data payload. For probing panels."""
    ...

def loop() -> None:
    """Run one LVGL timer-handler cycle.

    Call this repeatedly from a dedicated thread at ~5 ms intervals.
    The thread must have a stack of at least 24 KB — LVGL glyph
    rasterisation and GC collection consume significantly more stack
    than the protocol poll thread.

    ``hub.lcd.init()`` must have been called first.
    """
    ...
