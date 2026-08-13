import micropython

import ble_uart
import protocol
import menu

# Disable Ctrl-C interrupt so the HubProtocol byte stream isn't hijacked by
# MicroPython's kbd_intr. Stop requests arrive via the STOP frame.
micropython.kbd_intr(-1)

ble_uart.start()
protocol.install_stream_redirect()

menu.run()
