"""MJPEG-in-AVI video player on the 160x128 ST7735 LCD.

Suspends LVGL during playback and resumes it when done.
Paths must be absolute (e.g. ``/sd/clip.avi``).
"""

def play(path: str, *, block: bool = True) -> None:
    """Play an MJPEG-in-AVI file (video only; audio chunks skipped).

    If ``block=False`` returns immediately; call :meth:`is_finished`
    to poll for completion.
    """
    ...

def play_av(path: str, *, block: bool = True) -> None:
    """Play an MJPEG-in-AVI file with embedded PCM audio via the I2S audio amplifier.

    Only available on boards that have an I2S audio amplifier; on others
    the audio track is silently ignored.
    If ``block=False`` returns immediately.
    """
    ...

def stop() -> None:
    """Abort playback. Blocks until the player task has exited."""
    ...

def is_finished() -> bool:
    """Return ``True`` when no playback is in progress."""
    ...
