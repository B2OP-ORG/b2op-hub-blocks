import lpf2, hub, time

hub.ports.LED.setRgbColorIdx(lpf2.color.BLUE)
portA = hub.ports.A
print("Waiting for expander on port A ...")

while True:
    dev = portA.device()
    if isinstance(dev, lpf2.devices.port_expander):
        exp1 = dev
        print("Expander found.")
        break
    time.sleep_ms(100)

portAB = exp1.getPort(lpf2.port_expander.port_num.B)
print("Waiting for distance sensor on port AB ...")

while True:
    dev = portAB.device()
    if isinstance(dev, lpf2.devices.distance_sensor):
        print("distance sensor found.")
        dev.setLight(100, 0, 0, 100)
        print("Distance: ", dev.getDistance(), " cm")
        break
    time.sleep_ms(100)

portAC = exp1.getPort(lpf2.port_expander.port_num.C)
print("Waiting for encoder motor on port AC ...")

while True:
    dev = portAC.device()
    if isinstance(dev, lpf2.devices.encoder_motor):
        print("motor found.")
        dev.startSpeedForDegrees(720, 100, 100, 0)
        break
    time.sleep_ms(100)

portAA = exp1.getPort(lpf2.port_expander.port_num.A)
print("Waiting for expander on port AA ...")

while True:
    dev = portAA.device()
    if isinstance(dev, lpf2.devices.port_expander):
        print("Expander found.")
        portAAA = dev.getPort(lpf2.port_expander.port_num.A)
        break
    time.sleep_ms(100)

print("Waiting for led on port AAA ...")

while True:
    if portAAA.getDeviceType() == lpf2.device_type.HUB_LED:
        print("led found.")
        portAAA.setRgbColorIdx(lpf2.color.PURPLE)
        time.sleep(5)
        portAAA.setRgbColorIdx(lpf2.color.BLACK)
        print("Test finished")
        break
