# Controlling other LEGO hubs

Your hub can connect to another LEGO hub over Bluetooth — a Powered Up hub, a Technic Control+ hub, a BOOST Move hub and more — and use its motors and sensors as if they were plugged into your own hub.

## Connect

```python
import lpf2, time

other = lpf2.hub()
other.init()                     # start searching

while not other.isConnected():   # turn the other hub on now
    time.sleep_ms(10)
while not other.infoReady():
    time.sleep_ms(10)

print("Connected to", other.getName())
```

::: api lpf2.hub.init

::: api lpf2.hub.infoReady

## Use its ports

```python
port = other.getPort(lpf2.port_num.poweredup.A)
if port is not None:
    port.startPower(50)
```

::: api lpf2.hub.getPort

Port numbers depend on the kind of hub — see [Port numbers](doc:api:lpf2.port_num).

## More

```python
print(other.getHubType())          # see lpf2.hub_type
other.setName("Train 1")           # rename it
other.shutDownHub()                # turn it off
```

The *Remote* example in the Examples tab shows a full program.
