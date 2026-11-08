# Board details

`hub.board` is for advanced users: it describes the hub's circuit board — which parts it has and which pins they use.

The most useful values say whether a part exists on your hub:

```python
import hub

if hub.board.HAS_AUDIO:
    hub.audio.beep(880, 100)
print(hub.board.BOARD_NAME, hub.board.BOARD_VERSION)
```

Pin values can be passed straight to `machine.Pin`. A value of `-1` means "not on this board".

The full list is in the [reference](doc:api:hub.board).
