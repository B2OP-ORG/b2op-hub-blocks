"""Button states reported by LEGO hubs and remotes.

``PRESSED`` / ``RELEASED`` are for a hub's button; ``UP`` / ``DOWN`` /
``STOP`` are the + / - / red buttons on a Powered Up remote.
"""

PRESSED: int = 0x01
"""Hub power button pressed."""
RELEASED: int = 0x00
"""Hub power button released."""
UP: int = 0x01
"""Remote button: ``+`` (up)."""
DOWN: int = 0xff
"""Remote button: ``-`` (down)."""
STOP: int = 0x7f
"""Remote button: red (stop)."""
