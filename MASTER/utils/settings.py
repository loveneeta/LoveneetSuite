import json
import os
from pathlib import Path

_MASTER_DIR = Path(__file__).resolve().parents[1]
SETTINGS_FILE = os.path.join(
    str(_MASTER_DIR),
    "settings",
    "app_settings.json"
)

DEFAULT_SETTINGS = {
    "theme": "dark",
    "default_quality": 95,
    "default_export_quality": 95,
    "default_output_folder": "",
    "window_state": "maximized"
}


def load_settings():
    if not os.path.exists(SETTINGS_FILE):
        save_settings(DEFAULT_SETTINGS)
        return DEFAULT_SETTINGS

    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if "default_export_quality" not in data and "default_quality" in data:
                data["default_export_quality"] = data["default_quality"]
            return data
    except Exception:
        return DEFAULT_SETTINGS


def save_settings(settings):
    try:
        os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(
                settings,
                f,
                indent=4
            )
    except Exception:
        pass
