"""
Type stubs for the custom machine module.

All I/O is routed through the drv master driver using logical pin/bus encoding.
Logical pins are constructed with MAKE_PIN(chip, n); logical buses with MAKE_BUS(kind, n).
PIN_NONE / BUS_NONE (-1) indicate unavailable pins/buses.
"""

from typing import Callable, Optional, Sequence, Union

# ---------------------------------------------------------------------------
# Pin / bus encoding helpers
# ---------------------------------------------------------------------------

PIN_NONE: int
BUS_NONE: int

def MAKE_PIN(chip: int, n: int) -> int:
    """Encode a logical pin: (PERIPH_chip << 8) | n."""
    ...

def MAKE_BUS(kind: int, n: int) -> int:
    """Encode a logical bus: (BUS_TYPE_kind << 8) | n."""
    ...

# ---------------------------------------------------------------------------
# Chip IDs (PERIPH_*)
# ---------------------------------------------------------------------------

PERIPH_ESP32: int
PERIPH_COMBINED: int
PERIPH_PCA9685: int
PERIPH_SC16IS750: int
PERIPH_LSM6DSL: int
PERIPH_BNO085: int
PERIPH_ST7735: int
PERIPH_TLA2528: int
PERIPH_DRV8908Q1: int
PERIPH_CH9434: int

# ---------------------------------------------------------------------------
# Bus kinds (BUS_TYPE_*)
# ---------------------------------------------------------------------------

BUS_I2C: int
BUS_SPI: int
BUS_UART: int
BUS_LEDC: int
BUS_MCPWM: int
BUS_ADC: int
BUS_UART_SC16IS750: int
BUS_UART_CH9434: int
BUS_I2S: int

# ---------------------------------------------------------------------------
# machine.Pin
# ---------------------------------------------------------------------------

class Pin:
    IN: int
    OUT: int
    OPEN_DRAIN: int
    PULL_UP: int
    PULL_DOWN: int
    IRQ_RISING: int
    IRQ_FALLING: int

    def __init__(
        self,
        id: int,
        mode: int = ...,
        pull: int = ...,
        value: int = ...,
    ) -> None: ...
    def value(self, v: int = ...) -> Optional[int]: ...
    def on(self) -> None: ...
    def off(self) -> None: ...
    def irq(
        self,
        handler: Optional[Callable] = ...,
        trigger: int = ...,
        hard: bool = ...,
    ) -> None: ...

# ---------------------------------------------------------------------------
# machine.I2C
# ---------------------------------------------------------------------------

class I2C:
    def __init__(
        self,
        id: int,
        *,
        scl: int = ...,
        sda: int = ...,
        freq: int = ...,
    ) -> None: ...
    def scan(self) -> list[int]: ...
    def readfrom(self, addr: int, nbytes: int, stop: bool = ...) -> bytes: ...
    def readfrom_into(
        self, addr: int, buf: Union[bytes, bytearray], stop: bool = ...
    ) -> None: ...
    def writeto(
        self, addr: int, buf: Union[bytes, bytearray], stop: bool = ...
    ) -> int: ...
    def writevto(
        self, addr: int, vector: Sequence[Union[bytes, bytearray]], stop: bool = ...
    ) -> int: ...
    def readfrom_mem(
        self, addr: int, memaddr: int, nbytes: int, *, addrsize: int = ...
    ) -> bytes: ...
    def readfrom_mem_into(
        self, addr: int, memaddr: int, buf: bytearray, *, addrsize: int = ...
    ) -> None: ...
    def writeto_mem(
        self, addr: int, memaddr: int, buf: Union[bytes, bytearray], *, addrsize: int = ...
    ) -> None: ...

# ---------------------------------------------------------------------------
# machine.SPI
# ---------------------------------------------------------------------------

class SPI:
    MSB: int
    LSB: int

    def __init__(
        self,
        id: int,
        baudrate: int = ...,
        *,
        polarity: int = ...,
        phase: int = ...,
        bits: int = ...,
        firstbit: int = ...,
    ) -> None: ...
    def read(self, nbytes: int, write: int = ...) -> bytes: ...
    def readinto(self, buf: bytearray, write: int = ...) -> None: ...
    def write(self, buf: Union[bytes, bytearray]) -> None: ...
    def write_readinto(
        self, write_buf: Union[bytes, bytearray], read_buf: bytearray
    ) -> None: ...

# ---------------------------------------------------------------------------
# machine.UART
# ---------------------------------------------------------------------------

class UART:
    INV_TX: int
    INV_RX: int
    INV_RTS: int
    INV_CTS: int
    RTS: int
    CTS: int
    IRQ_RX: int
    IRQ_RXIDLE: int
    IRQ_BREAK: int

    def __init__(
        self,
        id: int,
        baudrate: int = ...,
        bits: int = ...,
        parity: Optional[int] = ...,
        stop: int = ...,
        *,
        tx: int = ...,
        rx: int = ...,
        txbuf: int = ...,
        rxbuf: int = ...,
        timeout: int = ...,
        timeout_char: int = ...,
        invert: int = ...,
        flow: int = ...,
    ) -> None: ...
    def any(self) -> int: ...
    def read(self, nbytes: int = ...) -> Optional[bytes]: ...
    def readinto(self, buf: bytearray, nbytes: int = ...) -> Optional[int]: ...
    def readline(self) -> Optional[bytes]: ...
    def write(self, buf: Union[bytes, bytearray]) -> Optional[int]: ...
    def flush(self) -> None: ...
    def irq(self, trigger: int, handler: Optional[Callable] = ...) -> None: ...

# ---------------------------------------------------------------------------
# machine.PWM
# ---------------------------------------------------------------------------

class PWM:
    def __init__(
        self,
        pin: int,
        *,
        freq: int = ...,
        duty: int = ...,
        duty_u16: int = ...,
        duty_ns: int = ...,
    ) -> None: ...
    def freq(self, value: int = ...) -> Optional[int]: ...
    def duty(self, value: int = ...) -> Optional[int]: ...
    def duty_u16(self, value: int = ...) -> Optional[int]: ...
    def duty_ns(self, value: int = ...) -> Optional[int]: ...
    def deinit(self) -> None: ...

# ---------------------------------------------------------------------------
# machine.ADC
# ---------------------------------------------------------------------------

class ADC:
    def __init__(self, pin: int) -> None: ...
    def read(self) -> int: ...
    def read_u16(self) -> int: ...
    def read_uv(self) -> int: ...

# ---------------------------------------------------------------------------
# machine.DAC
# ---------------------------------------------------------------------------

class DAC:
    def __init__(self, pin: int) -> None: ...
    def write(self, value: int) -> None:
        """Output voltage. value: 0..255."""
        ...
    def deinit(self) -> None: ...

# ---------------------------------------------------------------------------
# machine.I2S
# ---------------------------------------------------------------------------

class I2S:
    RX: int
    TX: int
    STEREO: int
    MONO: int

    def __init__(
        self,
        id: int,
        *,
        sck: int,
        ws: int,
        sd: int,
        mode: int,
        bits: int,
        format: int,
        rate: int,
        ibuf: int,
    ) -> None: ...
    def readinto(self, buf: bytearray) -> int: ...
    def write(self, buf: Union[bytes, bytearray]) -> int: ...
    def deinit(self) -> None: ...
    @staticmethod
    def shift(*, buf: bytearray, bits: int, shift: int) -> None: ...
