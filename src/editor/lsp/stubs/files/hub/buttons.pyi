"""The hub's buttons: a 5-way pad (up, down, left, right and center).

Ask whether a button is held right now with ``hub.buttons.left()`` and
friends, or have a function run every time a button is pressed with
:func:`on`.

Holding the center button for 2 seconds stops the running program;
holding it for 5 seconds turns the hub off.
"""

from typing import Callable, Literal, Optional, overload

_ButtonName = Literal["center", "up", "down", "left", "right"]
_ButtonCb = Callable[[], None]

def center() -> bool:
    """``True`` while the center (power) button is held down.

    Holding it for 2 seconds stops your program, and holding it for
    5 seconds turns the hub off.
    """
    ...
def up() -> bool:
    """``True`` while the up button is held down."""
    ...
def down() -> bool:
    """``True`` while the down button is held down."""
    ...
def left() -> bool:
    """``True`` while the left button is held down."""
    ...
def right() -> bool:
    """``True`` while the right button is held down."""
    ...

@overload
def on(name: _ButtonName) -> Callable[[_ButtonCb], _ButtonCb]: ...
@overload
def on(name: _ButtonName, cb: Optional[_ButtonCb]) -> Optional[_ButtonCb]: ...
def on(name, cb=None):
    """Run a function every time a button is pressed.

    ``name`` is ``"center"``, ``"up"``, ``"down"``, ``"left"`` or
    ``"right"``. The function runs once per press, in the background,
    while the rest of your program keeps going.

    Put it above a function::

        @hub.buttons.on("left")
        def left_pressed():
            print("left!")

    or pass the function directly: ``hub.buttons.on("left", left_pressed)``.
    Passing ``None`` instead of a function removes it again.
    """
    ...

def off(name: _ButtonName) -> None:
    """Stop running a function when button ``name`` is pressed."""
    ...
