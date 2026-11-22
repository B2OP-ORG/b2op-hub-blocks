# Drive LVGL widgets with the hub buttons.
#
# The buttons work as an LVGL encoder on the default group:
#   up / down       next / previous widget; while editing: increase / decrease
#   center / right  click (checkbox) or enter / leave edit mode (slider)
#   left            leave edit mode
#
# The widgets are built inside a hidden container and shown afterwards.
# LVGL can't focus a hidden widget, so the firmware focuses the first
# visible one as soon as the container is shown.
import lvgl as lv
import time

root = lv.obj(lv.screen_active())
root.set_size(160, 128)
root.add_flag(lv.obj.FLAG.HIDDEN)

group = lv.group_create()

box = lv.checkbox(root)
box.set_pos(10, 10)
box.set_text("Enable")
group.add_obj(box)

slider = lv.slider(root)
slider.set_pos(14, 60)
slider.set_size(120, 8)
slider.set_range(0, 100)
group.add_obj(slider)

label = lv.label(root)
label.set_pos(14, 80)


def update(e):
    state = "on" if box.has_state(lv.STATE.CHECKED) else "off"
    label.set_text("%s  %d" % (state, slider.get_value()))


box.add_event_cb(update, lv.EVENT.VALUE_CHANGED, None)
slider.add_event_cb(update, lv.EVENT.VALUE_CHANGED, None)
update(None)

root.remove_flag(lv.obj.FLAG.HIDDEN)
group.set_default()

while True:
    lv.timer_handler()
    time.sleep_ms(5)
