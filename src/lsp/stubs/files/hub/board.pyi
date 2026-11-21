"""Advanced: technical details about the hub's circuit board.

Most programs never need this. It tells you which parts this hub has
(for example ``HAS_AUDIO`` is ``1`` when there is a speaker) and which
pins and buses they use. Pin and bus numbers can be passed straight to
``machine.Pin`` and ``hub.i2c``. A value of ``-1`` means "not on this
board".
"""

# Identity
BOARD_NAME: str
"""Name of this hub model."""
BOARD_VERSION: str
"""Hardware version of this hub."""

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
"""``1`` if this hub has a screen."""
LCD_DC_PIN: int

# Audio amplifier
HAS_AUDIO: int
"""``1`` if this hub has a speaker (needed for ``hub.audio``)."""
AUDIO_BUS: int
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
"""``1`` if this hub has an SD card slot."""
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
