"""Live values shared with the computer or phone connected to the hub.

The app connected over USB or Bluetooth picks names for its controls (for
example ``"speed"`` or ``"light"``) and keeps sending their current values.
Your program just reads them::

    import remote

    speed = remote.speed          # 0 until the app sends something
    gain = remote.get("gain", 1.0)

Values are numbers (``int`` or ``float``), ``True``/``False`` or text
(``str``), depending on how the app set up the control.

When the app disconnects, every value it sent goes back to its starting
value (``0``, ``0.0``, ``False`` or ``""``), so a robot driven by
``remote.speed`` stops on its own.

It works the other way too: your program can send values to the app,
for example a sensor reading to show on a gauge::

    remote.create_message(0, "distance", remote.FLOAT)
    remote.send(0, 12.5)

Messages belong to the program: when it ends they are removed and the
app is told to forget them.

Controls and messages share one set of ids, so pick message ids the app's
controls don't use. :func:`send` also works with a control's id: the
program changes the control, and the app's slider or switch moves to the
new value::

    remote.send(0, 0)      # control id 0 ("speed") back to 0
"""

from typing import Any, Dict, Optional, Type, Union

Value = Union[int, float, bool, str]

INT: int
"""Message type: whole numbers (-2147483648..2147483647). Same as passing ``int``."""
FLOAT: int
"""Message type: decimal numbers. Same as passing ``float``."""
BOOL: int
"""Message type: ``True`` / ``False``. Same as passing ``bool``."""
STR: int
"""Message type: text up to 255 bytes. Same as passing ``str``."""

def get(name: str, default: Any = 0) -> Any:
    """The current value of control (or message) ``name``, or ``default``
    (``0``) if there is nothing with that name."""
    ...

def age_ms(name: str) -> Optional[int]:
    """How many milliseconds ago control ``name`` last changed, or ``None`` if
    there is no such control. Use it to stop when the app goes quiet::

        if remote.age_ms("speed") is None or remote.age_ms("speed") > 500:
            motor.startPower(0)
    """
    ...

def items() -> Dict[str, Value]:
    """All controls and messages and their current values, as a new ``dict``."""
    ...

def create_message(id: int, name: str, type: Union[int, Type[int], Type[float], Type[bool], Type[str]]) -> None:
    """Tell the app about a value your program will send.

    ``id`` is a number 0..255 you then use with :func:`send`, ``name`` is what
    the app shows (1..32 bytes), ``type`` is :data:`INT`, :data:`FLOAT`,
    :data:`BOOL`, :data:`STR` or simply ``int``, ``float``, ``bool``, ``str``.
    The value starts at ``0`` / ``0.0`` / ``False`` / ``""``. Calling it again
    with the same ``id`` replaces the message.
    An app that connects later still learns every message and its last value.

    Controls and messages share ids. Using the id of one of the app's
    controls with the same name and type does nothing (fine for declaring
    the controls you :func:`send` to); with another name or type it raises
    ``ValueError``.

    Raises ``ValueError`` for a bad id, name or type, or an id / name the
    app already uses for another control.
    """
    ...

def send(id: int, value: Value) -> None:
    """Send a new value for message ``id`` to the app.

    ``id`` may also be one of the app's controls: the control changes (for
    your program too) and the app moves its slider / switch to match. The
    app can change it again at any time.

    The value is converted to the message's type: an :data:`INT` message
    takes ``int`` (or ``bool``), :data:`FLOAT` takes ``int`` or ``float``,
    :data:`BOOL` takes anything (truthiness), :data:`STR` needs a ``str``.
    If no app is listening, the value is just remembered for later.

    Raises ``ValueError`` if ``id`` is neither a control nor a message made
    with :func:`create_message`, or the text is longer than 255 bytes,
    ``TypeError`` for a wrong value type.
    """
    ...

def __getattr__(name: str) -> Any:
    """``remote.speed`` is the same as ``remote.get("speed")``: the value, or
    ``0`` if there is no such control. Names starting with ``_`` raise
    ``AttributeError``.

    Good to know:

    * The module's own names come first. A control called ``get``,
      ``items``, ``age_ms``, ``send``, ``create_message``, ``INT``,
      ``FLOAT``, ``BOOL``, ``STR`` or ``__name__`` can't be read as
      ``remote.get`` (that is the function); use ``remote.get("get")`` or
      ``remote.items()`` instead.
    * Every other name exists: ``hasattr(remote, "x")`` is always ``True``
      and ``from remote import x`` gives ``0`` if ``x`` is not a control.
      To check whether a control exists, use ``remote.age_ms(name) is not None``
      or ``name in remote.items()``.
    * Attributes are read-only: ``remote.speed = 5`` raises an error. To
      change a control use :func:`send` with its id.
    """
    ...
