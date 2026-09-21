from __future__ import annotations

from pathlib import Path

from PIL import Image, UnidentifiedImageError

ROOT = Path(__file__).resolve().parent
SOURCE_CANDIDATES = (
    ROOT / "build" / "icon.png",
    ROOT / "src" / "assets" / "feather-quill.png",
    ROOT / "public" / "feather-quill.png",
)
NORMALIZED = ROOT / "build" / "icon-normalized.png"
ICO = ROOT / "build" / "icon.ico"

ALPHA_THRESHOLD = 12
SAFE_MARGIN_RATIO = 0.07
ICO_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)


def load_source_icon() -> tuple[Image.Image, Path]:
    errors: list[str] = []

    for path in SOURCE_CANDIDATES:
        if not path.exists():
            errors.append(f"{path}: missing")
            continue

        try:
            with Image.open(path) as image:
                image.load()
                return image.convert("RGBA"), path
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            errors.append(f"{path}: {exc}")

    detail = "\n".join(errors)
    raise RuntimeError(
        "No valid app icon source could be loaded. Checked:\n" + detail
    )


def normalize_icon(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value > ALPHA_THRESHOLD else 0)
    bbox = mask.getbbox()
    if not bbox:
        raise RuntimeError("Icon source has no visible pixels.")

    content = image.crop(bbox)
    max_content = max(content.width, content.height)
    side = max(1, round(max_content * (1 + SAFE_MARGIN_RATIO * 2)))

    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    x = (side - content.width) // 2
    y = (side - content.height) // 2
    canvas.alpha_composite(content, (x, y))
    return canvas


def main() -> None:
    source, source_path = load_source_icon()
    normalized = normalize_icon(source)
    png = normalized.resize((256, 256), Image.Resampling.LANCZOS)

    NORMALIZED.parent.mkdir(parents=True, exist_ok=True)
    png.save(NORMALIZED, optimize=True)

    ico_master = normalized.resize((256, 256), Image.Resampling.LANCZOS)
    ico_master.save(
        ICO,
        format="ICO",
        sizes=[(size, size) for size in ICO_SIZES],
    )

    print(
        f"Prepared {NORMALIZED.name} and {ICO.name} "
        f"from {source_path.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    main()
