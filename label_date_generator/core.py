from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}

# Calibrated from the user's existing self-operated label screenshots.
# Keep a safety gap before the original "保质期:3天" text.
DATE_ERASE_BOX = (0.1305, 0.477, 0.3070, 0.530)


@dataclass(frozen=True)
class RenderSettings:
    x_ratio: float = 0.132
    y_ratio: float = 0.492
    font_size_ratio: float = 0.043
    bold: bool = True


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
    # Match the current manually-produced labels, e.g. "2026 年 10 月 01 日".
    return f"{value.year} 年 {value.month} 月 {value.day:02d} 日"


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
            r"C:\Windows\Fonts\simhei.ttf",
            r"C:\Windows\Fonts\msyhbd.ttc",
            r"C:\Windows\Fonts\simsunb.ttf",
        ]
        if bold
        else [
            r"C:\Windows\Fonts\simhei.ttf",
            r"C:\Windows\Fonts\msyh.ttc",
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


def _erase_date_region(img: Image.Image, box: tuple[int, int, int, int]) -> None:
    """Erase only the tightly calibrated date area using its local background."""
    # The top-left corner of the calibrated box is intentionally inside blank
    # background space, before the date glyphs begin. Reusing that pixel avoids
    # introducing a visibly different white patch on slightly off-white images.
    background = img.getpixel((box[0], box[1]))
    ImageDraw.Draw(img).rectangle(box, fill=background)


def remove_existing_date(src: Path) -> Image.Image:
    """Create a blank-date template from one dated self-operated label image."""
    with Image.open(src) as opened:
        img = opened.convert("RGB")

    width, height = img.size
    left, top, right, bottom = DATE_ERASE_BOX
    box = (
        round(width * left),
        round(height * top),
        round(width * right),
        round(height * bottom),
    )
    _erase_date_region(img, box)
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


def prepare_templates_from_dated_folder(
    source_dir: Path,
    destination_dir: Path,
    *,
    overwrite: bool = False,
    progress=None,
) -> int:
    """Turn a dated result folder into reusable blank-date image templates."""
    sources = list_templates(source_dir)
    if not sources:
        raise ValueError("所选历史成品文件夹中没有找到图片。")

    destination_dir.mkdir(parents=True, exist_ok=True)
    total = len(sources)
    done = 0

    for src in sources:
        dst = destination_dir / src.name
        if dst.exists() and not overwrite:
            raise FileExistsError(f"无日期模板已存在：{dst}")

        img = remove_existing_date(src)
        save_rendered(img, dst)
        done += 1
        if progress is not None:
            progress(done, total, src)

    return done


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
