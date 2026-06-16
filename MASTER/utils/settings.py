import json
import os

SETTINGS_FILE = os.path.join(
    "settings",
    "app_settings.json"
)

DEFAULT_SETTINGS = {
    "theme": "dark",
    "default_export_quality": 95,
    "default_output_folder": "",
    "window_state": "maximized"
}


def load_settings():

    if not os.path.exists(SETTINGS_FILE):

        save_settings(DEFAULT_SETTINGS)

        return DEFAULT_SETTINGS

    try:

        with open(SETTINGS_FILE, "r") as f:

            return json.load(f)

    except:

        return DEFAULT_SETTINGS


def save_settings(settings):

    with open(SETTINGS_FILE, "w") as f:

        json.dump(
            settings,
            f,
            indent=4
        )