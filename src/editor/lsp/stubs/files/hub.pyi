"""Board-provided hub module.

Exposes the on-device peripherals: LPF2 ports (`hub.ports`), hub LED,
IMU (`hub.imu`), buttons, LCD (LVGL), status log and power-off. Objects
here are singletons created by the C firmware — this module is a stub;
the real implementation lives in the ESP32 port.
"""

from lpf2 import port as _port
from lpf2.local import port as _local_port
from lpf2.devices import hub_led as _hub_led
from lpf2.devices import accelerometer as _accelerometer
from lpf2.devices import gyroscope as _gyroscope
from machine import SDCard
from typing import Iterable, NoReturn, Optional, Union

class _vec3:
    """3-component float vector used for IMU acceleration / gyro samples."""
    x: float
    """X component."""
    y: float
    """Y component."""
    z: float
    """Z component."""
    def __init__(self, x: float, y: float, z: float) -> None: ...
    def length(self) -> float:
        """Euclidean length: ``sqrt(x*x + y*y + z*z)``."""
        ...
    def distance_to(self, other: "_vec3") -> float:
        """Euclidean distance between this vector and ``other``."""
        ...

class _imu_module:
    """On-board IMU (BNO085 or LSM6DSL, depending on board).

    Attitude fields are in degrees, wrapped to [-180, 180]. On BNO085
    boards the fusion is 9-DoF (accel + gyro + mag) done on-chip via the
    SH-2 Rotation Vector report — yaw has an absolute reference. On
    LSM6DSL boards fusion is a complementary filter on pitch/roll and
    gyro-integrated yaw (drifts; no magnetometer).
    """

    pitch: float
    """Fused pitch, degrees."""
    yaw: float
    """Fused yaw, degrees."""
    roll: float
    """Fused roll, degrees."""

    pitch_accel: float
    """Raw accel-derived pitch. Noisy but no drift. Degrees."""
    roll_accel: float
    """Raw accel-derived roll. Noisy but no drift. Degrees."""

    pitch_gyro: float
    """Pure gyro-integrated pitch. Drifts. Degrees."""
    yaw_gyro: float
    """Pure gyro-integrated yaw. Drifts. Degrees."""
    roll_gyro: float
    """Pure gyro-integrated roll. Drifts. Degrees."""

    acceleration: _vec3
    """Latest acceleration sample in mG, hub frame."""
    gyro_rate: _vec3
    """Latest gyro-rate sample in dps, hub frame. Calibrated bias subtracted."""

    calibrated: bool
    """LSM6DSL: post-reset gyro-bias averaging finished (~2 s after
    boot/reset). While False, gyro readings and yaw are held at 0.
    BNO085: rotation-vector status byte >= 2 (medium/high accuracy)."""

    def reset(self) -> None:
        """Zero yaw.

        LSM6DSL: restarts gyro-bias calibration — hub must be held
        stationary for ~2 s afterwards.
        BNO085: captures the current fused yaw as the new zero (Tare);
        no wait required.
        """
        ...

    def start_calibration(self) -> bool:
        """Enable all backend-supported calibrators.

        BNO085 already runs continuous cal by default; this makes it
        explicit. Perform figure-8 motion (mag) and place the hub in
        several flat orientations for a few seconds each (accel/gyro).
        Returns True on success.
        """
        ...

    def save_calibration(self) -> bool:
        """Persist current calibration to the sensor's non-volatile storage.

        BNO085: saves the Dynamic Calibration Data (DCD) into on-chip
        flash. LSM6DSL: no-op (gyro bias is recomputed every boot).
        Call once ``calibrated`` reads True. Returns True on success.
        """
        ...

class _ports_module:
    """Physical hub ports, exposed as :class:`lpf2.local.port` objects.

    ``A``..``D`` are the external LPF2 sockets; ``LED``, ``accelerometer``
    and ``gyro`` wrap the built-in devices behind LPF2-style ports.
    """
    A: _local_port
    """External port A."""
    B: _local_port
    """External port B."""
    C: _local_port
    """External port C."""
    D: _local_port
    """External port D."""
    LED: _port
    """Virtual port wrapping the built-in hub RGB LED."""
    accelerometer: _port
    """Virtual port wrapping the on-board accelerometer."""
    gyro: _port
    """Virtual port wrapping the on-board gyroscope."""

