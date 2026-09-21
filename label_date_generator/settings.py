from __future__ import annotations

import json
import os
from dataclasses import asdict
from pathlib import Path

from .core import RenderSettings

APP_DIR_NAME = "LabelDateGenerator"


def user_config_dir() -> Path:
    if os.name == "nt":
        base = Path(os.environ.get("APPDATA", Path.home()))
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return base / APP_DIR_NAME


def config_path() -> Path:
    return user_config_dir() / "config.json"


def load_settings() -> RenderSettings:
    defaults = asdict(RenderSettings())
    try:
        path = config_path()
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                defaults.update({k: data[k] for k in defaults if k in data})
    except Exception:
        pass

    return RenderSettings(
        x_ratio=float(defaults["x_ratio"]),
        y_ratio=float(defaults["y_ratio"]),
        font_size_ratio=float(defaults["font_size_ratio"]),
        bold=bool(defaults["bold"]),
    )


def save_settings(settings: RenderSettings) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(asdict(settings), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
