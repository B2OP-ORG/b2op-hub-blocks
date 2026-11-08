# Sound

Hubs with a speaker can beep, play notes and tunes, and play music or sound files. Use `hub.audio`.

## Beeps

::: api hub.audio.beep

```python
import hub
hub.audio.beep(440, 500)     # an A for half a second
```

## Notes and tunes

::: api hub.audio.note

```python
hub.audio.set_note_speed(120)
hub.audio.note("C4", 1)
hub.audio.note("E4", 1)
hub.audio.note("G4", 2)
```

Play a whole tune from a list of `(note, beats)` pairs:

```python
hub.audio.play_melody_from_list([
    ("C4", 1), ("E4", 1), ("G4", 1), ("C5", 2),
    ("G4", 1), ("C5", 3),
])
```

Or one of the built-in tunes:

::: api hub.audio.play_melody

## How it sounds

::: api hub.audio.set_wave_type

## Music and sound files

Put files on the SD card and play them:

```python
hub.audio.play_midi("/sd/song.mid")
hub.audio.play("/sd/sound.wav")
```

## Keep going while it plays

Add `block=False` and your program carries on while the sound plays:

```python
import time

hub.audio.play_midi("/sd/song.mid", block=False)
while not hub.audio.is_finished():
    hub.led.setColor(0, 0, 255)
    time.sleep_ms(100)
```

`hub.audio.stop()` stops any sound.