class _log_module:
    """Firmware log control."""
    def setLevel(self, level: int) -> None:
        """Set the runtime log level."""
        ...
    def getLevel(self) -> int:
        """Get the runtime log level."""
        ...

class _lcd_module:
    """LCD panel + LVGL control.

    The LCD is driven by ESP-IDF `esp_lcd` (ST7735) with an LVGL
    display layer on top. Some methods are LVGL-independent (raw panel
    access) and are useful to sanity-check wiring before LVGL is
    initialised.
    """

    def init(self) -> None:
        """Initialise LVGL.

        Must be called once from a MicroPython script before
        ``import lvgl`` — LVGL allocates via the MicroPython GC, whose
        state is thread-local to ``mp_task``, so C-side auto-init from
        ``hub_main_task`` crashes with LoadProhibited.
        """
        ...

    def on(self) -> None:
        """Backlight fully on (via PCA9685)."""
        ...

    def off(self) -> None:
        """Backlight off."""
        ...

    def backlight(self, duty: int) -> None:
        """Set backlight duty (0..255, mapped to PCA9685 0..4095)."""
        ...

    def reset(self) -> None:
        """Pulse the panel RESET line and re-init the panel driver."""
        ...

    def fill(self, rgb565: int) -> None:
        """Fill the panel with a solid RGB565 colour.

        Bypasses LVGL — useful to confirm the panel + SPI wiring work
        before LVGL renders anything.
        """
        ...

    def setInvert(self, on: bool) -> None:
        """Toggle panel colour inversion (ST7735 INVON / INVOFF)."""
        ...

    def setMadctl(self, byte: int) -> None:
        """Send raw MADCTL byte.

        Bits: MY(0x80) MX(0x40) MV(0x20) ML(0x10) BGR(0x08).
        """
        ...

    def setOffset(self, x: int, y: int) -> None:
        """Column/row start offsets applied to every CASET/RASET.

        Depends on panel variant (e.g. GreenTab wants (2, 3); 0.96"
        80x160 wants (26, 1)).
        """
        ...

    def cmd(self, cmd: int, data: bytes = b"") -> None:
        """Send an arbitrary command + optional data payload. For probing panels."""
        ...

class _video_module:
    """MJPEG-in-AVI video player on the 160x128 ST7735 LCD.

    Suspends LVGL during playback and resumes it when done.
    Paths must be absolute (e.g. ``/sd/clip.avi``).
    """

    def play(self, path: str, *, block: bool = True) -> None:
        """Play an MJPEG-in-AVI file (video only; audio chunks skipped).

        If ``block=False`` returns immediately; call :meth:`is_finished`
        to poll for completion.
        """
        ...

    def play_av(self, path: str, *, block: bool = True) -> None:
        """Play an MJPEG-in-AVI file with embedded PCM audio via NS4168.

        Only available on boards that have an NS4168 amplifier; on others
        the audio track is silently ignored.
        If ``block=False`` returns immediately.
        """
        ...

    def stop(self) -> None:
        """Abort playback. Blocks until the player task has exited."""
        ...

    def is_finished(self) -> bool:
        """Return ``True`` when no playback is in progress."""
        ...


