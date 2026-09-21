# 配料表日期生成器

用于批量给配料表图片添加生产日期的 Windows 桌面工具。V2 前端已经升级为 **Electron + React + TypeScript + Vite**，图片生成核心继续使用 Python + Pillow。

## V2 界面

- 现代化 Electron 桌面界面，不再受 Tkinter 原生控件样式限制
- 左侧集中完成模板、输出、日期和位置设置，右侧实时预览
- 支持单日和日期范围两种模式
- 一次处理整个模板文件夹（例如 32 张模板）
- 可前后切换查看全部模板
- 可直接点击预览图片定位日期，也可精确调整 X / Y / 字号
- 生成过程显示实时进度，完成后可直接打开输出文件夹
- 参数保存在本机，模板图片不会上传
- 原始模板永不覆盖

## 本地开发运行（推荐测试方式）

需要 Node.js 20+ 与 Python 3.10+。

```bash
pip install -r requirements.txt
npm install
npm run dev
```

开发模式会直接打开桌面窗口。修改 React / CSS 后可以快速刷新，不需要每次重新打包 EXE。

## 正式构建

```bash
npm run build
npm run start
```

## Windows 安装包

```bash
npm run package:win
```

当前安装包仍调用本机 Python 运行图片生成核心；开发和内部测试阶段建议先使用 `npm run dev`。后续正式交付时可以再把 Python runtime 一起打进安装包，实现完全免安装 Python。

## 旧版 Tkinter

旧版 `app.py` 暂时保留作为兼容/回退入口：

```bash
python app.py
```

## 图片生成规则

- 支持 PNG / JPG / JPEG / BMP / WEBP
- 日期格式：`2026年9月21日`
- 输出文件夹格式：`9月21日`
- 日期位置按图片宽高百分比保存，因此同版式不同分辨率也能保持相对位置
- JPG / WEBP 默认以高质量参数输出
