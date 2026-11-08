"""PCM/WAV audio player and synthesiser via on-board I2S audio amplifier.

Only present on boards where ``hub.board.HAS_AUDIO == 1``.
Paths must be absolute (e.g. ``/sd/sound.wav``).
"""

from typing import Literal

def play(path: str, *, rate: int = 44100, bits: int = 16,
         channels: int = 1, block: bool = True) -> None:
    """Stream a PCM or WAV file to the I2S audio amplifier.

    WAV files are auto-detected: ``rate``, ``bits``, and ``channels`` are
    read from the file header and the keyword arguments are ignored.
    For raw PCM files the keyword arguments set the format
    (``rate`` in Hz, ``bits`` = 8/16/24/32, ``channels`` = 1 or 2).
    If ``block=False`` returns immediately.
    """
    ...

def stop() -> None:
    """Abort playback. Blocks until the player task has exited."""
    ...

def is_finished() -> bool:
    """Return ``True`` when no playback is in progress."""
    ...

def beep(freq: float, duration_ms: int, *, block: bool = True) -> None:
    """Synthesise a single tone at ``freq`` Hz for ``duration_ms`` milliseconds.

    Uses the current wave type (see :meth:`set_wave_type`).
    If ``block=False`` returns immediately while playback continues in the background.
    """
    ...

def note(note: "str | int", length: float, *, block: bool = True) -> None:
    """Synthesise one note using the current BPM and wave type.

    ``note``: name string (e.g. ``"C4"``, ``"D#3"``, ``"Bb5"``, ``"REST"``)
    or an integer MIDI note number.
    ``length``: duration in beats (1.0 = one beat at current BPM).
    """
    ...

def set_note_speed(bpm: float) -> None:
    """Set the tempo used by :meth:`note` and :meth:`play_melody_from_list`. Default 120 BPM."""
    ...

def set_wave_type(wave: "Literal['sine', 'square', 'sawtooth']") -> None:
    """Set the waveform for all synthesis methods. ``"sine"`` (default), ``"square"``, ``"sawtooth"``."""
    ...

def play_melody(name: str, *, block: bool = True) -> None:
    """Play a built-in melody by name.

    Available: ``"startup"``, ``"shutdown"``, ``"success"``, ``"error"``,
    ``"dadadum"``, ``"mario"``, ``"nokia"``.
    """
    ...

def play_melody_from_list(
    melody: "list[tuple[str | int, float]]",
    *,
    block: bool = True,
) -> None:
    """Play a user-defined sequence of ``(note, length)`` tuples.

    ``note`` is a note name string or MIDI int; ``length`` is beats at current BPM.
    """
    ...

def play_midi(path: str, *, block: bool = True) -> None:
    """Play a Standard MIDI File (SMF format 0 or 1) from the filesystem.

    Up to 8 simultaneous voices. Uses the current wave type.
    ``path`` must be absolute (e.g. ``"/sd/song.mid"``).
    """
    ...