class _audio_module:
    """PCM/WAV audio player and synthesiser via NS4168 I2S Class-D amplifier.

    Only present on boards where ``hub.board.HAS_NS4168 == 1``.
    Paths must be absolute (e.g. ``/sd/sound.wav``).
    """

    def play(self, path: str, *, rate: int = 44100, bits: int = 16,
             channels: int = 1, block: bool = True) -> None:
        """Stream a PCM or WAV file to the NS4168.

        WAV files are auto-detected: ``rate``, ``bits``, and ``channels`` are
        read from the file header and the keyword arguments are ignored.
        For raw PCM files the keyword arguments set the format
        (``rate`` in Hz, ``bits`` = 8/16/24/32, ``channels`` = 1 or 2).
        If ``block=False`` returns immediately.
        """
        ...

    def stop(self) -> None:
        """Abort playback. Blocks until the player task has exited."""
        ...

    def is_finished(self) -> bool:
        """Return ``True`` when no playback is in progress."""
        ...

    def beep(self, freq: float, duration_ms: int, *, block: bool = True) -> None:
        """Synthesise a single tone at ``freq`` Hz for ``duration_ms`` milliseconds.

        Uses the current wave type (see :meth:`set_wave_type`).
        If ``block=False`` returns immediately while playback continues in the background.
        """
        ...

    def note(self, note: "str | int", length: float, *, block: bool = True) -> None:
        """Synthesise one note using the current BPM and wave type.

        ``note``: name string (e.g. ``"C4"``, ``"D#3"``, ``"Bb5"``, ``"REST"``)
        or an integer MIDI note number.
        ``length``: duration in beats (1.0 = one beat at current BPM).
        """
        ...

    def set_note_speed(self, bpm: float) -> None:
        """Set the tempo used by :meth:`note` and :meth:`play_melody_from_list`. Default 120 BPM."""
        ...

    def set_wave_type(self, wave: "Literal['sine', 'square', 'sawtooth']") -> None:
        """Set the waveform for all synthesis methods. ``"sine"`` (default), ``"square"``, ``"sawtooth"``."""
        ...

    def play_melody(self, name: str, *, block: bool = True) -> None:
        """Play a built-in melody by name.

        Available: ``"startup"``, ``"shutdown"``, ``"success"``, ``"error"``,
        ``"dadadum"``, ``"mario"``, ``"nokia"``.
        """
        ...

    def play_melody_from_list(
        self,
        melody: "list[tuple[str | int, float]]",
        *,
        block: bool = True,
    ) -> None:
        """Play a user-defined sequence of ``(note, length)`` tuples.

        ``note`` is a note name string or MIDI int; ``length`` is beats at current BPM.
        """
        ...

    def play_midi(self, path: str, *, block: bool = True) -> None:
        """Play a Standard MIDI File (SMF format 0 or 1) from the filesystem.

        Up to 8 simultaneous voices. Uses the current wave type.
        ``path`` must be absolute (e.g. ``"/sd/song.mid"``).
        """
        ...


from typing import Callable, Literal, Optional, overload

_ButtonName = Literal["center", "up", "down", "left", "right"]
_ButtonCb = Callable[[], None]

class _buttons_module:
    """On-board buttons: 5-way + power.

    Level readers (``center``/``up``/``down``/``left``/``right``)
    return the current held state. Callbacks fire on rising edge
    (release-then-press) inside :meth:`poll`, which the Python main
    loop must call to drive them.
    """

    def center(self) -> bool:
        """True while the power/center button is held.

        A short press reads as pressed; a >=2 s hold triggers a
        hardware power-off in the C loop.
        """
        ...
    def up(self) -> bool:
        """True while the UP button is held."""
        ...
    def down(self) -> bool:
        """True while the DOWN button is held."""
        ...
    def left(self) -> bool:
        """True while the LEFT button is held."""
        ...
    def right(self) -> bool:
        """True while the RIGHT button is held."""
        ...

    @overload
    def on(self, name: _ButtonName) -> Callable[[_ButtonCb], _ButtonCb]: ...
    @overload
    def on(self, name: _ButtonName, cb: Optional[_ButtonCb]) -> Optional[_ButtonCb]: ...
    def on(self, name, cb=None):
        """Register a callback for a button rising edge.

        Usable as a decorator::

            @hub.buttons.on("left")
            def left_pressed():
                ...

        Passing ``None`` as the second arg unregisters the callback.
        """
        ...

    def off(self, name: _ButtonName) -> None:
        """Unregister the callback for ``name``."""
        ...

    def poll(self) -> None:
        """Sample all buttons and dispatch pending rising-edge callbacks.

        Must be called from the Python main loop for callbacks to run.
        """
        ...

    def _snapshot(self) -> object:
        """Detach and return the current callback registry (or None if empty),
        leaving the registry cleared.

        Pair with :meth:`_restore` to swap in a scratch registry for a
        nested context (e.g. running a user program without letting
        outer callbacks fire).
        """
        ...
    def _restore(self, snapshot: object) -> None:
        """Reinstall a registry captured by :meth:`_snapshot`."""
        ...

