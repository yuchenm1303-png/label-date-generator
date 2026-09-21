from __future__ import annotations

import os
import queue
import threading
from datetime import date, datetime
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from PIL import Image, ImageTk

from .core import RenderSettings, generate_for_dates, list_templates, render_date
from .settings import load_settings, save_settings


def parse_date(value: str) -> date:
    return datetime.strptime(value.strip(), "%Y-%m-%d").date()


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("配料表日期生成器")
        self.geometry("1180x760")
        self.minsize(980, 680)

        saved = load_settings()
        today = date.today()

        self.template_dir = tk.StringVar()
        self.output_dir = tk.StringVar()
        self.start_date = tk.StringVar(value=today.isoformat())
        self.end_date = tk.StringVar(value=today.isoformat())
        self.range_mode = tk.BooleanVar(value=False)
        self.overwrite = tk.BooleanVar(value=False)

        self.x_ratio = tk.DoubleVar(value=saved.x_ratio * 100)
        self.y_ratio = tk.DoubleVar(value=saved.y_ratio * 100)
        self.font_ratio = tk.DoubleVar(value=saved.font_size_ratio * 100)
        self.bold = tk.BooleanVar(value=saved.bold)

        self.status = tk.StringVar(value="请选择 32 张无日期配料表所在的文件夹")
        self.templates: list[Path] = []
        self.preview_index = 0
        self.preview_photo = None
        self.events: queue.Queue = queue.Queue()
        self.worker: threading.Thread | None = None

        self._build()
        self.after(100, self._poll_events)

    def _build(self) -> None:
        root = ttk.Frame(self, padding=16)
        root.pack(fill="both", expand=True)
        root.columnconfigure(1, weight=1)
        root.rowconfigure(0, weight=1)

        left = ttk.LabelFrame(root, text="生成设置", padding=14)
        left.grid(row=0, column=0, sticky="nsw", padx=(0, 14))
        left.columnconfigure(0, weight=1)

        right = ttk.LabelFrame(root, text="效果预览（可点击定位日期）", padding=10)
        right.grid(row=0, column=1, sticky="nsew")
        right.columnconfigure(0, weight=1)
        right.rowconfigure(1, weight=1)

        row = 0
        ttk.Label(left, text="模板文件夹").grid(row=row, column=0, sticky="w")
        row += 1
        f = ttk.Frame(left)
        f.grid(row=row, column=0, sticky="ew", pady=(4, 4))
        f.columnconfigure(0, weight=1)
        ttk.Entry(f, textvariable=self.template_dir, width=44).grid(row=0, column=0, sticky="ew")
        ttk.Button(f, text="选择…", command=self.choose_templates).grid(row=0, column=1, padx=(8, 0))
        row += 1

        ttk.Label(left, text="输出位置").grid(row=row, column=0, sticky="w", pady=(10, 0))
        row += 1
        f = ttk.Frame(left)
        f.grid(row=row, column=0, sticky="ew", pady=(4, 4))
        f.columnconfigure(0, weight=1)
        ttk.Entry(f, textvariable=self.output_dir, width=44).grid(row=0, column=0, sticky="ew")
        ttk.Button(f, text="选择…", command=self.choose_output).grid(row=0, column=1, padx=(8, 0))
        row += 1

        ttk.Separator(left).grid(row=row, column=0, sticky="ew", pady=12)
        row += 1

        ttk.Label(left, text="开始日期（YYYY-MM-DD）").grid(row=row, column=0, sticky="w")
        row += 1
        f = ttk.Frame(left)
        f.grid(row=row, column=0, sticky="ew", pady=(4, 4))
        f.columnconfigure(0, weight=1)
        ttk.Entry(f, textvariable=self.start_date).grid(row=0, column=0, sticky="ew")
        ttk.Button(f, text="今天", command=self.set_today, width=7).grid(row=0, column=1, padx=(8, 0))
        row += 1

        ttk.Checkbutton(left, text="批量生成日期范围", variable=self.range_mode, command=self._toggle_range).grid(
            row=row, column=0, sticky="w", pady=(4, 0)
        )
        row += 1
        ttk.Label(left, text="结束日期").grid(row=row, column=0, sticky="w", pady=(6, 0))
        row += 1
        self.end_entry = ttk.Entry(left, textvariable=self.end_date)
        self.end_entry.grid(row=row, column=0, sticky="ew", pady=(4, 4))
        row += 1

        ttk.Separator(left).grid(row=row, column=0, sticky="ew", pady=12)
        row += 1

        for label, var, lo, hi in [
            ("日期起点 X（图片宽度 %）", self.x_ratio, 5, 85),
            ("日期起点 Y（图片高度 %）", self.y_ratio, 10, 90),
            ("日期字号（图片高度 %）", self.font_ratio, 1.5, 8.0),
        ]:
            ttk.Label(left, text=label).grid(row=row, column=0, sticky="w", pady=(4, 0))
            row += 1
            sf = ttk.Frame(left)
            sf.grid(row=row, column=0, sticky="ew")
            sf.columnconfigure(0, weight=1)
            ttk.Scale(sf, from_=lo, to=hi, variable=var).grid(row=0, column=0, sticky="ew")
            ttk.Label(sf, textvariable=var, width=8).grid(row=0, column=1, padx=(8, 0))
            row += 1

        ttk.Checkbutton(left, text="粗体", variable=self.bold, command=self.update_preview).grid(
            row=row, column=0, sticky="w", pady=(6, 0)
        )
        row += 1
        ttk.Checkbutton(left, text="允许覆盖已经生成的同名图片", variable=self.overwrite).grid(
            row=row, column=0, sticky="w", pady=(4, 0)
        )
        row += 1

        self.generate_btn = ttk.Button(left, text="开始生成", command=self.generate)
        self.generate_btn.grid(row=row, column=0, sticky="ew", pady=(16, 8), ipady=6)
        row += 1

        self.progress = ttk.Progressbar(left, maximum=100)
        self.progress.grid(row=row, column=0, sticky="ew")
        row += 1

        ttk.Label(left, textvariable=self.status, wraplength=370).grid(row=row, column=0, sticky="w", pady=(8, 0))

        top = ttk.Frame(right)
        top.grid(row=0, column=0, sticky="ew", pady=(0, 8))
        top.columnconfigure(1, weight=1)
        ttk.Button(top, text="上一张", command=lambda: self.change_preview(-1)).grid(row=0, column=0)
        self.preview_name = ttk.Label(top, text="尚未选择模板", anchor="center")
        self.preview_name.grid(row=0, column=1, sticky="ew", padx=10)
        ttk.Button(top, text="下一张", command=lambda: self.change_preview(1)).grid(row=0, column=2)

        self.canvas = tk.Canvas(right, background="#f3f3f3", highlightthickness=0)
        self.canvas.grid(row=1, column=0, sticky="nsew")
        self.canvas.bind("<Button-1>", self._preview_clicked)
        self.canvas.bind("<Configure>", lambda _e: self.update_preview())

        self.start_date.trace_add("write", lambda *_: self.update_preview())
        self.x_ratio.trace_add("write", lambda *_: self.update_preview())
        self.y_ratio.trace_add("write", lambda *_: self.update_preview())
        self.font_ratio.trace_add("write", lambda *_: self.update_preview())
        self._toggle_range()

    def _toggle_range(self) -> None:
        self.end_entry.configure(state="normal" if self.range_mode.get() else "disabled")

    def set_today(self) -> None:
        today = date.today().isoformat()
        self.start_date.set(today)
        if not self.range_mode.get():
            self.end_date.set(today)

    def choose_templates(self) -> None:
        folder = filedialog.askdirectory(title="选择无日期配料表模板文件夹")
        if not folder:
            return
        self.template_dir.set(folder)
        self.templates = list_templates(Path(folder))
        self.preview_index = 0
        if not self.output_dir.get():
            self.output_dir.set(str(Path(folder).parent / "日期生成结果"))
        msg = f"已找到 {len(self.templates)} 张模板"
        if len(self.templates) != 32:
            msg += "（预期约 32 张，请确认）"
        self.status.set(msg)
        self.update_preview()

    def choose_output(self) -> None:
        folder = filedialog.askdirectory(title="选择生成结果保存位置")
        if folder:
            self.output_dir.set(folder)

    def change_preview(self, delta: int) -> None:
        if not self.templates:
            return
        self.preview_index = (self.preview_index + delta) % len(self.templates)
        self.update_preview()

    def _settings(self) -> RenderSettings:
        return RenderSettings(
            x_ratio=self.x_ratio.get() / 100,
            y_ratio=self.y_ratio.get() / 100,
            font_size_ratio=self.font_ratio.get() / 100,
            bold=self.bold.get(),
        )

    def update_preview(self) -> None:
        if not self.templates:
            self.canvas.delete("all")
            self.canvas.create_text(
                max(20, self.canvas.winfo_width() // 2),
                max(20, self.canvas.winfo_height() // 2),
                text="选择模板后将在这里预览\n点击图片可直接设置日期起点",
                justify="center",
            )
            return
        try:
            d = parse_date(self.start_date.get())
            img = render_date(self.templates[self.preview_index], d, self._settings())
            canvas_w = max(100, self.canvas.winfo_width())
            canvas_h = max(100, self.canvas.winfo_height())
            img.thumbnail((max(50, canvas_w - 20), max(50, canvas_h - 20)))
            self.preview_photo = ImageTk.PhotoImage(img)
            self.canvas.delete("all")
            self.canvas.create_image(
                canvas_w // 2,
                canvas_h // 2,
                image=self.preview_photo,
                anchor="center",
                tags="preview",
            )
            self.preview_name.configure(
                text=f"{self.preview_index + 1}/{len(self.templates)}  {self.templates[self.preview_index].name}"
            )
        except Exception:
            pass

    def _preview_clicked(self, event) -> None:
        if not self.templates or not self.preview_photo:
            return
        bbox = self.canvas.bbox("preview")
        if not bbox:
            return
        left, top, right, bottom = bbox
        if not (left <= event.x <= right and top <= event.y <= bottom):
            return
        self.x_ratio.set(round((event.x - left) / max(1, right - left) * 100, 2))
        self.y_ratio.set(round((event.y - top) / max(1, bottom - top) * 100, 2))
        self.status.set("已按点击位置更新日期起点，可继续微调 X / Y / 字号")

    def _validated_job(self):
        if not self.templates:
            raise ValueError("请先选择包含配料表图片的模板文件夹")
        out_text = self.output_dir.get().strip()
        if not out_text:
            raise ValueError("请选择输出位置")

        start = parse_date(self.start_date.get())
        end = parse_date(self.end_date.get()) if self.range_mode.get() else start
        if end < start:
            raise ValueError("结束日期不能早于开始日期")
        days = (end - start).days + 1
        if days > 367:
            raise ValueError("一次最多生成 367 天")
        return Path(out_text), start, end, days * len(self.templates)

    def generate(self) -> None:
        if self.worker and self.worker.is_alive():
            return
        try:
            out, start, end, total = self._validated_job()
            if total > 5000 and not messagebox.askyesno("确认批量生成", f"本次将生成 {total} 张图片，是否继续？"):
                return

            settings = self._settings()
            save_settings(settings)
            overwrite = self.overwrite.get()

            self.progress["value"] = 0
            self.generate_btn.configure(state="disabled")
            self.status.set(f"准备生成，共 {total} 张图片…")

            self.worker = threading.Thread(
                target=self._run_generation,
                args=(out, start, end, settings, overwrite),
                daemon=True,
            )
            self.worker.start()
        except Exception as exc:
            messagebox.showerror("无法生成", str(exc))

    def _run_generation(self, out: Path, start: date, end: date, settings: RenderSettings, overwrite: bool) -> None:
        def progress(done, total, d, src):
            self.events.put(("progress", done, total, d.isoformat(), src.name))

        try:
            done, day_count = generate_for_dates(
                self.templates.copy(),
                out,
                start,
                end,
                settings,
                overwrite=overwrite,
                progress=progress,
            )
            self.events.put(("done", done, day_count, str(out)))
        except Exception as exc:
            self.events.put(("error", str(exc)))

    def _poll_events(self) -> None:
        try:
            while True:
                event = self.events.get_nowait()
                kind = event[0]
                if kind == "progress":
                    _, done, total, d, name = event
                    self.progress["value"] = done * 100 / max(1, total)
                    self.status.set(f"正在生成 {done}/{total}：{d} · {name}")
                elif kind == "done":
                    _, done, day_count, out = event
                    self.generate_btn.configure(state="normal")
                    self.progress["value"] = 100
                    self.status.set(f"完成：{done} 张图片，{day_count} 个日期文件夹")
                    messagebox.showinfo("生成完成", f"已生成 {done} 张图片。\n输出位置：{out}")
                    if os.name == "nt":
                        os.startfile(out)
                elif kind == "error":
                    _, message = event
                    self.generate_btn.configure(state="normal")
                    self.status.set("生成失败")
                    messagebox.showerror("无法生成", message)
        except queue.Empty:
            pass
        self.after(100, self._poll_events)


def run_app() -> None:
    App().mainloop()
