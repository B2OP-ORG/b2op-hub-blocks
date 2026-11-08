# Pretend devices (advanced)

With `lpf2.virtual` you can write a device in Python that behaves like a real LEGO motor or sensor. This is useful together with [Pretend to be a LEGO hub](doc:guide:pretend-to-be-a-hub): a LEGO app thinks it's talking to a LEGO motor, but it's really your code — which could drive anything.

## 1. Describe the device

Every device has one or more *modes* — kinds of values it reports or accepts:

```python
import lpf2

d = lpf2.device_descriptor()
d.fwVersion = lpf2.version(); d.fwVersion.Major = 1
d.hwVersion = lpf2.version(); d.hwVersion.Major = 1

m = lpf2.mode()
m.name = "PWR"
m.min, m.max = -100, 100
m.SImin, m.SImax = -100, 100
m.PCTmin, m.PCTmax = -100, 100
m.format = 0          # whole numbers, -128..127
m.dataSets = 1
m.outMapping = 0x01   # accepts commands
d.modes = [m]
```

## 2. Write what it does

```python
class MyMotor(lpf2.virtual.device):
    def startPower(self, pw):
        print("Someone set my power to", pw)
        super().startPower(pw)
```

::: api lpf2.virtual.device.startPower

## 3. Put it in a port

```python
port = lpf2.virtual.port()
motor = MyMotor(d)
port.attachDevice(motor)
```

Now `port` behaves like a real port with a motor on it. To report a sensor value:

::: api lpf2.virtual.device.setModeData

> **Note:** Keep `port`, `motor` and `d` in variables for as long as you use them.
