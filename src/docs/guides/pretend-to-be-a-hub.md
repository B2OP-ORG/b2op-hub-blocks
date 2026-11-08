# Pretend to be a LEGO hub (advanced)

Your hub can pretend to be a LEGO hub, so official LEGO apps can connect to it over Bluetooth and drive whatever you plug into it.

```python
import lpf2, hub

emu = lpf2.hub_emulation()
emu.setUseBuiltInDevices(False)
emu.setName("MyHub")
emu.setBatteryLevel(80)

# Let the app use ports A to D
emu.attachPort(0, hub.ports.A)
emu.attachPort(1, hub.ports.B)
emu.attachPort(2, hub.ports.C)
emu.attachPort(3, hub.ports.D)

emu.start()
```

::: api lpf2.hub_emulation.attachPort

::: api lpf2.hub_emulation.setUseBuiltInDevices

## While it runs

```python
emu.setBatteryLevel(72)
emu.setButtonState(lpf2.button_state.PRESSED)
emu.setAlert(lpf2.alerts.LOW_BATTERY, True)
```

Call `emu.stop()` to stop.

You can attach [pretend devices](doc:guide:virtual-ports) too — then the app controls your own Python code.

The *Hub emu* example in the Examples tab is a full program.
