# 配料表日期生成器

一个给 Windows 使用的桌面小工具：把一批“没有生产日期”的配料表图片作为模板，选择日期后自动写入日期，并按日期创建文件夹保存。

## 现在能做什么

- 选择一整个模板文件夹，支持 PNG / JPG / JPEG / BMP / WEBP
- 单日生成，或按起止日期批量生成
- 自动创建 `10月1日`、`10月2日` 等日期文件夹
- 每个日期文件夹生成全部模板图片
- 原始模板永不修改
- 预览任意一张模板
- 可直接在预览图上点击，设置“生产日期”的起点
- 可微调 X / Y / 字号，并选择是否粗体
- 自动寻找 Windows 中文字体，避免中文乱码
- 默认不覆盖已经生成的同名文件
- 生成过程带进度条，长任务不会卡死界面
- 配置保存在用户目录，下次打开会保留校准结果

## 推荐使用流程

1. 把 32 张无日期配料表放到同一个文件夹，例如 `无日期模板`。
2. 运行程序，选择这个模板文件夹。
3. 在右侧预览图中，直接点击“生产日期：”后面的空白位置。
4. 用 X / Y / 字号做最后微调。
5. 选择日期，例如 `2026-10-01`。
6. 点击“开始生成”。
7. 程序会自动创建 `10月1日` 文件夹，并把 32 张带日期图片放进去。

如果选择日期范围，例如 `2026-10-01` 到 `2026-10-05`，会一次生成 5 个日期文件夹。

## 项目结构

```text
app.py
label_date_generator/
  core.py        # 图片渲染、日期命名、批量生成
  settings.py    # 本机配置保存
  ui.py          # Windows 桌面界面
tests/
  test_core.py
build_windows.bat
.github/workflows/build-windows.yml
```

## 本地运行

需要 Python 3.10+：

```bash
pip install -r requirements.txt
python app.py
```

## 运行测试

```bash
python -m unittest discover -s tests
```

## 打包 Windows EXE

最简单的方式是双击：

```text
build_windows.bat
```

或者手动执行：

```bash
pip install -r requirements.txt
pip install pyinstaller
pyinstaller --noconfirm --clean --onefile --windowed --name "配料表日期生成器" app.py
```

生成的 EXE 在：

```text
dist/配料表日期生成器.exe
```

## GitHub Actions 自动打包

仓库内已经包含 Windows 自动打包工作流：

- 手动运行 Actions 里的 `Build Windows EXE`
- 或者推送 `v*` 标签，例如 `v1.0.0`

构建完成后，可以在该次 workflow 的 Artifacts 中下载 EXE。

## 安全与隐私

这个仓库可以只保存程序代码。真实的 32 张配料表模板不需要上传 GitHub，程序运行时直接读取电脑本地文件夹即可。

> 当前日期坐标只是默认值。正式使用前，请至少用一张真实原图在预览里校准一次位置和字号。
