"""Named colors for lights and color sensors.

Use them like ``hub.led.setColorIdx(color.RED)`` after
``from lpf2 import color``, or compare what a color sensor sees:
``if sensor.getColorIdx() == color.BLUE: ...``
"""

BLACK: int = 0
"""Black / off."""
PINK: int = 1
"""Pink."""
PURPLE: int = 2
"""Purple."""
BLUE: int = 3
"""Blue."""
LIGHTBLUE: int = 4
"""Light blue."""
CYAN: int = 5
"""Cyan."""
GREEN: int = 6
"""Green."""
YELLOW: int = 7
"""Yellow."""
ORANGE: int = 8
"""Orange."""
RED: int = 9
"""Red."""
WHITE: int = 10
"""White."""
NUM_COLORS: int = 11
"""How many colors there are (BLACK to WHITE)."""
NONE: int = 255
"""Sentinel: no colour / unknown."""
