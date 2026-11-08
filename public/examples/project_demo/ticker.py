"""Helper module for project_demo — imported from main.py."""

import time


def run(times=5):
    for i in range(times):
        print("tick", i + 1)
        time.sleep_ms(500)
