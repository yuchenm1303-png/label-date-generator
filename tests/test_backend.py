import base64
import json
import subprocess
import sys
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

    def test_unicode_windows_style_paths_round_trip_through_backend_protocol(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "邹羽宸" / "OneDrive" / "Desktop"
            templates = root / "自营配料表" / "无日期模板"
            output = root / "自动生成结果"
            templates.mkdir(parents=True)

            filename = "豆可滋 白干 净含量 2斤.png"
            src = templates / filename
            img = Image.new("RGB", (1000, 500), "white")
            draw = ImageDraw.Draw(img)
            draw.rectangle((50, 40, 950, 460), outline="black", width=2)
            img.save(src)

            payload = {
                "action": "generate",
                "templateDir": str(templates),
                "outputDir": str(output),
                "mode": "single",
                "startDate": "2026-09-21",
                "endDate": "2026-09-21",
                "xRatio": 14.3,
                "yRatio": 49.9,
                "fontRatio": 4.0,
                "adaptivePosition": True,
                "fontFamily": "simhei",
                "bold": False,
                "letterSpacing": -7,
            }
            encoded = base64.b64encode(
                json.dumps(payload, ensure_ascii=False).encode("utf-8")
            ).decode("ascii")

            backend = Path(__file__).resolve().parents[1] / "date_backend.py"
            completed = subprocess.run(
                [sys.executable, str(backend)],
                input=encoded.encode("ascii"),
                capture_output=True,
                check=False,
            )

            stderr = completed.stderr.decode("utf-8", errors="replace")
            self.assertEqual(completed.returncode, 0, stderr)
            stdout = completed.stdout.decode("utf-8", errors="strict")
            messages = [json.loads(line) for line in stdout.splitlines() if line.strip()]
            done = next(message for message in messages if message.get("type") == "done")

            self.assertIn("邹羽宸", done["outputDir"])
            self.assertNotIn("\ufffd", done["outputDir"])
            self.assertIn("9月21日", done["openPath"])
            self.assertTrue((output / "9月21日" / filename).exists())

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
            # The date should create dark pixels around the expected label-relative region,
            # while the image edge remains untouched.
            date_region = rendered.crop((180, 232, 390, 270)).convert("L")
            self.assertLess(date_region.getextrema()[0], 200)
            self.assertEqual(rendered.getpixel((10, 10)), (255, 255, 255))


if __name__ == "__main__":
    unittest.main()
