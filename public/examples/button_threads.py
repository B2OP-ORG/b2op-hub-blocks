# Button callbacks run in their own threads.
#
#   up     - start a ticker that prints forever (press again for another)
#   left   - start a 3 s countdown
#   down   - stop every running callback with hub.stop_callbacks()
#
# The main loop keeps printing a heartbeat the whole time, showing that a
# long-running callback never blocks the program. Hold center 2 s to exit.
import hub, time

_ticker_id = 0


@hub.buttons.on("up")
def ticker():
    global _ticker_id
    _ticker_id += 1
    me = _ticker_id
    n = 0
    while True:
        print("ticker", me, "->", n)
        n += 1
        time.sleep_ms(500)


@hub.buttons.on("left")
def countdown():
    for i in range(3, 0, -1):
        print("countdown", i)
        time.sleep(1)
    print("countdown done")


@hub.buttons.on("down")
def stop_all():
    n = hub.stop_callbacks()
    print("stopped", n, "callback(s)")


print("up: ticker, left: countdown, down: stop all")
beat = 0
while True:
    print("main heartbeat", beat)
    beat += 1
    time.sleep(2)
