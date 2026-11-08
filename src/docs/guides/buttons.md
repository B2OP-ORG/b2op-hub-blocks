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

## Button functions run side by side

Each press runs your function in its own thread, at the same time as the rest of your program. A slow function never holds up your main loop or the other buttons. If you press the button again before the function finishes, a second copy starts alongside the first.

Because they all run at once, button functions share your program's variables. If two of them change the same variable, use a lock from `_thread.allocate_lock()` so they don't get in each other's way.

## Stop button functions that are still running

`hub.stop_callbacks()` stops every button function that is still running. Each one stops at its next line, or straight away if it's waiting in `time.sleep_ms`. Your functions stay registered, so the next press runs them again.

```python
import hub, time

@hub.buttons.on("up")
def ticker():
    n = 0
    while True:          # runs until stopped
        print("tick", n)
        n += 1
        time.sleep_ms(500)

@hub.buttons.on("down")
def stop_all():
    stopped = hub.stop_callbacks()
    print("stopped", stopped)

while True:
    time.sleep_ms(50)
```

Called from inside a button function, it stops all the *other* ones. When your program ends, the hub stops any that are left on its own. In blocks, use **stop all button scripts** in the Hub category.

The *Button threads* example shows this in action.

::: api hub.stop_callbacks

## Special center-button holds

- **2 seconds** — stops the running program.
- **5 seconds** — turns the hub off.

Your program can't block these, so you can always get out.
