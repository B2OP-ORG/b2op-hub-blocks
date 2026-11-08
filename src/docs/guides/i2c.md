# Grove / I2C gadgets

The hub's **Grove** connector lets you add extra sensors and gadgets that speak *I2C* (most Grove modules do). Use `hub.i2c`.

## What's connected?

```python
import hub
print([hex(a) for a in hub.i2c.scan()])
```

Every gadget has an **address** (a number like `0x68`). `scan()` lists the addresses that answered.

## Talking to a gadget

Most gadgets work with numbered *registers* — little memory slots you read and write:

```python
ADDR = 0x68
who = hub.i2c.readfrom_mem(ADDR, 0x75, 1)     # read 1 byte from register 0x75
hub.i2c.writeto_mem(ADDR, 0x6B, b"\x00")      # write 0 into register 0x6B
```

Which registers to use is in the gadget's datasheet — or find a MicroPython library for it.

The *Grove i2c mpu6050* example in the Examples tab is a complete program for a motion-sensor module.

## Speed

```python
hub.i2c.init(freq=100_000)    # slower, for long cables
```

`hub.i2c` is a regular MicroPython `machine.I2C`, so any MicroPython I2C guide or library works with it.

If a gadget doesn't answer, you'll get an `OSError` — check the cable and the address.
