# Motion sensor

The hub knows how it is tilted and which way it's facing. Read it with `hub.imu`.

```python
import hub, time

while True:
    print("pitch", hub.imu.pitch, "roll", hub.imu.roll, "yaw", hub.imu.yaw)
    time.sleep_ms(100)
```

- **pitch** — nose up or down
- **roll** — tilted to the left or right
- **yaw** — which way it's facing, like a compass

All three are angles in degrees between -180 and 180.

## Wait until it's ready

Right after starting, keep the hub still for about two seconds:

```python
while not hub.imu.calibrated:
    time.sleep_ms(50)
hub.imu.reset()      # "the way I'm facing now is 0"
```

::: api hub.imu.calibrated

::: api hub.imu.reset

## Shakes and spins

- `hub.imu.acceleration` — how hard the hub is pushed, including gravity.
- `hub.imu.gyro_rate` — how fast it's spinning.

Each has `x`, `y` and `z` parts:

```python
a = hub.imu.acceleration
if a.length() > 2000:        # more than twice gravity
    print("Whoa, a shake!")
```

You can also use `hub.accelerometer.getX()` / `hub.gyro.getZ()` for the raw readings of each direction.

## Better accuracy

::: api hub.imu.start_calibration

::: api hub.imu.save_calibration
