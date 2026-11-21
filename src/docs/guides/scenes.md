# Scenes

A **scene** is a screen layout for the hub's 160 × 128 screen, made in the scene editor instead of in code. A project can have as many scenes as you like: a start menu, a game screen, a settings page, …

## Make a scene

Right-click in the file explorer and pick **New scene (screen layout)…**, or press **Create scene…** in the *Scenes* block category. Give it a short name, like `menu`. You get a file `menu.py`, which opens in the scene editor.

- Drag widgets from the bar onto the screen (or click one to add it).
- Move them with the mouse or the arrow keys (Shift = bigger steps), resize them with the handle in the corner. Drag one onto the bin in the corner (or press Delete) to remove it.
- Change text, colours, items and more on the right. The list on the left shows every widget; put widgets *inside* a panel, scroll box or tab with the **Inside** setting.
- Every widget has a name (`label0`, `list0`, …) — that's how your program reaches it. Rename them to something that says what they are, like `title` or `speed_bar`.
- **Preview** lets you try the scene with the keyboard: ↑ ↓ are the hub's up / down buttons, Enter is center, ← is left.
- **Python** shows the code the editor writes for the scene.

## Use a scene from blocks

The *Scenes* category has blocks for your scenes: **show scene**, **set text of …**, **set value of …**, **when … is used** and more. The screen only updates (and button events only arrive) while the program keeps running, so put your work in a loop:

1. **show scene** `menu`
2. **repeat while** `true` (the loop keeps the screen updating for you)

## Use a scene from Python

A scene file is an ordinary Python module:

```python
import menu, time
import lvgl as lv

menu.show()
menu.label0.set_text("Hello!")

def picked(index, text):
    print("picked", text)

menu.on("list0", picked)

while True:
    lv.timer_handler()
    time.sleep_ms(5)
```

Every widget is a normal LVGL object (`menu.label0` is an `lv.label`), so everything in the LVGL documentation works on it. The module also has:

| | |
| --- | --- |
| `show()` / `hide()` / `is_shown()` | show this scene (everything else on the screen is hidden) and give it the button focus |
| `on(name, cb)` | call `cb` when a widget is used: button `cb()`, menu list / roller / dropdown / tabs `cb(index, text)`, slider `cb(value)`, checkbox / switch `cb(checked)` |
| `set_items(name, items)` | new options for a menu list, roller or dropdown |
| `selected_index(name)` / `selected_text(name)` | what is picked in a menu list, roller, dropdown or tab view |
| `set_qr(name, text)` | new text for a QR code (use this, not `update()`: it keeps the code sized to whole pixels) |

Don't edit a scene file in the Python editor: the scene editor rewrites it.

## The buttons

The hub has no touchscreen, so the buttons move around the scene:

- **up / down** — move the focus to the previous / next widget. While a roller, slider, dropdown or scroll box is being *edited*, they change its value or scroll it instead (hold to repeat).
- **center** (or **right**) — press the focused widget. On a roller, slider, dropdown or scroll box it starts and stops editing.
- **left** — stop editing.

Holding center for 2 seconds still stops the program. `on button pressed` blocks keep working too, so pick buttons for them that don't get in the way.

## Widgets

| On the screen | Used with the buttons |
| --- | --- |
| Label, Panel, Line, Bar, Arc, LED, Spinner, Image (PNG on the SD card), QR code, Chart, Scale, Table, Text box | Button, Menu list, Roller, Dropdown, Slider, Checkbox, Switch, Scroll box, Tabs |

Only the font sizes 14, 16 and 24 exist on the hub. The editor draws widgets close to how the hub does; the hub itself is the real reference.
