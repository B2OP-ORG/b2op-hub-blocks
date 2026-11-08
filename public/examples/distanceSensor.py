import hub, lpf2, time

print("Distance Sensor Example")
print("Connect a distance sensor to port B")

while not hub.buttons.center():
    port = hub.ports.B
    if (port.isDeviceConnected()
            and port.getDeviceType() == lpf2.device_type.TECHNIC_DISTANCE_SENSOR):
        print(port.getValueStr(0))
