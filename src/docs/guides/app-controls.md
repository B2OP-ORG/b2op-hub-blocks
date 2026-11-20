# Controls from the app

The app connected to your hub — over USB or Bluetooth — can send live values to your program: a slider for speed, a switch for the lights, a text box. Your program can send values back too, for example a sensor reading to show in the app.

This needs hub firmware with protocol 1.2 or newer.

## Read a control

Every control has a name. Read it with `remote.<name>`:

```python
import hub, remote, time

while True:
    hub.ports.A.startPower(remote.speed)   # 0 until the app sends a value
    time.sleep_ms(20)
```

Controls that the app hasn't set up read as `0`. Use `remote.get()` to pick a different starting value:

```python
gain = remote.get("gain", 1.0)
```

::: api remote.get

::: api remote.items

## Stop when the app goes away

When the app disconnects, every value it sent goes back to its starting value (`0`, `0.0`, `False` or `""`), so a robot driven by `remote.speed` stops on its own.

To also stop when the app is still connected but stopped sending, check how old a value is:

```python
age = remote.age_ms("speed")
if age is None or age > 500:
    hub.ports.A.startPower(0)
```

::: api remote.age_ms

## Send values to the app

Tell the app about each value once, then send it as often as you like:

```python
import hub, remote, time

remote.create_message(0, "battery", remote.INT)

while True:
    remote.send(0, hub.battery.percent())
    time.sleep_ms(200)
```

When your program ends, its messages are removed and the app forgets them.

::: api remote.create_message

::: api remote.send
