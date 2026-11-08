# Colors and other number lists

Some modules are just lists of named numbers, so you don't have to remember them.

## Colors

```python
from lpf2 import color

hub.led.setColorIdx(color.GREEN)
if sensor.getColorIdx() == color.YELLOW:
    print("Yellow!")
```

Full list: [Colors](doc:api:lpf2.color).

## Device types

What kind of device is plugged in:

```python
from lpf2 import device_type

if hub.ports.A.getDeviceType() == device_type.TECHNIC_DISTANCE_SENSOR:
    print("Distance sensor on A")
```

Full list: [Device types](doc:api:lpf2.device_type).

## For other LEGO hubs

When you [connect to another hub](doc:guide:remote-control):

- [Port numbers](doc:api:lpf2.port_num) — e.g. `lpf2.port_num.poweredup.A`
- [Hub types](doc:api:lpf2.hub_type) — what kind of hub it is
- [Hub properties](doc:api:lpf2.hub_property) — facts you can ask it
- [Battery types](doc:api:lpf2.battery_type)

## For pretending to be a hub

When [your hub acts as a LEGO hub](doc:guide:pretend-to-be-a-hub):

- [Button states](doc:api:lpf2.button_state)
- [Alerts](doc:api:lpf2.alerts)
