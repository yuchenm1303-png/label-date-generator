from __future__ import annotations

import os
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

from .core import folder_name, generate_for_dates, list_templates
from .settings import load_settings, log_path

TASK_NAME = "配料表日期生成器-每日自动生成"


def _write_log(message: str) -> None:
    path = log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with path.open("a", encoding="utf-8") as f:
        f.write(f"[{stamp}] {message}\n")


def generate_today() -> tuple[int, Path]:
    saved = load_settings()
    if not saved.template_dir:
        raise RuntimeError("尚未设置模板文件夹，请先打开程序完成一次设置。")
    if not saved.output_dir:
        raise RuntimeError("尚未设置输出位置，请先打开程序完成一次设置。")

    template_dir = Path(saved.template_dir)
    output_dir = Path(saved.output_dir)
    templates = list_templates(template_dir)
    if not templates:
        raise RuntimeError(f"模板文件夹中没有找到图片：{template_dir}")

    today = date.today()
    done, _ = generate_for_dates(
        templates,
        output_dir,
        today,
        today,
        saved.render(),
        overwrite=False,
        skip_existing=True,
    )
    target = output_dir / folder_name(today)
    _write_log(f"自动生成完成：{target}，检查/生成 {done} 张。")
    return done, target


def _task_command() -> str:
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}" --auto-today'

    app_py = Path(__file__).resolve().parent.parent / "app.py"
    return f'"{sys.executable}" "{app_py}" --auto-today'


def install_daily_task(time_text: str = "06:00") -> None:
    if os.name != "nt":
        raise RuntimeError("每日自动任务目前只支持 Windows。")

    try:
        datetime.strptime(time_text, "%H:%M")
    except ValueError as exc:
        raise ValueError("自动运行时间必须是 HH:MM，例如 06:00。") from exc

    cmd = [
        "schtasks",
        "/Create",
        "/SC",
        "DAILY",
        "/TN",
        TASK_NAME,
        "/TR",
        _task_command(),
        "/ST",
        time_text,
        "/RL",
        "LIMITED",
        "/F",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore")
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "未知错误").strip()
        raise RuntimeError(f"创建 Windows 每日任务失败：{message}")


def remove_daily_task() -> None:
    if os.name != "nt":
        raise RuntimeError("每日自动任务目前只支持 Windows。")

    result = subprocess.run(
        ["schtasks", "/Delete", "/TN", TASK_NAME, "/F"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "未找到任务").strip()
        raise RuntimeError(f"取消 Windows 每日任务失败：{message}")
