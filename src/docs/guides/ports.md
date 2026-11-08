# Ports

Ports are the sockets on the hub where you plug in LEGO motors, sensors and lights. They are called `hub.ports.A`, `hub.ports.B` and so on.

## What's plugged in?

```python
import hub

port = hub.ports.A
if port.isDeviceConnected():
    print(port.device().name())
else:
    print("Nothing on port A")
```

::: api lpf2.port.isDeviceConnected

::: api lpf2.port.device

The object you get from `device()` has functions that fit that device — see [Motors](doc:guide:motors) and [Sensors](doc:guide:sensors).

## Which kind of device is it?

```python
from lpf2 import device_type

if hub.ports.A.getDeviceType() == device_type.TECHNIC_LARGE_MOTOR:
    print("A big Technic motor!")
```

The list of device numbers is in [Device types](doc:api:lpf2.device_type).

## Drive a motor straight from the port

You don't need `device()` to drive a motor — the port understands motor commands too:

```python
hub.ports.A.startPower(50)   # half power
```

See [Motors](doc:guide:motors) for all the ways to move.

## Using a port for something else

Switch a port off and its pins are free for other electronics, such as an LED strip (see the *Neopixel* example):

::: api lpf2.port.disable

## Exploring a device

Print everything a port knows:

```python
print(hub.ports.A.getInfoStr())
```

For devices without their own class you can read values directly:

::: api lpf2.port.getValue