class _pwm_module:
    """Generic PWM driver accessed via logical pins.

    Takes logical-pin values from ``hub.board`` constants (e.g.
    ``hub.board.LCD_BACKLIGHT_PIN``). The driver dispatches ESP32 pins
    to LEDC and PCA9685 pins to the chip driver transparently.

    Duty is 12-bit (``0..MAX_DUTY`` = ``0..4095``).
    """

    MAX_DUTY: int
    """Maximum duty value (4095; 12-bit resolution)."""

    def configure(self, pin: int, freq_hz: int) -> None:
        """Configure ``pin`` for PWM at ``freq_hz`` Hz.

        Must be called before :meth:`set` or :meth:`off` on a pin.
        For PCA9685 pins the prescaler is chip-wide; changing it
        affects all other PCA9685 channels.
        """
        ...
    def set(self, pin: int, duty: int) -> None:
        """Set ``pin`` to 12-bit ``duty`` (``0..MAX_DUTY``)."""
        ...
    def off(self, pin: int) -> None:
        """Drive ``pin`` fully off (zero duty)."""
        ...

class _battery_module:
    """Battery voltage + charging status.

    Voltage comes from the on-board resistor divider ADC; charging
    state is decoded from the IP2366's ISTAT (RXD0) and CSTAT (SC16IS750
    P0) open-drain outputs. Values are refreshed on the C-side hub loop
    (every ~2 s).
    """

    UNKNOWN: int
    """State value: pins not sampled yet, or both LOW (unusual)."""
    ON_BATTERY: int
    """State value: no charger present / charger detached."""
    CHARGING: int
    """State value: charge current flowing (ISTAT LOW)."""
    FULLY_CHARGED: int
    """State value: charger present, charge cycle complete (CSTAT LOW)."""

    def voltage(self) -> int:
        """Latest pack voltage in millivolts (0 if ADC not configured)."""
        ...
    def percent(self) -> int:
        """Voltage mapped to 0..100 % via the Lpf2 default linear curve."""
        ...
    def state(self) -> int:
        """Current state: one of the module constants above."""
        ...
    def charging(self) -> bool:
        """True when charge current is actively flowing."""
        ...
    def fully_charged(self) -> bool:
        """True when charger is present and the charge cycle has completed."""
        ...

class _i2c:
    """Shared internal I2C bus (``Wire1`` on the C++ side).

    Same bus as the PCA9685, SC16IS750 (I2C variant), the BNO085 IMU
    and the on-board Grove connector. Public API mirrors
    :class:`machine.I2C` (hardware variant) one-to-one — anything
    written for ``machine.I2C`` works unchanged.

    The Arduino-ESP32 ``TwoWire`` driver serialises individual
    transactions with a per-bus mutex, so calls from Python and from
    the C++ hub tick are safe to interleave at transaction
    granularity. A second recursive mutex on the Python side keeps
    compound ops (``readfrom_mem`` = write memaddr + repeated-start
    read) from being split by another Python caller.

    Do not instantiate — use the pre-built ``hub.i2c`` singleton.
    """

    def init(
        self,
        *,
        scl: Optional[int] = None,
        sda: Optional[int] = None,
        freq: int = -1,
    ) -> None:
        """Re-configure the bus.

        ``scl`` / ``sda`` are fixed to the hub's internal I2C pins;
        passing a different value raises :class:`ValueError`. ``freq``
        (Hz) is applied via ``TwoWire::setClock``.
        """
        ...

    def scan(self) -> list[int]:
        """Return the 7-bit addresses that responded to a probe (``0x08``..``0x77``)."""
        ...

    def readfrom(self, addr: int, nbytes: int, stop: bool = True) -> bytes:
        """Read ``nbytes`` from ``addr``. Raises ``OSError(ENODEV)`` on NACK."""
        ...

    def readfrom_into(self, addr: int, buf: bytearray, stop: bool = True) -> None:
        """Read ``len(buf)`` bytes from ``addr`` into ``buf``."""
        ...

    def writeto(self, addr: int, buf: bytes, stop: bool = True) -> int:
        """Write ``buf`` to ``addr``. Returns the number of bytes written."""
        ...

    def writevto(
        self, addr: int, vector: Iterable[bytes], stop: bool = True
    ) -> int:
        """Write a scatter/gather ``vector`` of buffers in one transaction."""
        ...

    def readfrom_mem(
        self, addr: int, memaddr: int, nbytes: int, *, addrsize: int = 8
    ) -> bytes:
        """Read ``nbytes`` from register ``memaddr`` on ``addr``.

        ``addrsize`` is 8 or 16 (big-endian on the wire). Uses a
        repeated-start between the memaddr write and the read.
        """
        ...

    def readfrom_mem_into(
        self, addr: int, memaddr: int, buf: bytearray, *, addrsize: int = 8
    ) -> None:
        """As :meth:`readfrom_mem` but into a pre-allocated ``buf``."""
        ...

    def writeto_mem(
        self, addr: int, memaddr: int, buf: bytes, *, addrsize: int = 8
    ) -> None:
        """Write ``buf`` to register ``memaddr`` on ``addr``."""
        ...

