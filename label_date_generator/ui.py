from __future__ import annotations

import os
import queue
import threading
from datetime import date, datetime
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from PIL import Image, ImageTk

from .auto import install_daily_task, remove_daily_task
from .core import (
    RenderSettings,
    generate_for_dates,
    list_templates,
    prepare_templates_from_dated_folder,
    render_date,
)
from .settings import AppSettings, load_settings, save_settings


def parse_date(value: str) -> date:
    return datetime.strptime(value.strip(), "%Y-%m-%d").date()


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("配料表日期生成器")
        self.geometry("1180x850")
        self.minsize(980, 760)

        saved = load_settings()
        today = date.today()

        self.template_dir = tk.StringVar(value=saved.template_dir)
        self.output_dir = tk.StringVar(value=saved.output_dir)
        self.start_date = tk.StringVar(value=today.isoformat())
        self.end_date = tk.StringVar(value=today.isoformat())
        self.range_mode = tk.BooleanVar(value=False)
        self.overwrite = tk.BooleanVar(value=False)
        self.auto_time = tk.StringVar(value="06:00")

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
        self._restore_templates()
        self.after(100, self._poll_events)

    def _build(self) -> None:
        root = ttk.Frame(self, padding=14)
        root.pack(fill="both", expand=True)
        root.columnconfigure(1, weight=1)
        root.rowconfigure(0, weight=1)

        left = ttk.LabelFrame(root, text="生成设置", padding=12)
        left.grid(row=0, column=0, sticky="nsw", padx=(0, 12))
        left.columnconfigure(0, weight=1)

        right = ttk.LabelFrame(root, text="效果预览（可点击定位日期）", padding=10)
        right.grid(row=0, column=1, sticky="nsew")
        right.columnconfigure(0, weight=1)
        right.rowconfigure(1, weight=1)

        row = 0
        ttk.Label(left, text="无日期模板文件夹").grid(row=row, column=0, sticky="w")
        row += 1
        f = ttk.Frame(left)
        f.grid(row=row, column=0, sticky="ew", pady=(4, 2))
        f.columnconfigure(0, weight=1)
        ttk.Entry(f, textvariable=self.template_dir, width=44).grid(row=0, column=0, sticky="ew")
        ttk.Button(f, text="选择…", command=self.choose_templates).grid(row=0, column=1, padx=(8, 0))
        row += 1

        self.prep_btn = ttk.Button(
            left,
            text="没有无日期模板？从历史成品一键生成…",
            command=self.prepare_blank_templates,
        )
        self.prep_btn.grid(row=row, column=0, sticky="ew", pady=(4, 8))
        row += 1

        ttk.Label(left, text="输出位置").grid(row=row, column=0, sticky="w", pady=(4, 0))
        row += 1
        f = ttk.Frame(left)
        f.grid(row=row, column=0, sticky="ew", pady=(4, 4))
        f.columnconfigure(0, weight=1)
        ttk.Entry(f, textvariable=self.output_dir, width=44).grid(row=0, column=0, sticky="ew")
        ttk.Button(f, text="选择…", command=self.choose_output).grid(row=0, column=1, padx=(8, 0))
        row += 1

        ttk.Separator(left).grid(row=row, column=0, sticky="ew", pady=10)
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
        ttk.Label(left, text="结束日期").grid(row=row, column=0, sticky="w", pady=(4, 0))
        row += 1
        self.end_entry = ttk.Entry(left, textvariable=self.end_date)
        self.end_entry.grid(row=row, column=0, sticky="ew", pady=(4, 4))
        row += 1

        ttk.Separator(left).grid(row=row, column=0, sticky="ew", pady=10)
        row += 1

        for label, var, lo, hi in [
            ("日期起点 X（图片宽度 %）", self.x_ratio, 5, 85),
            ("日期起点 Y（图片高度 %）", self.y_ratio, 10, 90),
            ("日期字号（图片高度 %）", self.font_ratio, 1.5, 8.0),
        ]:
            ttk.Label(left, text=label).grid(row=row, column=0, sticky="w", pady=(2, 0))
            row += 1
            sf = ttk.Frame(left)
            sf.grid(row=row, column=0, sticky="ew")
            sf.columnconfigure(0, weight=1)
            ttk.Scale(sf, from_=lo, to=hi, variable=var).grid(row=0, column=0, sticky="ew")
            ttk.Label(sf, textvariable=var, width=8).grid(row=0, column=1, padx=(8, 0))
            row += 1

        options = ttk.Frame(left)
        options.grid(row=row, column=0, sticky="ew", pady=(4, 0))
        ttk.Checkbutton(options, text="粗体", variable=self.bold, command=self.update_preview).pack(side="left")
        ttk.Button(options, text="恢复推荐参数", command=self.use_recommended_settings).pack(side="right")
        row += 1

        ttk.Checkbutton(left, text="允许覆盖已经生成的同名图片", variable=self.overwrite).grid(
            row=row, column=0, sticky="w", pady=(4, 0)
        )
        row += 1

        self.generate_btn = ttk.Button(left, text="手动开始生成", command=self.generate)
        self.generate_btn.grid(row=row, column=0, sticky="ew", pady=(10, 6), ipady=5)
        row += 1

        self.progress = ttk.Progressbar(left, maximum=100)
        self.progress.grid(row=row, column=0, sticky="ew")
        row += 1

        auto_box = ttk.LabelFrame(left, text="每日自动生成（Windows）", padding=8)
        auto_box.grid(row=row, column=0, sticky="ew", pady=(10, 0))
        auto_box.columnconfigure(1, weight=1)
        ttk.Label(auto_box, text="每天").grid(row=0, column=0, sticky="w")
        ttk.Entry(auto_box, textvariable=self.auto_time, width=8).grid(row=0, column=1, sticky="w", padx=(6, 4))
        ttk.Label(auto_box, text="自动生成当天 32 张").grid(row=0, column=2, sticky="w")
        ttk.Button(auto_box, text="安装 / 更新自动任务", command=self.install_automation).grid(
            row=1, column=0, columnspan=2, sticky="ew", pady=(6, 0)
        )
        ttk.Button(auto_box, text="取消自动任务", command=self.remove_automation).grid(
            row=1, column=2, sticky="ew", padx=(8, 0), pady=(6, 0)
        )
        row += 1

        ttk.Label(left, textvariable=self.status, wraplength=390).grid(row=row, column=0, sticky="w", pady=(8, 0))

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

    def _restore_templates(self) -> None:
        folder = self.template_dir.get().strip()
        if folder:
            self.templates = list_templates(Path(folder))
            if self.templates:
                self.status.set(f"已恢复上次设置：找到 {len(self.templates)} 张模板")
                self.update_preview()

    def _toggle_range(self) -> None:
        self.end_entry.configure(state="normal" if self.range_mode.get() else "disabled")

    def set_today(self) -> None:
        today = date.today().isoformat()
        self.start_date.set(today)
        if not self.range_mode.get():
            self.end_date.set(today)

    def use_recommended_settings(self) -> None:
        self.x_ratio.set(13.2)
        self.y_ratio.set(49.2)
        self.font_ratio.set(4.3)
        self.bold.set(True)
        self.status.set("已恢复根据现有历史成品校准的推荐日期参数")
        self.update_preview()

    def prepare_blank_templates(self) -> None:
        source = filedialog.askdirectory(
            title="选择一个已有日期的历史成品文件夹（例如 10月1日，里面应有 32 张图片）"
        )
        if not source:
            return

        source_dir = Path(source)
        sources = list_templates(source_dir)
        if not sources:
            messagebox.showerror("无法准备模板", "所选文件夹中没有找到配料表图片。")
            return

        if len(sources) != 32:
            proceed = messagebox.askyesno(
                "图片数量不是 32 张",
                f"当前文件夹找到 {len(sources)} 张图片，不是预期的 32 张。\n\n是否仍然继续？",
            )
            if not proceed:
                return

        destination = source_dir.parent / "无日期模板"
        existing = list_templates(destination)
        overwrite = False
        if existing:
            overwrite = messagebox.askyesno(
                "无日期模板已存在",
                f"{destination} 中已经有 {len(existing)} 张图片。\n\n是否覆盖并重新生成？",
            )
            if not overwrite:
                return

        try:
            count = prepare_templates_from_dated_folder(
                source_dir,
                destination,
                overwrite=overwrite,
            )
            self.template_dir.set(str(destination))
            self.templates = list_templates(destination)
            self.preview_index = 0

            if not self.output_dir.get().strip():
                self.output_dir.set(str(source_dir.parent / "自动生成结果"))

            self.use_recommended_settings()
            save_settings(self._app_settings())
            self.status.set(f"模板准备完成：已生成 {count} 张无日期模板，可直接开始测试")
            self.update_preview()
            messagebox.showinfo(
                "模板准备完成",
                f"已从历史成品生成 {count} 张无日期模板。\n\n"
                f"模板文件夹：{destination}\n\n"
                "程序已经自动选中这套模板，现在可以选择日期并点击“手动开始生成”。",
            )
            if os.name == "nt":
                os.startfile(destination)
        except Exception as exc:
            messagebox.showerror("无法准备模板", str(exc))

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

    def _app_settings(self) -> AppSettings:
        render = self._settings()
        return AppSettings(
            template_dir=self.template_dir.get().strip(),
            output_dir=self.output_dir.get().strip(),
            x_ratio=render.x_ratio,
            y_ratio=render.y_ratio,
            font_size_ratio=render.font_size_ratio,
            bold=render.bold,
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
            save_settings(self._app_settings())
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

    def install_automation(self) -> None:
        try:
            if not self.templates:
                raise ValueError("请先选择模板文件夹")
            if not self.output_dir.get().strip():
                raise ValueError("请先选择输出位置")
            save_settings(self._app_settings())
            install_daily_task(self.auto_time.get().strip())
            self.status.set(f"每日自动任务已安装：每天 {self.auto_time.get().strip()} 自动生成当天图片")
            messagebox.showinfo(
                "自动任务已安装",
                "以后 Windows 会在设定时间自动生成当天的配料表。\n"
                "如果当天文件已经存在，会自动跳过已有文件，不会重复覆盖。",
            )
        except Exception as exc:
            messagebox.showerror("无法安装自动任务", str(exc))

    def remove_automation(self) -> None:
        try:
            remove_daily_task()
            self.status.set("每日自动任务已取消")
            messagebox.showinfo("已取消", "Windows 每日自动生成任务已取消。")
        except Exception as exc:
            messagebox.showerror("无法取消自动任务", str(exc))

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
