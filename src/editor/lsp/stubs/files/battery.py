import time
import lvgl as lv

try:
    from lpf2 import battery as _battery
except ImportError:
    _battery = None

BATT_UPDATE_MS = 2000
_state = {"label": None, "last_ms": 0, "muted": 0x94A3B8}


def _symbol(pct):
    if pct >= 88:
        return lv.SYMBOL.BATTERY_FULL
    if pct >= 62:
        return lv.SYMBOL.BATTERY_3
    if pct >= 37:
        return lv.SYMBOL.BATTERY_2
    if pct >= 12:
        return lv.SYMBOL.BATTERY_1
    return lv.SYMBOL.BATTERY_EMPTY


def text():
    if _battery is None:
        return "--"
    try:
        pct = int(_battery.getPercent())
    except Exception:
        return "--"
    if pct < 0:
        pct = 0
    elif pct > 100:
        pct = 100
    return "{} {}%".format(_symbol(pct), pct)


def _color(pct):
    if pct <= 15:
        return 0xEF4444
    if pct <= 30:
        return 0xF59E0B
    return _state["muted"]


def attach(label, muted_color):
    _state["label"] = label
    _state["last_ms"] = time.ticks_ms()
    _state["muted"] = muted_color


def refresh(force=False):
    lbl = _state["label"]
    if lbl is None:
        return
    now = time.ticks_ms()
    if not force and time.ticks_diff(now, _state["last_ms"]) < BATT_UPDATE_MS:
        return
    _state["last_ms"] = now
    try:
        lbl.set_text(text())
        if _battery is not None:
            try:
                pct = int(_battery.getPercent())
                lbl.set_style_text_color(lv.color_hex(_color(pct)), 0)
            except Exception:
                pass
    except Exception:
        _state["label"] = None
