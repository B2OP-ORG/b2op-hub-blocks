# Sensors

Get the sensor from its port with `dev = hub.ports.B.device()`, then use its functions.

## Technic Color Sensor

```python
import hub, time
from lpf2 import color

sensor = hub.ports.B.device()
while True:
    if sensor.getColorIdx() == color.RED:
        print("Red!")
    print("light:", sensor.getReflectivity())
    time.sleep_ms(100)
```

::: api lpf2.devices.color_sensor.getColorIdx

::: api lpf2.devices.color_sensor.getReflectivity

::: api lpf2.devices.color_sensor.getRGB

::: api lpf2.devices.color_sensor.getHSV

::: api lpf2.devices.color_sensor.setLight

## Technic Distance Sensor

```python
sensor = hub.ports.D.device()
cm = sensor.getDistance()
sensor.setLight(100, 100, 0, 0)   # light up the top "eyebrows"
```

::: api lpf2.devices.distance_sensor.getDistance

::: api lpf2.devices.distance_sensor.setLight

## BOOST Color & Distance Sensor

```python
sensor = hub.ports.C.device()
print(sensor.getColorIdx(), sensor.getDistance())
sensor.setLedColor(color.BLUE)
```

::: api lpf2.devices.color_distance_sensor.getDistance

::: api lpf2.devices.color_distance_sensor.getAmbientLight

## The hub's own sensors

`hub.accelerometer` and `hub.gyro` work like plug-in sensors:

```python
print(hub.accelerometer.getZ())   # about 1000 when lying flat
print(hub.gyro.getZ())            # spin speed
```

For tilt angles, the [motion sensor](doc:guide:motion-sensor) is easier.

## Any other sensor

For a device without its own class, read values straight from the port:

::: api lpf2.port.getValue
