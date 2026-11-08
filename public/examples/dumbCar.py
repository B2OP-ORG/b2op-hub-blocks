import lpf2, hub, time

print("Dumb Car Example")
print("Connect a 'dumb' motor to port A and a distance sensor to port D")

while not hub.buttons.center():
    motor = hub.ports.A
    sensor = hub.ports.D
    if not (motor.isDeviceConnected()
            and motor.getDeviceType() == lpf2.device_type.TRAIN_MOTOR):
        time.sleep_ms(50)
        continue
    if not (sensor.isDeviceConnected()
            and sensor.getDeviceType() == lpf2.device_type.TECHNIC_DISTANCE_SENSOR):
        time.sleep_ms(50)
        continue

    distance = sensor.getValue(0, 0)
    if distance <= -0.1:
        distance = float('inf')

    if distance < 40:
        motor.startPower(-10)
    else:
        motor.startPower(50)
    time.sleep_ms(50)

