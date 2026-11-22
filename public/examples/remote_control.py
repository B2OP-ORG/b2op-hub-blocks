"""Drive a motor from a controller app.

The app connected over USB or Bluetooth sets up three controls with the
REMOTE protocol command:

    id 0  "speed"  int    -100..100
    id 1  "light"  bool
    id 2  "msg"    str

and then keeps sending their values (at least every 500 ms — the
program stops the motor when "speed" goes quiet). Connect a motor to
port A.
When the app disconnects, the values reset to 0 / False / "" and the
motor stops. Press the centre button to exit.

The program reports back to the app with two messages:

    id 3  "power"  int    power actually applied to the motor
    id 4  "motor"  bool   whether a motor is plugged into port A

Controls and messages share one id space, so the message ids must not
be used by a control.

The program can also change a control: pressing the down button sets
"speed" to 0, and the app's slider jumps back to the middle.
"""

import hub, lpf2, remote, time

motor = hub.ports.A
done = False
brake = False

remote.create_message(3, "power", remote.INT)
remote.create_message(4, "motor", bool)


@hub.buttons.on("center")
def on_exit():
    global done
    done = True


@hub.buttons.on("down")
def on_brake():
    global brake
    brake = True


last_msg = ""
last_power = None
last_connected = None
while not done:
    if brake:
        brake = False
        # Set the app's "speed" control (id 0): its slider moves to 0 too.
        # Raises ValueError while the app has not set up its controls.
        try:
            remote.send(0, 0)
        except ValueError:
            pass

    speed = max(-100, min(100, remote.speed))   # 0 until the app sends it

    # Extra safety: stop if the app went quiet for half a second.
    age = remote.age_ms("speed")
    if age is None or age > 500:
        speed = 0

    connected = motor.isDeviceConnected()
    if connected:
        motor.startPower(speed)
    else:
        speed = 0

    # Report only changes, so the link isn't flooded every 20 ms.
    if speed != last_power:
        remote.send(3, speed)
        last_power = speed
    if connected != last_connected:
        remote.send(4, connected)
        last_connected = connected

    hub.led.setColorIdx(lpf2.color.GREEN if remote.get("light", False) else lpf2.color.NONE)

    msg = remote.get("msg", "")
    if msg != last_msg:
        print("message:", msg)
        last_msg = msg

    time.sleep_ms(20)

motor.startPower(0)
print("controls:", remote.items())
