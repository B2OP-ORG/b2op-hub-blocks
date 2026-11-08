# Port expander

A port expander plugs into one port and gives you four more.

```python
import hub
from lpf2 import port_expander

expander = hub.ports.A.device()
sub = expander.getPort(port_expander.port_num.A)
if sub.isDeviceConnected():
    sub.startPower(50)
```

::: api lpf2.devices.port_expander.getPort

Each expander port works just like `hub.ports.A`. The *Expander* example in the Examples tab shows more.

## Building your own (advanced)

You can also make a **pretend** expander that combines several ports into one — for example to give another LEGO hub more ports. See [lpf2.port_expander](doc:api:lpf2.port_expander) and [Pretend devices](doc:guide:virtual-ports).