class _board_module:
    """1:1 mirror of the board's ``Board.h`` via ``BOARD_INT_EXPORTS`` /
    ``BOARD_STR_EXPORTS``. All integer constants are encoded as logical
    pins (``MAKE_PIN``) or logical buses (``MAKE_BUS``); use
    ``hub.board.*`` values with ``hub.pwm`` / ``hub.i2c`` directly.
    Attributes set to ``0`` / ``PIN_NONE`` on this board are still
    present but meaningless.
    """
    # Identity
    BOARD_NAME: str
    BOARD_VERSION: str

    # I2C buses
    HAS_I2C0: int
    I2C0_SDA_PIN: int
    I2C0_SCL_PIN: int
    I2C0_FREQ: int

    # SPI buses
    HAS_SPI2: int
    SPI2_SCK_PIN: int
    SPI2_MISO_PIN: int
    SPI2_MOSI_PIN: int
    SPI2_FREQ: int
    HAS_SPI3: int
    SPI3_SCK_PIN: int
    SPI3_MOSI_PIN: int
    SPI3_MISO_PIN: int
    SPI3_FREQ: int

    # UART buses
    HAS_UART0: int
    HAS_UART1: int
    HAS_UART2: int

    # PCA9685
    HAS_PCA9685: int
    PCA9685_BUS: int
    PCA9685_I2C_ADDR: int
    PCA9685_FREQ_HZ: int

    # SC16IS750
    HAS_SC16IS750: int
    SC16IS750_BUS: int
    SC16IS750_SPI_FREQ: int
    SC16IS750_CS_PIN: int
    SC16IS750_IRQ_PIN: int
    SC16IS750_CRYSTAL_FREQ: int
    SC16IS750_TX_DISABLE_PIN: int

    # BNO085
    HAS_BNO085: int
    BNO085_BUS: int
    BNO085_I2C_ADDR: int
    BNO085_INT_PIN: int

    # LSM6DSL
    HAS_LSM6DSL: int

    # ST7735
    HAS_ST7735: int
    LCD_BUS: int
    LCD_SPI_FREQ: int

    # MCPWM
    HAS_MCPWM: int

    # Power
    HAS_POWER: int
    POWER_ON_PIN: int

    # Buttons
    HAS_BUTTONS: int
    BUTTON_PWR_PIN: int
    BUTTON_UP_PIN: int
    BUTTON_LEFT_PIN: int
    BUTTON_DOWN_PIN: int
    BUTTON_RIGHT_PIN: int

    # LCD
    HAS_LCD: int
    LCD_DC_PIN: int
    LCD_TE_PIN: int
    LCD_RST_PIN: int
    LCD_CS_PIN: int
    LCD_BACKLIGHT_PIN: int

    # IMU
    HAS_IMU: int
    IMU_TYPE: int
    IMU_INT_PIN: int

    # RGB LED
    HAS_RGB_LED: int
    RGB_LED_TYPE: int
    RGB_LED_COUNT: int
    RGB_LED_DATA_PIN: int

    # Battery / charger
    HAS_BATTERY_MONITOR: int
    BATT_ADC_PIN: int
    BATT_STAT_PIN: int
    HAS_CHARGER: int
    CHG_EN_PIN: int
    CHG_STAT_PIN: int

    # LPF2 ports
    HAS_PORT_A: int
    PORT_A_UART_BUS: int
    PORT_A_ID1_PIN: int
    PORT_A_ID2_PIN: int
    PORT_A_PWM1_PIN: int
    PORT_A_PWM2_PIN: int

    HAS_PORT_B: int
    PORT_B_UART_BUS: int
    PORT_B_ID1_PIN: int
    PORT_B_ID2_PIN: int
    PORT_B_PWM1_PIN: int
    PORT_B_PWM2_PIN: int

    HAS_PORT_C: int
    PORT_C_UART_BUS: int
    PORT_C_ID1_PIN: int
    PORT_C_ID2_PIN: int
    PORT_C_PWM1_PIN: int
    PORT_C_PWM2_PIN: int

    HAS_PORT_D: int
    PORT_D_UART_BUS: int
    PORT_D_ID1_PIN: int
    PORT_D_ID2_PIN: int
    PORT_D_PWM1_PIN: int
    PORT_D_PWM2_PIN: int

    # SD card
    HAS_SD_CARD: int
    SD_MODE: int
    SD_SLOT: int
    SD_WIDTH: int
    SD_CLK_PIN: int
    SD_CMD_PIN: int
    SD_D0_PIN: int
    SD_D1_PIN: int
    SD_D2_PIN: int
    SD_D3_PIN: int
    SD_SCK_PIN: int
    SD_MISO_PIN: int
    SD_MOSI_PIN: int
    SD_CS_PIN: int

