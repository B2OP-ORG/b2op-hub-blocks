"""Make sounds: beeps, notes, tunes, music files and sound files.

Only available on hubs with a speaker (``hub.board.HAS_AUDIO == 1``).
Only one sound plays at a time — starting a new one stops the old one.

Most functions wait until the sound is finished. Add ``block=False`` to
start the sound and carry on with your program straight away.

File paths must be complete, for example ``"/sd/sound.wav"``.
"""

from typing import Literal

def play(path: str, *, rate: int = 44100, bits: int = 16,
         channels: int = 1, block: bool = True) -> None:
    """Play a sound file (``.wav`` or raw ``.pcm``).

    For ``.wav`` files everything is read from the file, so just give the
    path. Raw ``.pcm`` files have no header, so tell it the format:
    ``rate`` (samples per second), ``bits`` (8, 16, 24 or 32) and
    ``channels`` (1 = mono, 2 = stereo).
    With ``block=False`` your program continues while the sound plays.
    """
    ...

def stop() -> None:
    """Stop whatever sound is playing."""
    ...

def is_finished() -> bool:
    """``True`` when no sound is playing."""
    ...

def beep(freq: float, duration_ms: int, *, block: bool = True) -> None:
    """Play a beep at ``freq`` hertz for ``duration_ms`` milliseconds.

    Higher numbers sound higher: 440 is the note A, 880 is one octave
    above. The sound uses the current wave type (see :func:`set_wave_type`).
    With ``block=False`` your program continues while it beeps.
    """
    ...

def note(note: "str | int", length: float, *, block: bool = True) -> None:
    """Play one musical note.

    ``note`` is a note name such as ``"C4"``, ``"D#3"`` (sharp) or
    ``"Bb5"`` (flat), ``"REST"`` for silence, or a MIDI note number
    (60 = middle C). ``length`` is in beats: 1 is one beat, 0.5 is half
    a beat. The speed comes from :func:`set_note_speed`.
    """
    ...

def set_note_speed(bpm: float) -> None:
    """Set the tempo in beats per minute for :func:`note` and :func:`play_melody_from_list`. Starts at 120."""
    ...

def set_wave_type(wave: "Literal['sine', 'square', 'sawtooth']") -> None:
    """Choose how sounds are shaped: ``"sine"`` (smooth, the default), ``"square"`` (buzzy, retro) or ``"sawtooth"`` (bright, sharp)."""
    ...

def play_melody(name: str, *, block: bool = True) -> None:
    """Play a built-in tune.

    Choose from ``"startup"``, ``"shutdown"``, ``"success"``, ``"error"``,
    ``"dadadum"``, ``"mario"`` and ``"nokia"``.
    """
    ...

def play_melody_from_list(
    melody: "list[tuple[str | int, float]]",
    *,
    block: bool = True,
) -> None:
    """Play your own tune: a list of ``(note, length)`` pairs.

    Each note works like in :func:`note`, for example
    ``[("C4", 1), ("E4", 1), ("G4", 2)]``.
    """
    ...

def play_midi(path: str, *, block: bool = True) -> None:
    """Play a MIDI music file, for example ``"/sd/song.mid"``.

    Up to 8 notes can sound at the same time. Uses the current wave type.
    """
    ...
