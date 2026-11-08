"""Audio / video playback example.

The AVI file must be on the SD card (mounted at /sd).
hub.video.play_av plays video on all boards and audio where an I2S audio
amplifier is present (hub.board.HAS_AUDIO == 1); on boards without it the
audio chunks are silently skipped and frame timing falls back to the AVI
header's inter-frame delay.

== Generating the AVI ==

    ffmpeg -i input.mp4 \
        -vf "scale=160:128,fps=10" \
        -vcodec mjpeg -q:v 5 \
        -acodec pcm_s16le -ar 16000 -ac 1 \
        demo.avi

    -q:v 5    JPEG quality (2=best, 31=worst). Trade off file size vs image quality.
    -ar 16000 Audio sample rate. 16000 or 22050 work well at this video size.
    -ac 1     Mono. Use 2 for stereo (doubles audio data).

    Video-only (no audio track, smaller file):

    ffmpeg -i input.mp4 -vf "scale=160:128,fps=10" \\
        -vcodec mjpeg -q:v 5 -an demo.avi

Copy the resulting .avi to the SD card root before running.
"""

import hub, time

VIDEO_FILE = "/sd/demo.avi"

hub.lcd.init()
hub.lcd.on()
hub.lcd.backlight(200)

exit_requested = False

@hub.buttons.on("center")
def on_stop():
    hub.video.stop()
    global exit_requested
    exit_requested = True


hub.video.play_av(VIDEO_FILE, block=False)

while not hub.video.is_finished() and not exit_requested:
    time.sleep_ms(5)
