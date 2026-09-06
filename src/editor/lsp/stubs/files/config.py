import json

SETTINGS_PATH = "/settings.json"
DEFAULT_ROOT = "/sd"
FULL_FS_ROOT = "/"


class Config:
    def __init__(self):
        self.allow_full_fs = False
        self.usb_msc = False
        self.load()

    def load(self):
        try:
            with open(SETTINGS_PATH) as f:
                data = json.load(f)
            self.allow_full_fs = bool(data.get("allow_full_fs", False))
            self.usb_msc = bool(data.get("usb_msc", False))
        except (OSError, ValueError):
            pass

    def save(self):
        try:
            with open(SETTINGS_PATH, "w") as f:
                json.dump({"allow_full_fs": self.allow_full_fs, "usb_msc": self.usb_msc}, f)
        except OSError as e:
            print("settings save failed:", e)

    def root(self):
        return FULL_FS_ROOT if self.allow_full_fs else DEFAULT_ROOT
