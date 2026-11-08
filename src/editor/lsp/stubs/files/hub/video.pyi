"""Play video clips on the hub's screen.

Videos must be MJPEG ``.avi`` files that fit the 160x128 screen. Give
the full path, for example ``"/sd/clip.avi"``.
"""

def play(path: str, *, block: bool = True) -> None:
    """Play a video (without sound).

    Normally waits until the video ends. With ``block=False`` it starts
    the video and your program continues right away — use
    :func:`is_finished` to check when it's done.
    """
    ...

def play_av(path: str, *, block: bool = True) -> None:
    """Play a video with its sound.

    On hubs without a speaker the video plays silently.
    With ``block=False`` your program continues right away.
    """
    ...

def stop() -> None:
    """Stop the video that is playing."""
    ...

def is_finished() -> bool:
    """``True`` when no video is playing."""
    ...
