from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

from .core import RenderSettings

APP_DIR_NAME = "LabelDateGenerator"


@dataclass(frozen=True)
class AppSettings:
    template_dir: str = ""
    output_dir: str = ""
    x_ratio: float = 0.132
    y_ratio: float = 0.492
    font_size_ratio: float = 0.043
    bold: bool = True

    def render(self) -> RenderSettings:
        return RenderSettings(
            x_ratio=self.x_ratio,
            y_ratio=self.y_ratio,
            font_size_ratio=self.font_size_ratio,
            bold=self.bold,
        )


def user_config_dir() -> Path:
    if os.name == "nt":
        base = Path(os.environ.get("APPDATA", Path.home()))
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return base / APP_DIR_NAME


def config_path() -> Path:
    return user_config_dir() / "config.json"


def log_path() -> Path:
    return user_config_dir() / "automation.log"


def load_settings() -> AppSettings:
    defaults = asdict(AppSettings())
    try:
        path = config_path()
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                defaults.update({k: data[k] for k in defaults if k in data})
    except Exception:
        pass

    return AppSettings(
        template_dir=str(defaults["template_dir"] or ""),
        output_dir=str(defaults["output_dir"] or ""),
        x_ratio=float(defaults["x_ratio"]),
        y_ratio=float(defaults["y_ratio"]),
        font_size_ratio=float(defaults["font_size_ratio"]),
        bold=bool(defaults["bold"]),
    )


def save_settings(settings: AppSettings) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(asdict(settings), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
