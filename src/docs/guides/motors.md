# Motors

You can drive a motor through its port (`hub.ports.A.startPower(50)`) or through its device (`hub.ports.A.device().startPower(50)`) — both work the same.

**Speed and power go from -100 to 100.** The sign picks the direction, `0` stops.

## Just go

Works with every motor, including simple train motors:

::: api lpf2.port.startPower

```python
import hub, time

hub.ports.A.startPower(60)    # forwards
time.sleep(2)
hub.ports.A.startPower(-60)   # backwards
time.sleep(2)
hub.ports.A.startPower(0)     # stop
```

## Motors with a rotation sensor

Technic and BOOST motors know how far they've turned, so they can do more.

### Keep a steady speed

::: api lpf2.port.startSpeed

### Run for a while

::: api lpf2.port.startSpeedForTime

```python
hub.ports.A.startSpeedForTime(2000, 50)    # 2 seconds at speed 50
```

### Turn an exact amount

::: api lpf2.port.startSpeedForDegrees

```python
hub.ports.A.startSpeedForDegrees(360, 40)     # one full turn
hub.ports.A.startSpeedForDegrees(90, -40)     # quarter turn back
```

### Go to a position

::: api lpf2.port.presetEncoder

::: api lpf2.port.gotoAbsPosition

```python
m = hub.ports.A
m.presetEncoder(0)                  # here is 0
m.gotoAbsPosition(180, 40, endState=126)
```

## How it stops

The `endState` option says what happens at the end of a move:

| endState | What happens |
|---|---|
| `0` | Coast — the motor spins down freely |
| `127` | Brake — stops quickly |
| `126` | Hold — stops and stays in place |

## Smooth starts and stops

Make the motor speed up and slow down gently:

```python
m = hub.ports.A
m.setAccTime(500, 1)       # take 500 ms to speed up, slot 1
m.setDecTime(500, 2)       # take 500 ms to slow down, slot 2
m.startSpeed(100, useProfile=0x21)
```

Tuning presets for every LEGO motor type are in [motor_setting](doc:api:lpf2#motor_setting) (advanced).
