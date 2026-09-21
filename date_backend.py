from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}

# Calibrated from the user's existing self-operated label screenshots.
# The rectangle covers only the old date text and leaves both neighboring
# labels ("生产日期:" and "保质期:3天") intact.
DATE_ERASE_BOX = (0.1305, 0.477, 0.3070, 0.530)


def emit(kind: str, **payload) -> None:
    print(json.dumps({"type": kind, **payload}, ensure_ascii=False), flush=True)


def find_chinese_font() -> str | None:
    candidates = [
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\msyhbd.ttc",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simsun.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
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
    # Match the historical finished labels: 2026 年 10 月 01 日
    return f"{value.year} 年 {value.month} 月 {value.day:02d} 日"


def folder_name(value: date) -> str:
    return f"{value.month}月{value.day}日"


def list_images(folder: Path) -> list[Path]:
    if not folder.is_dir():
        return []
    return sorted(
        file for file in folder.iterdir()
        if file.is_file() and file.suffix.lower() in IMAGE_EXTS
    )


def product_output_name(src: Path) -> str:
    """Keep the output filename exactly equal to the product/template filename."""
    return src.name


def render_date(src: Path, value: date, x_ratio: float, y_ratio: float, font_ratio: float) -> Image.Image:
    with Image.open(src) as opened:
        img = opened.convert("RGB")
    draw = ImageDraw.Draw(img)
    font = get_font(round(img.height * font_ratio))
    x = round(img.width * x_ratio)
    y = round(img.height * y_ratio)
    draw.text((x, y), date_text(value), fill=(0, 0, 0), font=font, anchor="lm")
    return img


def remove_existing_date(src: Path) -> Image.Image:
    """Create a reusable blank-date template from a historical dated image."""
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

    # Use the image's own nearby background instead of hard-coded white.
    # This prevents a visible white block on slightly off-white source images.
    background = img.getpixel((box[0], box[1]))
    ImageDraw.Draw(img).rectangle(box, fill=background)
    return img


def save_image(img: Image.Image, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    ext = dst.suffix.lower()
    if ext in {".jpg", ".jpeg"}:
        img.save(dst, quality=95, subsampling=0)
    elif ext == ".webp":
        img.save(dst, quality=95)
    else:
        img.save(dst)


def prepare_templates(payload: dict) -> None:
    source_dir = Path(payload["sourceDir"]).expanduser()
    destination_dir = Path(payload["destinationDir"]).expanduser()

    sources = list_images(source_dir)
    if not sources:
        raise ValueError("所选历史成品文件夹中没有找到可用图片")

    destination_dir.mkdir(parents=True, exist_ok=True)

    # Avoid stale templates when regenerating from another historical day.
    for existing in list_images(destination_dir):
        existing.unlink()

    total = len(sources)
    for index, src in enumerate(sources, start=1):
        blank = remove_existing_date(src)
        # Preserve the source filename exactly. Historical files are already
        # named after their product, so every generated template/output keeps
        # the product name and never adds a date or sequence number.
        dst = destination_dir / product_output_name(src)
        save_image(blank, dst)
        emit("prepare-progress", done=index, total=total, file=src.name)

    emit(
        "prepared",
        done=total,
        total=total,
        templateDir=str(destination_dir),
    )


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

    templates = list_images(template_dir)
    if not templates:
        raise ValueError("模板文件夹中没有可用图片")

    values = dates_from_request(payload)
    x_ratio = float(payload.get("xRatio", 15.1)) / 100
    y_ratio = float(payload.get("yRatio", 50.3)) / 100
    font_ratio = float(payload.get("fontRatio", 2.6)) / 100
    total = len(templates) * len(values)
    done = 0
    created = 0
    skipped = 0
    skip_existing = bool(payload.get("skipExisting", False))

    for current_date in values:
        target = output_dir / folder_name(current_date)
        target.mkdir(parents=True, exist_ok=True)
        for src in templates:
            # Critical rule: output filename remains exactly the product/template
            # filename. Do not append dates, counters or other suffixes.
            dst = target / product_output_name(src)

            if skip_existing and dst.exists():
                skipped += 1
                done += 1
                emit(
                    "progress",
                    done=done,
                    total=total,
                    file=src.name,
                    date=current_date.isoformat(),
                    skipped=True,
                )
                continue

            img = render_date(src, current_date, x_ratio, y_ratio, font_ratio)
            save_image(img, dst)
            created += 1
            done += 1
            emit("progress", done=done, total=total, file=src.name, date=current_date.isoformat())

    emit(
        "done",
        done=done,
        total=total,
        created=created,
        skipped=skipped,
        dates=len(values),
        outputDir=str(output_dir),
    )


def main() -> None:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            raise ValueError("没有收到生成参数")
        payload = json.loads(raw)
        action = payload.get("action", "generate")
        if action == "prepareTemplates":
            prepare_templates(payload)
        elif action == "generate":
            generate(payload)
        else:
            raise ValueError(f"未知操作：{action}")
    except Exception as exc:
        emit("error", message=str(exc))
        raise


if __name__ == "__main__":
    main()
