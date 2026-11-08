# Buttons

The hub has five buttons: **up**, **down**, **left**, **right** and **center**.

## Is a button held right now?

```python
import hub, time

while True:
    if hub.buttons.left():
        print("left is held")
    time.sleep_ms(20)
```

There's one function per button: `hub.buttons.center()`, `up()`, `down()`, `left()` and `right()`. Each gives `True` while the button is held.

## Do something when a button is pressed

Let the hub call your function every time a button is pressed:

```python
import hub, time

@hub.buttons.on("left")
def left_pressed():
    print("<--")

@hub.buttons.on("right")
def right_pressed():
    print("-->")

while True:          # keep the program running
    time.sleep_ms(50)
```

::: api hub.buttons.on

::: api hub.buttons.off

## Special center-button holds

- **2 seconds** — stops the running program.
- **5 seconds** — turns the hub off.

Your program can't block these, so you can always get out.
