from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}


@dataclass(frozen=True)
class RenderSettings:
    x_ratio: float = 0.285
    y_ratio: float = 0.520
    font_size_ratio: float = 0.035
    bold: bool = False


def clamp_ratio(value: float, low: float, high: float) -> float:
    return max(low, min(high, float(value)))


def list_templates(folder: Path) -> list[Path]:
    if not folder.exists() or not folder.is_dir():
        return []
    return sorted(
        p for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    )


def date_text(value: date) -> str:
    return f"{value.year}年{value.month}月{value.day}日"


def folder_name(value: date) -> str:
    return f"{value.month}月{value.day}日"


def iter_dates(start: date, end: date | None = None) -> Iterable[date]:
    end = end or start
    if end < start:
        raise ValueError("结束日期不能早于开始日期")
    days = (end - start).days
    if days > 366:
        raise ValueError("一次最多生成 367 天")
    for i in range(days + 1):
        yield start + timedelta(days=i)


def find_chinese_font(bold: bool = False) -> str | None:
    candidates = (
        [
            r"C:\Windows\Fonts\msyhbd.ttc",
            r"C:\Windows\Fonts\simhei.ttf",
            r"C:\Windows\Fonts\simsunb.ttf",
        ]
        if bold
        else [
            r"C:\Windows\Fonts\msyh.ttc",
            r"C:\Windows\Fonts\simhei.ttf",
            r"C:\Windows\Fonts\simsun.ttc",
        ]
    )
    candidates += [
        "/System/Library/Fonts/PingFang.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
        if bold
        else "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]
    return next((p for p in candidates if Path(p).exists()), None)


def get_font(size: int, bold: bool = False):
    font_path = find_chinese_font(bold=bold)
    if font_path:
        return ImageFont.truetype(font_path, max(8, int(size)))
    return ImageFont.load_default()


def render_date(src: Path, value: date, settings: RenderSettings) -> Image.Image:
    with Image.open(src) as opened:
        img = opened.convert("RGB")

    draw = ImageDraw.Draw(img)
    font = get_font(
        round(img.height * clamp_ratio(settings.font_size_ratio, 0.005, 0.20)),
        bold=settings.bold,
    )
    x = round(img.width * clamp_ratio(settings.x_ratio, 0.0, 1.0))
    y = round(img.height * clamp_ratio(settings.y_ratio, 0.0, 1.0))

    draw.text((x, y), date_text(value), fill=(0, 0, 0), font=font, anchor="lm")
    return img


def save_rendered(img: Image.Image, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    ext = dst.suffix.lower()
    if ext in {".jpg", ".jpeg"}:
        img.save(dst, quality=95, subsampling=0)
    elif ext == ".webp":
        img.save(dst, quality=95)
    else:
        img.save(dst)


def generate_for_dates(
    templates: list[Path],
    output_dir: Path,
    start: date,
    end: date | None,
    settings: RenderSettings,
    *,
    overwrite: bool = False,
    skip_existing: bool = False,
    progress=None,
) -> tuple[int, int]:
    dates = list(iter_dates(start, end))
    done = 0
    total = len(dates) * len(templates)

    for d in dates:
        target = output_dir / folder_name(d)
        target.mkdir(parents=True, exist_ok=True)
        for src in templates:
            dst = target / src.name
            if dst.exists():
                if overwrite:
                    pass
                elif skip_existing:
                    done += 1
                    if progress is not None:
                        progress(done, total, d, src)
                    continue
                else:
                    raise FileExistsError(f"输出文件已存在：{dst}")

            img = render_date(src, d, settings)
            save_rendered(img, dst)
            done += 1
            if progress is not None:
                progress(done, total, d, src)

    return done, len(dates)
