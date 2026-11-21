# Remote controller

Build a control panel for your program: sliders, switches, buttons, a joystick, a text box — and displays, lamps and gauges that show values your program sends back. It works over USB and Bluetooth and needs hub firmware with protocol 1.2 or newer.

## Make the controller

Click **Remote** in the top bar (or *New remote controller* in the Explorer menu). This opens the project's `controller.remote` file in its own tab.

- Drag a control or indicator from the bar onto the canvas (or click it to add it below the others).
- Drag widgets to move them; drag the small square at the corner of the selected widget to resize it. Arrow keys nudge, Delete removes.
- Select a widget to set its **name** and **id** and its options (range, type, colour, …). The panel also shows the Python code that uses it.
- Need more room? Drop a widget past the edge of the canvas: the canvas grows beyond it, so you can scroll there and drag it further.
- Move around: drag with the middle mouse button, hold **Space** and drag, or use the scrollbars. On a touchscreen, drag with two fingers. The mouse wheel doesn't scroll the canvas; with **Ctrl** it zooms.
- Zoom: **Ctrl** + mouse wheel (or pinch on a trackpad or touchscreen), **Ctrl +** / **Ctrl −** / **Ctrl 0**, or the buttons at the right of the tab's toolbar. **Fit** moves all widgets to the top-left corner and zooms so they fill the view, trimming the canvas to its smallest size. The zoom is remembered in this browser.

**Controls** are values your program reads. **Indicators** show values your program sends. Names and ids must be unique among the controls, and among the indicators.

The controller is saved with the project and uploaded to the hub with the other files.

## Preview it

Press **Preview** to see the controller the way it looks when it runs. The controls move, but nothing is sent and no hub is needed. Indicators show sample values. Press **Edit** to go back.

## Run it

Press **Run** in the controller tab. The editor tells the hub about every control, uploads changed files and starts `main.py`. Now move the controls — your program sees the new values right away.

You can switch to other tabs while it runs. Press **Edit** to stop the program and change the layout. When the program ends by itself, the controller goes back to edit mode too.

## In blocks

The **Remote** category has a block for every control (`remote speed`) and every indicator (`set indicator level to …`). Use **Create remote name…** to add a new control or indicator without leaving the blocks — it is added to the controller.

A program may use a name that the controller doesn't have (for example after a widget was deleted). The block keeps it and shows a warning.

## Read a control in Python

Every control has a name. Read it with `remote.<name>` — the editor knows the names and types of your controller's controls:

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

## Send values to an indicator

Tell the app about each value once — with the name of the indicator — then send it as often as you like. The id is your choice; the controller shows the one it would use for each indicator:

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
