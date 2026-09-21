from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "build" / "icon.png"
NORMALIZED = ROOT / "build" / "icon-normalized.png"
ICO = ROOT / "build" / "icon.ico"

ALPHA_THRESHOLD = 12
SAFE_MARGIN_RATIO = 0.07
ICO_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)


def normalize_icon(source: Image.Image) -> Image.Image:
    image = source.convert("RGBA")
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
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing icon source: {SOURCE}")

    normalized = normalize_icon(Image.open(SOURCE))
    png = normalized.resize((256, 256), Image.Resampling.LANCZOS)

    NORMALIZED.parent.mkdir(parents=True, exist_ok=True)
    png.save(NORMALIZED, optimize=True)

    ico_master = normalized.resize((256, 256), Image.Resampling.LANCZOS)
    ico_master.save(
        ICO,
        format="ICO",
        sizes=[(size, size) for size in ICO_SIZES],
    )

    print(f"Prepared {NORMALIZED.name} and {ICO.name}")


if __name__ == "__main__":
    main()
