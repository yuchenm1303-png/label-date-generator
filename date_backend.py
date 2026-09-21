from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}

# Calibrated from the user's existing self-operated label screenshots.
# The rectangle covers only the old date text and leaves both neighboring
# labels ("生产日期:" and "保质期:3天") intact.
DATE_ERASE_BOX = (0.1260, 0.4764, 0.3050, 0.5311)

FONT_FAMILIES = {
    "simhei": {
        "normal": [
            r"C:\Windows\Fonts\simhei.ttf",
            r"C:\Windows\Fonts\msyh.ttc",
        ],
        "bold": [
            r"C:\Windows\Fonts\simhei.ttf",
            r"C:\Windows\Fonts\msyhbd.ttc",
        ],
    },
    "msyh": {
        "normal": [
            r"C:\Windows\Fonts\msyh.ttc",
            r"C:\Windows\Fonts\simhei.ttf",
        ],
        "bold": [
            r"C:\Windows\Fonts\msyhbd.ttc",
            r"C:\Windows\Fonts\simhei.ttf",
        ],
    },
    "simsun": {
        "normal": [
            r"C:\Windows\Fonts\simsun.ttc",
            r"C:\Windows\Fonts\simhei.ttf",
        ],
        "bold": [
            r"C:\Windows\Fonts\simsunb.ttf",
            r"C:\Windows\Fonts\simhei.ttf",
        ],
    },
}

FALLBACK_FONTS = [
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
]


def emit(kind: str, **payload) -> None:
    print(json.dumps({"type": kind, **payload}, ensure_ascii=False), flush=True)


def find_chinese_font(font_family: str = "simhei", bold: bool = False) -> str | None:
    family = FONT_FAMILIES.get(font_family, FONT_FAMILIES["simhei"])
    candidates = family["bold" if bold else "normal"] + FALLBACK_FONTS
    return next((font for font in candidates if Path(font).exists()), None)


def get_font(
    size: int,
    font_family: str = "simhei",
    bold: bool = False,
) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    font_path = find_chinese_font(font_family=font_family, bold=bold)
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


def _dark_count_in_row(gray: Image.Image, y: int, threshold: int = 175) -> int:
    return sum(1 for value in gray.crop((0, y, gray.width, y + 1)).getdata() if value < threshold)


def _dark_count_in_col(gray: Image.Image, x: int, threshold: int = 175) -> int:
    return sum(1 for value in gray.crop((x, 0, x + 1, gray.height)).getdata() if value < threshold)


def detect_label_box(img: Image.Image) -> tuple[int, int, int, int, float]:
    """
    Detect the outer label/document rectangle without OCR.

    The labels in this project have a thin dark outer border. We score rows and
    columns near the four image edges and choose the strongest long horizontal/
    vertical lines. If the border is not reliable, fall back to a padded dark
    content bounding box, then finally to the full image.
    """
    gray = ImageOps.grayscale(img)
    width, height = gray.size
    if width < 40 or height < 40:
        return (0, 0, width, height, 0.0)

    top_limit = max(2, int(height * 0.32))
    bottom_start = min(height - 2, int(height * 0.68))
    left_limit = max(2, int(width * 0.22))
    right_start = min(width - 2, int(width * 0.78))

    top_scores = [(y, _dark_count_in_row(gray, y)) for y in range(0, top_limit)]
    bottom_scores = [(y, _dark_count_in_row(gray, y)) for y in range(bottom_start, height)]
    left_scores = [(x, _dark_count_in_col(gray, x)) for x in range(0, left_limit)]
    right_scores = [(x, _dark_count_in_col(gray, x)) for x in range(right_start, width)]

    top, top_score = max(top_scores, key=lambda item: item[1])
    bottom, bottom_score = max(bottom_scores, key=lambda item: item[1])
    left, left_score = max(left_scores, key=lambda item: item[1])
    right, right_score = max(right_scores, key=lambda item: item[1])

    row_conf = min(top_score, bottom_score) / max(1, width)
    col_conf = min(left_score, right_score) / max(1, height)
    confidence = min(row_conf / 0.55, col_conf / 0.55, 1.0)

    border_valid = (
        top_score >= width * 0.55
        and bottom_score >= width * 0.55
        and left_score >= height * 0.55
        and right_score >= height * 0.55
        and right - left >= width * 0.65
        and bottom - top >= height * 0.55
    )
    if border_valid:
        return (left, top, right + 1, bottom + 1, confidence)

    # Fallback: bounding box of all dark content, expanded slightly.
    dark = gray.point(lambda p: 255 if p < 205 else 0)
    bbox = dark.getbbox()
    if bbox:
        l, t, r, b = bbox
        pad_x = max(2, round(width * 0.015))
        pad_y = max(2, round(height * 0.015))
        l = max(0, l - pad_x)
        t = max(0, t - pad_y)
        r = min(width, r + pad_x)
        b = min(height, b + pad_y)
        if r - l >= width * 0.55 and b - t >= height * 0.45:
            return (l, t, r, b, 0.35)

    return (0, 0, width, height, 0.0)