ports: _ports_module
"""Hub ports (see :class:`_ports_module`)."""
log: _log_module
"""Firmware log control."""
led: _hub_led
"""Built-in hub RGB LED."""
accelerometer: _accelerometer
"""Built-in accelerometer wrapped as a Devices.accelerometer."""
gyro: _gyroscope
"""Built-in gyroscope wrapped as a Devices.gyroscope."""
board: _board_module
"""Board-specific constants (see :class:`_board_module`)."""
imu: _imu_module
"""Fused IMU (see :class:`_imu_module`)."""
lcd: _lcd_module
"""LCD + LVGL control (see :class:`_lcd_module`)."""
video: _video_module
"""MJPEG-in-AVI video player (see :class:`_video_module`). Only present when board has an LCD."""
audio: _audio_module
"""Raw-PCM audio player via NS4168 I2S amp (see :class:`_audio_module`). Only present when board has NS4168."""
buttons: _buttons_module
"""Button API (see :class:`_buttons_module`)."""
battery: _battery_module
"""Battery voltage + charging status (see :class:`_battery_module`)."""
pwm: _pwm_module
"""On-board PCA9685 PWM driver (see :class:`_pwm_module`)."""
i2c: _i2c
"""Shared internal I2C bus (Grove + on-board devices). See :class:`_i2c`."""

def sd_card() -> Optional[SDCard]:
    """Return the mounted ``machine.SDCard`` instance, or ``None`` if no SD card is present.

    The card is initialised and mounted at ``/sd`` before ``boot.py`` runs.
    Returns ``None`` on boards without ``HAS_SD_CARD`` or when mount failed.
    """
    ...

def sd_remount() -> None:
    """Unmount the cached SD card handle and re-mount the SD card at ``/sd``.

    Call after disabling USB MSC so the SDMMC host is freed and can be
    re-initialised via ``machine.SDCard``.
    """
    ...

def usb_msc_mode() -> bool:
    """Return ``True`` if USB Mass Storage Class is currently active."""
    ...

def set_usb_msc(enabled: bool) -> None:
    """Enable or disable USB Mass Storage Class (SD card).

    When enabling, the SDMMC host is opened without a VFS mount so TinyUSB
    can own the SD card. When disabling, the SDMMC host is released so
    :func:`sd_remount` can re-mount it via MicroPython.
    """
    ...

def powerOff() -> NoReturn:
    """Turn the hub off immediately. Does not return.

    If the hardware power latch does not hold (e.g. USB power is present),
    the firmware performs an orderly shutdown: disables LPF2 ports and motor
    PWM outputs, turns off the LCD backlight, deinitialises BLE and WiFi,
    signals the MicroPython task to exit (GC runs before the task deletes
    itself), throttles the CPU to 80 MHz, then enters a low-activity loop
    that keeps the battery status LED updated. Pressing the right button
    restarts the firmware.
    """
    ...

def set_framed_output(enabled: bool) -> None:
    """Enable/disable C-level stdout framing (`#FR:OUT <len>\\n<bytes>`).

    When enabled, every ``mp_hal_stdout_tx_strn`` call is wrapped so the host
    protocol parser can separate program output from binary frames. Used by
    the HubProtocol layer since ``sys.stdout`` is an immutable dummy in this
    build and can't be replaced from Python.
    """
    ...

def raw_write(buf: bytes) -> int:
    """Write bytes to stdout bypassing the framing wrapper. Returns bytes written.

    Flushes any pending framed output first so raw bytes never interleave
    inside a framed payload.
    """
    ...

