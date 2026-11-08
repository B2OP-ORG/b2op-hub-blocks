# Battery

Check the hub's own battery with `hub.battery`:

```python
import hub

print(hub.battery.percent(), "%")
if hub.battery.charging():
    print("Charging...")
```

::: api hub.battery.percent

::: api hub.battery.voltage

::: api hub.battery.state

Values update about every two seconds.

## Custom batteries (advanced)

If you measure a different battery yourself, `lpf2.battery` can turn its voltage into a percentage. See [lpf2.battery](doc:api:lpf2#battery).
