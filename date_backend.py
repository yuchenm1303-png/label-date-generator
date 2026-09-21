from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}


def emit(kind: str, **payload) -> None:
    print(json.dumps({"type": kind, **payload}, ensure_ascii=False), flush=True)


def find_chinese_font() -> str | None:
    candidates = [
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyhbd.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\simsun.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]
    return next((font for font in candidates if Path(font).exists()), None)


def get_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    font_path = find_chinese_font()
    if font_path:
        return ImageFont.truetype(font_path, max(8, size))
    return ImageFont.load_default()


def parse_date(value: str) -> date:
    return datetime.strptime(value.strip(), "%Y-%m-%d").date()


def date_text(value: date) -> str:
    return f"{value.year}年{value.month}月{value.day}日"


def folder_name(value: date) -> str:
    return f"{value.month}月{value.day}日"


def render_date(src: Path, value: date, x_ratio: float, y_ratio: float, font_ratio: float) -> Image.Image:
    with Image.open(src) as opened:
        img = opened.convert("RGB")
    draw = ImageDraw.Draw(img)
    font = get_font(round(img.height * font_ratio))
    x = round(img.width * x_ratio)
    y = round(img.height * y_ratio)
    draw.text((x, y), date_text(value), fill=(0, 0, 0), font=font, anchor="lm")
    return img


def dates_from_request(payload: dict) -> list[date]:
    start = parse_date(payload["startDate"])
    if payload.get("mode") != "range":
        return [start]
    end = parse_date(payload["endDate"])
    if end < start:
        raise ValueError("结束日期不能早于开始日期")
    days = (end - start).days
    if days > 366:
        raise ValueError("一次最多生成 367 天")
    return [start + timedelta(days=offset) for offset in range(days + 1)]


def generate(payload: dict) -> None:
    template_dir = Path(payload["templateDir"]).expanduser()
    output_dir = Path(payload["outputDir"]).expanduser()
    if not template_dir.is_dir():
        raise ValueError("模板文件夹不存在")
    if not str(output_dir):
        raise ValueError("请选择输出位置")

    templates = sorted(
        file for file in template_dir.iterdir()
        if file.is_file() and file.suffix.lower() in IMAGE_EXTS
    )
    if not templates:
        raise ValueError("模板文件夹中没有可用图片")

    values = dates_from_request(payload)
    x_ratio = float(payload.get("xRatio", 28.5)) / 100
    y_ratio = float(payload.get("yRatio", 52.0)) / 100
    font_ratio = float(payload.get("fontRatio", 3.5)) / 100
    total = len(templates) * len(values)
    done = 0

    for current_date in values:
        target = output_dir / folder_name(current_date)
        target.mkdir(parents=True, exist_ok=True)
        for src in templates:
            img = render_date(src, current_date, x_ratio, y_ratio, font_ratio)
            dst = target / src.name
            ext = src.suffix.lower()
            if ext in {".jpg", ".jpeg"}:
                img.save(dst, quality=95, subsampling=0)
            elif ext == ".webp":
                img.save(dst, quality=95)
            else:
                img.save(dst)
            done += 1
            emit("progress", done=done, total=total, file=src.name, date=current_date.isoformat())

    emit("done", done=done, total=total, dates=len(values), outputDir=str(output_dir))


def main() -> None:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            raise ValueError("没有收到生成参数")
        payload = json.loads(raw)
        generate(payload)
    except Exception as exc:
        emit("error", message=str(exc))
        raise


if __name__ == "__main__":
    main()