@lru_cache(maxsize=256)
def detect_label_box_for_path(path_text: str) -> tuple[int, int, int, int, float]:
    with Image.open(path_text) as opened:
        img = opened.convert("RGB")
    return detect_label_box(img)


def analyze_template(src: Path) -> dict:
    with Image.open(src) as opened:
        width, height = opened.size
    left, top, right, bottom, confidence = detect_label_box_for_path(str(src))

    return {
        "path": str(src),
        "width": width,
        "height": height,
        "labelBox": {
            "left": left / width,
            "top": top / height,
            "right": right / width,
            "bottom": bottom / height,
        },
        "confidence": round(confidence, 3),
    }


def draw_text_with_spacing(
    draw: ImageDraw.ImageDraw,
    position: tuple[int, int],
    text: str,
    font,
    fill: tuple[int, int, int],
    spacing_px: float,
) -> None:
    x, y = position
    if abs(spacing_px) < 0.01:
        draw.text((x, y), text, fill=fill, font=font, anchor="lm")
        return

    cursor = float(x)
    for char in text:
        draw.text((round(cursor), y), char, fill=fill, font=font, anchor="lm")
        try:
            advance = float(draw.textlength(char, font=font))
        except Exception:
            bbox = draw.textbbox((0, 0), char, font=font)
            advance = float(bbox[2] - bbox[0])
        cursor += advance + spacing_px


def render_date(
    src: Path,
    value: date,
    x_ratio: float,
    y_ratio: float,
    font_ratio: float,
    *,
    adaptive_position: bool = True,
    font_family: str = "simhei",
    bold: bool = False,
    letter_spacing_ratio: float = 0.0,
) -> Image.Image:
    with Image.open(src) as opened:
        img = opened.convert("RGB")

    if adaptive_position:
        left, top, right, bottom, _confidence = detect_label_box_for_path(str(src))
    else:
        left, top, right, bottom = 0, 0, img.width, img.height

    label_width = max(1, right - left)
    label_height = max(1, bottom - top)

    font_size = max(8, round(label_height * font_ratio))
    font = get_font(font_size, font_family=font_family, bold=bold)
    x = round(left + label_width * x_ratio)
    y = round(top + label_height * y_ratio)
    spacing_px = font_size * letter_spacing_ratio

    draw = ImageDraw.Draw(img)
    draw_text_with_spacing(
        draw,
        (x, y),
        date_text(value),
        font,
        (0, 0, 0),
        spacing_px,
    )
    return img


def remove_existing_date(src: Path) -> Image.Image:
    """Create a reusable blank-date template from a historical dated image."""
    with Image.open(src) as opened:
        img = opened.convert("RGB")

    label_left, label_top, label_right, label_bottom, _confidence = detect_label_box_for_path(str(src))
    label_width = max(1, label_right - label_left)
    label_height = max(1, label_bottom - label_top)
    left, top, right, bottom = DATE_ERASE_BOX
    box = (
        round(label_left + label_width * left),
        round(label_top + label_height * top),
        round(label_left + label_width * right),
        round(label_top + label_height * bottom),
    )

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

    for existing in list_images(destination_dir):
        existing.unlink()

    total = len(sources)
    for index, src in enumerate(sources, start=1):
        blank = remove_existing_date(src)
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
    requested_names = payload.get("templateNames")
    if isinstance(requested_names, list):
        requested = {str(name) for name in requested_names if str(name)}
        templates = [src for src in templates if src.name in requested]

    if not templates:
        raise ValueError("没有可生成的模板，请检查当前/多选范围")

    values = dates_from_request(payload)
    x_ratio = float(payload.get("xRatio", 13.9)) / 100
    y_ratio = float(payload.get("yRatio", 49.9)) / 100
    font_ratio = float(payload.get("fontRatio", 1.8)) / 100
    adaptive_position = bool(payload.get("adaptivePosition", True))
    font_family = str(payload.get("fontFamily", "simhei"))
    bold = bool(payload.get("bold", False))
    letter_spacing_ratio = float(payload.get("letterSpacing", -7.0)) / 100

    total = len(templates) * len(values)
    done = 0
    created = 0
    skipped = 0
    skip_existing = bool(payload.get("skipExisting", False))

    for current_date in values:
        target = output_dir / folder_name(current_date)
        target.mkdir(parents=True, exist_ok=True)
        for src in templates:
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

            img = render_date(
                src,
                current_date,
                x_ratio,
                y_ratio,
                font_ratio,
                adaptive_position=adaptive_position,
                font_family=font_family,
                bold=bold,
                letter_spacing_ratio=letter_spacing_ratio,
            )
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
        elif action == "analyzeTemplate":
            src = Path(payload["path"]).expanduser()
            emit("analysis", **analyze_template(src))
        elif action == "generate":
            generate(payload)
        else:
            raise ValueError(f"未知操作：{action}")
    except Exception as exc:
        emit("error", message=str(exc))
        raise


if __name__ == "__main__":
    main()
