# Screen

The hub has a small color screen (160 × 128 pixels).

## Brightness

```python
import hub

hub.lcd.on()             # full brightness
hub.lcd.backlight(64)    # dimmer (0..255)
hub.lcd.off()            # dark
```

::: api hub.lcd.backlight

## Drawing with LVGL

To show text, buttons and pictures, use the `lvgl` module. It's ready as soon as your program starts. While your program runs, give it a moment to redraw by calling `lv.timer_handler()` in your loop:

```python
import lvgl as lv, time

label = lv.label(lv.screen_active())
label.set_text("Hello!")
label.center()

while True:
    lv.timer_handler()
    time.sleep_ms(5)
```

The *Lcd* example in the Examples tab shows more.

## Videos

Play `.avi` video clips from the SD card with `hub.video` — see [Video](doc:api:hub.video).

```python
hub.video.play("/sd/clip.avi")
```
