import tempfile
import unittest
from datetime import date
from pathlib import Path

from PIL import Image

from label_date_generator.core import (
    RenderSettings,
    date_text,
    folder_name,
    generate_for_dates,
    iter_dates,
    list_templates,
)


class CoreTests(unittest.TestCase):
    def test_date_and_folder_text(self):
        d = date(2026, 10, 1)
        self.assertEqual(date_text(d), "2026年10月1日")
        self.assertEqual(folder_name(d), "10月1日")

    def test_iter_dates(self):
        values = list(iter_dates(date(2026, 10, 1), date(2026, 10, 3)))
        self.assertEqual(len(values), 3)
        self.assertEqual(values[-1], date(2026, 10, 3))

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


if __name__ == "__main__":
    unittest.main()
