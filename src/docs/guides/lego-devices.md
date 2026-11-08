# LEGO devices

LEGO Powered Up motors, sensors and lights plug into the hub's [ports](doc:guide:ports). The `lpf2` module is how you talk to them.

## Three steps

1. **Find the port**: `port = hub.ports.A`
2. **Check something's there**: `port.isDeviceConnected()`
3. **Get the device**: `dev = port.device()` — and use its functions.

```python
import hub, time

port = hub.ports.A
while not port.isDeviceConnected():
    print("Plug something into port A...")
    time.sleep(1)

dev = port.device()
print("Found:", dev.name())
```

## What kind of device did I get?

`device()` gives you an object that matches what's plugged in:

| Plugged in | You get | Guide |
|---|---|---|
| Technic / BOOST motor | [encoder_motor](doc:api:lpf2.devices#encoder_motor) | [Motors](doc:guide:motors) |
| Train or simple motor | [basic_motor](doc:api:lpf2.devices#basic_motor) | [Motors](doc:guide:motors) |
| Technic Color Sensor | [color_sensor](doc:api:lpf2.devices#color_sensor) | [Sensors](doc:guide:sensors) |
| Technic Distance Sensor | [distance_sensor](doc:api:lpf2.devices#distance_sensor) | [Sensors](doc:guide:sensors) |
| BOOST Color & Distance Sensor | [color_distance_sensor](doc:api:lpf2.devices#color_distance_sensor) | [Sensors](doc:guide:sensors) |
| Port Expander | [port_expander](doc:api:lpf2.devices#port_expander) | [Port expander](doc:guide:port-expander) |

To check in code, use `isinstance`:

```python
from lpf2 import devices

dev = hub.ports.A.device()
if isinstance(dev, devices.encoder_motor):
    dev.startSpeed(50)
```

## Updates happen by themselves

The hub keeps every port up to date many times per second. Your program just reads the latest values whenever it wants.

## Older motors (EV3)

LEGO MINDSTORMS EV3 motors don't tell the hub what they are. Tell the port yourself:

::: api lpf2.local.port.forceDeviceType
