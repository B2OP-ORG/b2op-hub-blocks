# Getting started

Your hub runs **Python** programs. You write a program here in the editor, send it to the hub, and the hub does what the program says — spin motors, read sensors, light up, make sounds.

## Your first program

```python
import hub
import time

hub.led.setColor(0, 255, 0)   # green light
time.sleep(1)                 # wait one second
hub.led.setColor(255, 0, 0)   # red light
```

Connect your hub, then press **Run**. The light turns green, then red, and the program ends.

## Two modules do (almost) everything

- **`hub`** — everything built into the hub: [ports](doc:guide:ports), [light](doc:guide:light), [buttons](doc:guide:buttons), [motion sensor](doc:guide:motion-sensor), [screen](doc:guide:screen), [sound](doc:guide:sound) and [battery](doc:guide:battery).
- **`lpf2`** — the LEGO side: [motors](doc:guide:motors), [sensors](doc:guide:sensors), [colors](doc:guide:colors-and-constants) and even [other LEGO hubs](doc:guide:remote-control).

## Check what's plugged in

Plug a LEGO motor or sensor into port A and run:

```python
import hub, time

port = hub.ports.A
while True:
    if port.isDeviceConnected():
        print("I see:", port.device().name())
    time.sleep_ms(500)
```

The output appears in the **Console** at the bottom of the editor.

## Stopping a program

- Programs end by themselves when they reach the last line.
- Call `hub.exit()` to stop from anywhere in your code.
- Hold the hub's **center button for 2 seconds** to stop any program.

## Where next?

- Look at the **Examples** tab for ready-made programs you can open and change.
- [How programs run](doc:guide:program-lifecycle) explains loops, files and folders.
- Every function is listed in the **Reference** part of this Docs tab.
