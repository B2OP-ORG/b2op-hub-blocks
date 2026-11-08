"""How much the firmware prints about what it is doing (for troubleshooting)."""

def setLevel(level: int) -> None:
    """Choose how chatty the firmware is: 0 = silent, 1 = errors, 2 = warnings, 3 = info, 4 = debug, 5 = everything."""
    ...
def getLevel() -> int:
    """The current log level (see :func:`setLevel`)."""
    ...
