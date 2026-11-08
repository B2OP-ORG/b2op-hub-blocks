# How programs run

## Start to finish

The hub runs your program from top to bottom, just like any Python script. When it reaches the end, it shows **Done**.

A program that should keep going — a robot that drives around, a sensor that keeps watching — needs a loop:

```python
import hub, time

while True:
    print(hub.imu.pitch)
    time.sleep_ms(10)
```

> **Tip:** Always put a short pause such as `time.sleep_ms(10)` inside a `while True` loop. The hub uses those pauses to handle button presses and to let you stop the program.

## Stopping

- Reach the end of the program, or call:

::: api hub.exit

- Hold the **center button for 2 seconds** — this always stops the program.
- If your program crashes, the hub shows **Error** and the console tells you what went wrong.

## Turning the hub off

Hold the **center button for 5 seconds**, or from code:

::: api hub.powerOff

## Projects with several files

A project can have more than one file. `main.py` is where it starts, and it can `import` the other files next to it:

```
robot/
├── main.py      # import drive
└── drive.py
```

When you upload a project, it goes into its own folder on the hub's SD card. On the hub, the **Run program** menu shows folders that contain a `main.py` with a ▶ icon: press center to run `main.py`, or right to open the folder.

## Doing things in the background

Some things happen without you having to check:

- Ports and sensors update themselves all the time — just read the values.
- Button functions registered with `hub.buttons.on(...)` run automatically when the button is pressed (see [Buttons](doc:guide:buttons)).
- Sounds and videos can play while your code continues (`block=False`).
