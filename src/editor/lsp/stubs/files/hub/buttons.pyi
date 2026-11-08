"""On-board buttons: 5-way + power.

Level readers (``center``/``up``/``down``/``left``/``right``)
return the current held state. Callbacks fire on rising edge
(release-then-press) and are dispatched automatically by the
C background task (``hub_main_task``).
"""

from typing import Callable, Literal, Optional, overload

_ButtonName = Literal["center", "up", "down", "left", "right"]
_ButtonCb = Callable[[], None]

def center() -> bool:
    """True while the power/center button is held.

    A short press reads as pressed; a >=2 s hold triggers a
    hardware power-off in the C loop.
    """
    ...
def up() -> bool:
    """True while the UP button is held."""
    ...
def down() -> bool:
    """True while the DOWN button is held."""
    ...
def left() -> bool:
    """True while the LEFT button is held."""
    ...
def right() -> bool:
    """True while the RIGHT button is held."""
    ...

@overload
def on(name: _ButtonName) -> Callable[[_ButtonCb], _ButtonCb]: ...
@overload
def on(name: _ButtonName, cb: Optional[_ButtonCb]) -> Optional[_ButtonCb]: ...
def on(name, cb=None):
    """Register a callback for a button rising edge.

    Usable as a decorator::

        @hub.buttons.on("left")
        def left_pressed():
            ...

    Passing ``None`` as the second arg unregisters the callback.
    """
    ...

def off(name: _ButtonName) -> None:
    """Unregister the callback for ``name``."""
    ...
