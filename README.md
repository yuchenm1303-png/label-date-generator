# 配料表日期生成器

一个给 Windows 使用的桌面小工具：把一批“没有生产日期”的配料表图片作为模板，选择日期后自动写入日期，并按日期创建文件夹保存。

## 两种使用模式

### 1. 手动模式

适合临时生成某一天，或者一次生成未来几天：

1. 选择 32 张无日期模板所在文件夹；
2. 选择输出文件夹；
3. 在右侧预览图上点击“生产日期：”后面的空白位置；
4. 微调 X / Y / 字号；
5. 选择日期；
6. 点击“手动开始生成”。

例如选择 `2026-10-01`，会生成：

```text
日期生成结果/
  10月1日/
    模板1.png
    模板2.png
    ...
```

### 2. 每日自动模式

第一次先在程序里选好模板文件夹、输出位置并校准日期位置，然后在“每日自动生成”区域：

1. 输入运行时间，例如 `06:00`；
2. 点击“安装 / 更新自动任务”。

程序会使用 Windows 任务计划程序，每天到点自动生成当天的 32 张图片。

如果当天图片已经存在，自动模式会跳过已有文件，不会重复覆盖；如果上次只生成了一部分，再次运行时会补齐缺失的图片。

> 自动任务依赖当前 EXE 的位置。安装自动任务后，不要随意移动或删除 EXE；如果移动了，重新打开程序并点击一次“安装 / 更新自动任务”即可。

## 现在能做什么

- 支持 PNG / JPG / JPEG / BMP / WEBP
- 单日生成或日期范围批量生成
- 自动创建 `10月1日`、`10月2日` 等文件夹
- 每个日期文件夹生成全部模板图片
- 原始模板永不修改
- 可预览任意模板
- 可直接点击预览图设置日期起点
- 可微调 X / Y / 字号，并选择粗体
- 自动寻找 Windows 中文字体
- 手动模式默认防止误覆盖
- 自动模式可安全重复运行并补齐缺失文件
- 生成过程带进度条
- 模板路径、输出路径和校准参数会保存到本机
- 支持 Windows 每日定时自动生成

## 项目结构

```text
app.py
label_date_generator/
  auto.py        # 每日自动生成与 Windows 任务计划
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

自动生成今天：

```bash
python app.py --auto-today
```

## 运行测试

```bash
python -m unittest discover -s tests
```

## 打包 Windows EXE

双击：

```text
build_windows.bat
```

或者手动执行：

```bash
pip install -r requirements.txt
pip install pyinstaller
pyinstaller --noconfirm --clean --onefile --windowed --name "配料表日期生成器" app.py
```

生成结果：

```text
dist/配料表日期生成器.exe
```

## GitHub Actions 自动打包

仓库内包含 Windows 自动打包工作流：

- 手动运行 Actions 里的 `Build Windows EXE`
- 或推送 `v*` 标签，例如 `v1.0.0`

构建完成后，可以在该次 workflow 的 Artifacts 中下载 EXE。

## 安全与隐私

仓库只需要保存程序代码。真实的 32 张配料表模板不需要上传 GitHub，程序直接读取电脑本地文件夹即可。

## 正式使用前还需要做的一件事

程序框架和两种模式已经具备，但日期的准确位置、字号和字体效果必须用真实“无日期原图”校准一次。

只要校准成功，之后日常操作就会非常简单：

- 手动：打开程序 → 选日期 → 生成；
- 自动：每天到点自动生成，无需再点程序。
