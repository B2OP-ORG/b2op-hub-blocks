# The hub light

The hub has a colored light called `hub.led`.

```python
import hub
from lpf2 import color

hub.led.setColorIdx(color.RED)     # a named color
hub.led.setColor(0, 128, 255)      # mix your own: red, green, blue
hub.led.setColor(0, 0, 0)          # off
```

::: api lpf2.devices.hub_led.setColor

::: api lpf2.devices.hub_led.setColorIdx

## Mixing colors

Each of red, green and blue goes from 0 (none) to 255 (full):

| You want | Use |
|---|---|
| Red | `setColor(255, 0, 0)` |
| Green | `setColor(0, 255, 0)` |
| Blue | `setColor(0, 0, 255)` |
| Yellow | `setColor(255, 255, 0)` |
| Purple | `setColor(255, 0, 255)` |
| White | `setColor(255, 255, 255)` |

All named colors are listed in [Colors](doc:api:lpf2.color).

## Blink!

```python
import hub, time

for i in range(10):
    hub.led.setColor(255, 0, 0)
    time.sleep_ms(200)
    hub.led.setColor(0, 0, 0)
    time.sleep_ms(200)
```