def flush_output() -> None:
    """Flush any buffered framed stdout data as a `#FR:OUT` frame."""
    ...

def set_frame_sink(cb: Optional[Callable[[bytes], None]]) -> None:
    """Register a callback that mirrors framed and raw stdout bytes elsewhere.

    Called from ``mp_hal_stdout_tx_strn`` under the GIL after every framed
    flush and every :func:`raw_write`. Used to forward the same byte stream
    to BLE NUS (since ``os.dupterm`` only exposes slot 0 = REPL on this port).
    Pass ``None`` to detach. Exceptions inside the callback are swallowed.
    """
    ...

def _ble_drain() -> None:
    """Pump the NimBLE event queue from mp_task without going through the scheduler.

    Called by ``ble_uart.read_rx()`` inside ``_read_exact`` while the MicroPython
    scheduler is locked, so BLE IRQ callbacks (which arrive via ``mp_sched_schedule``)
    can still be serviced.
    """
    ...

def ble_conn_update(conn_handle: int, min_ms: int, max_ms: int) -> None:
    """Request a BLE connection parameter update from the peripheral side.

    Calls NimBLE ``ble_gap_update_params``.  The central may accept or ignore
    the request — no exception is raised either way.

    Args:
        conn_handle: BLE connection handle (from ``_IRQ_CENTRAL_CONNECT`` /
            ``_IRQ_MTU_EXCHANGED``).
        min_ms: Minimum desired connection interval in milliseconds.
        max_ms: Maximum desired connection interval in milliseconds.
    """
    ...

def ble_set_phy_2m(conn_handle: int) -> None:
    """Request a PHY update to LE 2M on an active BLE connection.

    Calls NimBLE ``ble_gap_set_prefered_le_phy`` with ``BLE_GAP_LE_PHY_2M_MASK``
    for both TX and RX.  Doubles raw link throughput compared to the default 1M
    PHY.  The central may ignore the request.

    Args:
        conn_handle: BLE connection handle (from ``_IRQ_CENTRAL_CONNECT``).
    """
    ...

_PollName = Literal["poll"]
_PollFn = Callable[[], None]

@overload
def on(name: _PollName) -> Callable[[_PollFn], _PollFn]:
    """Decorator form: ``@hub.on("poll")``."""
    ...

@overload
def on(name: _PollName, fn: _PollFn) -> _PollFn:
    """Direct form: ``hub.on("poll", my_fn)``."""
    ...

def on(name: _PollName, fn: Optional[_PollFn] = None) -> Union[Callable[[_PollFn], _PollFn], _PollFn]:
    """Register a callback for a firmware event. Currently only ``"poll"`` is supported.

    ``"poll"`` callbacks are scheduled on mp_task via ``mp_sched_schedule`` every
    ~20 ms by the C firmware loop. They run even while a user script is executing.
    """
    ...

def _request_stop() -> None:
    """Schedule a KeyboardInterrupt on the MicroPython task.

    Used by the protocol STOP frame handler to interrupt a running script
    from outside (e.g. host sends STOP over USB/BLE). The interrupt fires
    at the next VM checkpoint; the runner catches it as a clean exit.
    Sets an internal flag so hub_poll_c re-fires KI every scheduler cycle
    until _clear_stop_request() is called, preventing FIFO callbacks (e.g.
    BLE IRQ) from permanently consuming the interrupt.
    """
    ...

def _clear_stop_request() -> None:
    """Clear the stop-request flag set by _request_stop().

    Called by runner.run_program() in its finally block after exec() returns,
    so hub_poll_c stops re-firing KeyboardInterrupt once the program has ended.
    """
    ...

def _sched_lock() -> None:
    """Lock the MicroPython scheduler (calls mp_sched_lock).

    Paired with _sched_unlock(). Call in a finally block after _sched_unlock()
    to restore the scheduler state expected by the outer mp_sched_run_pending
    caller (e.g. after exec() returns in runner.run_program).
    """
    ...

def _sched_unlock() -> None:
    """Unlock the MicroPython scheduler if currently locked (calls mp_sched_unlock).

    No-op if the scheduler is not locked. Call before exec(user_code) in
    runner.run_program so that hub_poll static nodes can fire at VM branch
    points during user script execution, enabling USB STOP delivery.
    """
    ...

# --- shim overlay (scripts/stubs-overlay) ------------------------
