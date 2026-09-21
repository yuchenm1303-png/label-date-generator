import tempfile
import unittest
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw

from date_backend import detect_label_box, render_date


class BackendTests(unittest.TestCase):
    def test_detects_outer_label_border(self):
        img = Image.new("RGB", (1200, 620), "white")
        draw = ImageDraw.Draw(img)
        draw.rectangle((12, 16, 1185, 600), outline="black", width=2)
        draw.rectangle((760, 160, 1120, 500), outline="black", width=2)

        left, top, right, bottom, confidence = detect_label_box(img)

        self.assertLessEqual(abs(left - 12), 2)
        self.assertLessEqual(abs(top - 16), 2)
        self.assertLessEqual(abs(right - 1186), 3)
        self.assertLessEqual(abs(bottom - 601), 3)
        self.assertGreater(confidence, 0.8)

    def test_adaptive_render_uses_label_relative_coordinates(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "sample.png"
            img = Image.new("RGB", (1000, 500), "white")
            draw = ImageDraw.Draw(img)
            draw.rectangle((50, 40, 950, 460), outline="black", width=2)
            img.save(src)

            rendered = render_date(
                src,
                date(2026, 9, 21),
                0.151,
                0.503,
                0.026,
                adaptive_position=True,
                font_family="simhei",
                bold=False,
                letter_spacing_ratio=0.0,
            )

            self.assertEqual(rendered.size, (1000, 500))
            # The date should change pixels inside the label but not near the image edge.
            self.assertNotEqual(rendered.getpixel((190, 250)), (255, 255, 255))
            self.assertEqual(rendered.getpixel((10, 10)), (255, 255, 255))


if __name__ == "__main__":
    unittest.main()
