from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from PIL import Image, ImageDraw, ImageFont, ImageTk

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}
DEFAULT_CONFIG = {
    "x_ratio": 0.285,
    "y_ratio": 0.520,
    "font_size_ratio": 0.035,
}


def resource_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def config_path() -> Path:
    return resource_dir() / "config.json"


def load_config() -> dict:
    cfg = DEFAULT_CONFIG.copy()
    try:
        if config_path().exists():
            cfg.update(json.loads(config_path().read_text(encoding="utf-8")))
    except Exception:
        pass
    return cfg


def save_config(cfg: dict) -> None:
    try:
        config_path().write_text(
            json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except OSError:
        pass


def find_chinese_font() -> str | None:
    candidates = [
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyhbd.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\simsun.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]
    return next((p for p in candidates if Path(p).exists()), None)


def get_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    font_path = find_chinese_font()
    if font_path:
        return ImageFont.truetype(font_path, max(8, size))
    return ImageFont.load_default()


def date_text(d: date) -> str:
    return f"{d.year}年{d.month}月{d.day}日"


def folder_name(d: date) -> str:
    return f"{d.month}月{d.day}日"


def parse_date(value: str) -> date:
    return datetime.strptime(value.strip(), "%Y-%m-%d").date()


def render_date(
    src: Path, d: date, x_ratio: float, y_ratio: float, font_ratio: float
) -> Image.Image:
    with Image.open(src) as opened:
        img = opened.convert("RGB")
    draw = ImageDraw.Draw(img)
    font = get_font(round(img.height * font_ratio))
    x = round(img.width * x_ratio)
    y = round(img.height * y_ratio)
    draw.text((x, y), date_text(d), fill=(0, 0, 0), font=font, anchor="lm")
    return img


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("配料表日期生成器")
        self.geometry("1080x720")
        self.minsize(900, 620)
        self.cfg = load_config()
        self.preview_photo = None
        self.templates: list[Path] = []

        self.template_dir = tk.StringVar()
        self.output_dir = tk.StringVar()
        today = date.today()
        self.start_date = tk.StringVar(value=today.isoformat())
        self.end_date = tk.StringVar(value=today.isoformat())
        self.range_mode = tk.BooleanVar(value=False)
        self.x_ratio = tk.DoubleVar(value=float(self.cfg["x_ratio"]) * 100)
        self.y_ratio = tk.DoubleVar(value=float(self.cfg["y_ratio"]) * 100)
        self.font_ratio = tk.DoubleVar(value=float(self.cfg["font_size_ratio"]) * 100)
        self.status = tk.StringVar(value="请选择配料表模板文件夹")
        self._build()

    def _build(self) -> None:
        root = ttk.Frame(self, padding=18)
        root.pack(fill="both", expand=True)
        root.columnconfigure(1, weight=1)
        root.rowconfigure(0, weight=1)

        left = ttk.LabelFrame(root, text="生成设置", padding=16)
        left.grid(row=0, column=0, sticky="nsw", padx=(0, 16))
        right = ttk.LabelFrame(root, text="效果预览", padding=12)
        right.grid(row=0, column=1, sticky="nsew")
        right.columnconfigure(0, weight=1)
        right.rowconfigure(0, weight=1)

        ttk.Label(left, text="模板文件夹").grid(row=0, column=0, sticky="w")
        ttk.Entry(left, textvariable=self.template_dir, width=45).grid(
            row=1, column=0, sticky="ew", pady=(4, 4)
        )
        ttk.Button(left, text="选择…", command=self.choose_templates).grid(
            row=1, column=1, padx=(8, 0)
        )

        ttk.Label(left, text="输出位置").grid(row=2, column=0, sticky="w", pady=(12, 0))
        ttk.Entry(left, textvariable=self.output_dir, width=45).grid(
            row=3, column=0, sticky="ew", pady=(4, 4)
        )
        ttk.Button(left, text="选择…", command=self.choose_output).grid(
            row=3, column=1, padx=(8, 0)
        )

        ttk.Separator(left).grid(row=4, column=0, columnspan=2, sticky="ew", pady=14)
        ttk.Label(left, text="开始日期（YYYY-MM-DD）").grid(row=5, column=0, sticky="w")
        ttk.Entry(left, textvariable=self.start_date).grid(
            row=6, column=0, columnspan=2, sticky="ew", pady=(4, 8)
        )
        ttk.Checkbutton(
            left, text="批量生成日期范围", variable=self.range_mode, command=self.update_preview
        ).grid(row=7, column=0, columnspan=2, sticky="w")
        ttk.Label(left, text="结束日期（批量模式）").grid(row=8, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(left, textvariable=self.end_date).grid(
            row=9, column=0, columnspan=2, sticky="ew", pady=(4, 8)
        )

        ttk.Separator(left).grid(row=10, column=0, columnspan=2, sticky="ew", pady=12)
        ttk.Label(left, text="日期位置 X（图片宽度 %）").grid(row=11, column=0, sticky="w")
        ttk.Scale(
            left, from_=5, to=80, variable=self.x_ratio, command=lambda _v: self.update_preview()
        ).grid(row=12, column=0, sticky="ew")
        ttk.Label(left, textvariable=self.x_ratio).grid(row=12, column=1, padx=(8, 0))

        ttk.Label(left, text="日期位置 Y（图片高度 %）").grid(row=13, column=0, sticky="w", pady=(8, 0))
        ttk.Scale(
            left, from_=10, to=90, variable=self.y_ratio, command=lambda _v: self.update_preview()
        ).grid(row=14, column=0, sticky="ew")
        ttk.Label(left, textvariable=self.y_ratio).grid(row=14, column=1, padx=(8, 0))

        ttk.Label(left, text="日期字号（图片高度 %）").grid(row=15, column=0, sticky="w", pady=(8, 0))
        ttk.Scale(
            left, from_=1.5, to=8, variable=self.font_ratio, command=lambda _v: self.update_preview()
        ).grid(row=16, column=0, sticky="ew")
        ttk.Label(left, textvariable=self.font_ratio).grid(row=16, column=1, padx=(8, 0))

        ttk.Button(left, text="开始生成", command=self.generate).grid(
            row=17, column=0, columnspan=2, sticky="ew", pady=(20, 8), ipady=7
        )
        ttk.Label(left, textvariable=self.status, wraplength=360).grid(
            row=18, column=0, columnspan=2, sticky="w"
        )

        self.preview = ttk.Label(right, text="选择模板后将在这里预览", anchor="center")
        self.preview.grid(row=0, column=0, sticky="nsew")
        self.start_date.trace_add("write", lambda *_: self.update_preview())

    def choose_templates(self) -> None:
        p = filedialog.askdirectory(title="选择配料表模板文件夹")
        if not p:
            return
        self.template_dir.set(p)
        self.templates = sorted(
            x for x in Path(p).iterdir() if x.is_file() and x.suffix.lower() in IMAGE_EXTS
        )
        if not self.output_dir.get():
            self.output_dir.set(str(Path(p).parent / "日期生成结果"))
        self.status.set(f"已找到 {len(self.templates)} 张模板")
        self.update_preview()

    def choose_output(self) -> None:
        p = filedialog.askdirectory(title="选择输出位置")
        if p:
            self.output_dir.set(p)

    def _values(self):
        x = self.x_ratio.get() / 100
        y = self.y_ratio.get() / 100
        f = self.font_ratio.get() / 100
        return x, y, f

    def update_preview(self) -> None:
        if not self.templates:
            return
        try:
            d = parse_date(self.start_date.get())
            x, y, f = self._values()
            img = render_date(self.templates[0], d, x, y, f)
            img.thumbnail((620, 560), Image.Resampling.LANCZOS)
            self.preview_photo = ImageTk.PhotoImage(img)
            self.preview.configure(image=self.preview_photo, text="")
        except Exception:
            pass

    def _dates(self) -> list[date]:
        start = parse_date(self.start_date.get())
        if not self.range_mode.get():
            return [start]
        end = parse_date(self.end_date.get())
        if end < start:
            raise ValueError("结束日期不能早于开始日期")
        days = (end - start).days
        if days > 366:
            raise ValueError("一次最多生成 367 天")
        return [start + timedelta(days=i) for i in range(days + 1)]

    def generate(self) -> None:
        try:
            if not self.templates:
                raise ValueError("请先选择包含配料表图片的模板文件夹")
            out = Path(self.output_dir.get().strip())
            if not str(out):
                raise ValueError("请选择输出位置")
            dates = self._dates()
            x, y, f = self._values()
            save_config({"x_ratio": x, "y_ratio": y, "font_size_ratio": f})
            total = len(dates) * len(self.templates)
            if total > 5000 and not messagebox.askyesno(
                "确认批量生成", f"本次将生成 {total} 张图片，是否继续？"
            ):
                return

            done = 0
            for d in dates:
                target = out / folder_name(d)
                target.mkdir(parents=True, exist_ok=True)
                for src in self.templates:
                    img = render_date(src, d, x, y, f)
                    dst = target / src.name
                    ext = src.suffix.lower()
                    if ext in {".jpg", ".jpeg"}:
                        img.save(dst, quality=95, subsampling=0)
                    elif ext == ".webp":
                        img.save(dst, quality=95)
                    else:
                        img.save(dst)
                    done += 1
                    self.status.set(f"正在生成：{done}/{total}")
                    self.update_idletasks()

            self.status.set(f"完成：已生成 {done} 张图片，共 {len(dates)} 个日期文件夹")
            messagebox.showinfo("生成完成", f"已生成 {done} 张图片。\n输出位置：{out}")
            if sys.platform == "win32":
                os.startfile(out)  # type: ignore[attr-defined]
        except Exception as exc:
            messagebox.showerror("无法生成", str(exc))


if __name__ == "__main__":
    App().mainloop()
