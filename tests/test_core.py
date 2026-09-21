import tempfile
import unittest
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw

from label_date_generator.core import (
    RenderSettings,
    date_text,
    folder_name,
    generate_for_dates,
    iter_dates,
    list_templates,
    prepare_templates_from_dated_folder,
    remove_existing_date,
)


class CoreTests(unittest.TestCase):
    def test_date_and_folder_text(self):
        d = date(2026, 10, 1)
        self.assertEqual(date_text(d), "2026 年 10 月 01 日")
        self.assertEqual(folder_name(d), "10月1日")

    def test_iter_dates(self):
        values = list(iter_dates(date(2026, 10, 1), date(2026, 10, 3)))
        self.assertEqual(len(values), 3)
        self.assertEqual(values[-1], date(2026, 10, 3))

    def test_remove_existing_date_preserves_neighboring_text(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "dated.png"
            img = Image.new("RGB", (1000, 500), (252, 252, 252))
            draw = ImageDraw.Draw(img)

            # Date ink inside the calibrated erase region.
            draw.rectangle((150, 245, 295, 255), fill="black")
            # "保质期" stand-in just to the right of the erase region.
            draw.rectangle((315, 245, 360, 255), fill="black")
            img.save(src)

            blank = remove_existing_date(src)

            # Date ink is removed.
            self.assertEqual(blank.getpixel((200, 250)), (255, 255, 255))
            # Neighboring text remains untouched.
            self.assertEqual(blank.getpixel((330, 250)), (0, 0, 0))
            # Light background outside dark ink is not replaced by a solid block.
            self.assertEqual(blank.getpixel((200, 240)), (252, 252, 252))

    def test_prepare_templates_from_dated_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "10月1日"
            dest = root / "无日期模板"
            source.mkdir()

            for i in range(3):
                img = Image.new("RGB", (1000, 500), "white")
                ImageDraw.Draw(img).rectangle((150, 245, 280, 255), fill="black")
                img.save(source / f"{i}.png")

            count = prepare_templates_from_dated_folder(source, dest)
            self.assertEqual(count, 3)
            self.assertEqual(len(list_templates(dest)), 3)
            self.assertEqual(Image.open(dest / "0.png").convert("RGB").getpixel((200, 250)), (255, 255, 255))

    def test_generate_single_day(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            templates = root / "templates"
            output = root / "output"
            templates.mkdir()

            src = templates / "sample.png"
            Image.new("RGB", (800, 400), "white").save(src)

            found = list_templates(templates)
            done, days = generate_for_dates(
                found,
                output,
                date(2026, 10, 1),
                date(2026, 10, 1),
                RenderSettings(),
            )
            self.assertEqual(done, 1)
            self.assertEqual(days, 1)
            self.assertTrue((output / "10月1日" / "sample.png").exists())

    def test_automatic_mode_can_skip_existing_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            templates = root / "templates"
            output = root / "output"
            templates.mkdir()

            src = templates / "sample.png"
            Image.new("RGB", (800, 400), "white").save(src)

            settings = RenderSettings()
            templates_found = list_templates(templates)
            generate_for_dates(
                templates_found,
                output,
                date(2026, 10, 1),
                date(2026, 10, 1),
                settings,
            )

            done, days = generate_for_dates(
                templates_found,
                output,
                date(2026, 10, 1),
                date(2026, 10, 1),
                settings,
                skip_existing=True,
            )
            self.assertEqual(done, 1)
            self.assertEqual(days, 1)


if __name__ == "__main__":
    unittest.main()
