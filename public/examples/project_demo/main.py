"""Project demo — a folder with a main.py shows up as a project.

Copy the whole ``project_demo/`` folder to the SD card (``/sd/project_demo``).
In the Run program menu it gets the project (play) icon:

  CENTER   run this main.py
  RIGHT    open the folder instead

While the program runs, its folder is at ``sys.path[0]``, so modules next
to ``main.py`` (here ``ticker.py``) import normally.
"""

import sys
import ticker

print("sys.path[0] =", sys.path[0])
ticker.run(times=5)
