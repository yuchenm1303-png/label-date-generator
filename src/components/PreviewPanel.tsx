import { ChevronLeft, ChevronRight, FolderOpen, ImageIcon, MousePointer2, ScanLine } from "lucide-react";
import type { CSSProperties, MouseEvent } from "react";
import type { FontFamily, TemplateAnalysis, TemplateItem } from "../types";

type Props = {
  templates: TemplateItem[];
  selectedIndex: number;
  previewData: string;
  dateLabel: string;
  xRatio: number;
  yRatio: number;
  fontRatio: number;
  adaptivePosition: boolean;
  analysis: TemplateAnalysis | null;
  fontFamily: FontFamily;
  bold: boolean;
  letterSpacing: number;
  onPrevious: () => void;
  onNext: () => void;
  onPickPosition: (x: number, y: number) => void;
  onChooseTemplates: () => void;
};

const FONT_STACKS: Record<FontFamily, string> = {
  simhei: 'SimHei, "Microsoft YaHei", sans-serif',
  msyh: '"Microsoft YaHei", "PingFang SC", sans-serif',
  simsun: 'SimSun, "Songti SC", serif',
};

export function PreviewPanel({
  templates,
  selectedIndex,
  previewData,
  dateLabel,
  xRatio,
  yRatio,
  fontRatio,
  adaptivePosition,
  analysis,
  fontFamily,
  bold,
  letterSpacing,
  onPrevious,
  onNext,
  onPickPosition,
  onChooseTemplates,
}: Props) {
  const hasTemplates = templates.length > 0;
  const current = templates[selectedIndex];

  const box = adaptivePosition && analysis
    ? analysis.labelBox
    : { left: 0, top: 0, right: 1, bottom: 1 };
  const boxWidth = Math.max(0.001, box.right - box.left);
  const boxHeight = Math.max(0.001, box.bottom - box.top);

  const overlayLeft = (box.left + boxWidth * (xRatio / 100)) * 100;
  const overlayTop = (box.top + boxHeight * (yRatio / 100)) * 100;
  const overlayFontSize = fontRatio * boxHeight;

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!previewData) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fullX = (event.clientX - rect.left) / rect.width;
    const fullY = (event.clientY - rect.top) / rect.height;

    const x = ((fullX - box.left) / boxWidth) * 100;
    const y = ((fullY - box.top) / boxHeight) * 100;
    onPickPosition(Math.min(95, Math.max(0, x)), Math.min(95, Math.max(0, y)));
  };

  const guideStyle: CSSProperties = {
    left: `${box.left * 100}%`,
    top: `${box.top * 100}%`,
    width: `${boxWidth * 100}%`,
    height: `${boxHeight * 100}%`,
  };

  return (
    <section className="preview-panel">
      <header className="preview-header">
        <div>
          <span className="eyebrow">LIVE PREVIEW</span>
          <h2>效果预览</h2>
        </div>
        <div className="preview-nav">
          <button type="button" onClick={onPrevious} disabled={!hasTemplates || templates.length < 2} aria-label="上一张模板">
            <ChevronLeft size={18} />
          </button>
          <span>{hasTemplates ? `${selectedIndex + 1} / ${templates.length}` : "0 / 0"}</span>
          <button type="button" onClick={onNext} disabled={!hasTemplates || templates.length < 2} aria-label="下一张模板">
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      <div className={`preview-canvas ${previewData ? "has-document" : "is-empty"}`}>
        {previewData ? (
          <div className="document-shell">
            <div className="document-sheet" onClick={handleClick} title="点击图片可直接设置日期位置">
              <img src={previewData} alt={current?.name || "模板预览"} />
              {adaptivePosition && analysis ? <span className="adaptive-guide" style={guideStyle} /> : null}
              <span
                className="date-overlay"
                style={{
                  left: `${overlayLeft}%`,
                  top: `${overlayTop}%`,
                  fontSize: `${overlayFontSize}cqh`,
                  fontFamily: FONT_STACKS[fontFamily],
                  fontWeight: bold ? 700 : 400,
                  letterSpacing: `${letterSpacing / 100}em`,
                }}
              >
                {dateLabel}
              </span>
            </div>
          </div>
        ) : (
          <div className="preview-empty">
            <div className="empty-icon"><ImageIcon size={28} /></div>
            <h3>先选一组配料表模板</h3>
            <p>选择包含 32 张无日期模板的文件夹，右侧会立即显示真实效果。</p>
            <button className="preview-empty-action" type="button" onClick={onChooseTemplates}>
              <FolderOpen size={16} />
              选择模板文件夹
            </button>
            <small>PNG · JPG · JPEG · BMP · WEBP</small>
          </div>
        )}
      </div>

      <footer className="preview-footer">
        <div className="preview-file">
          <span>{current?.name || "等待选择模板"}</span>
          {hasTemplates ? (
            <small>
              {adaptivePosition && analysis
                ? `已按标签区域自适应 · 识别置信度 ${Math.round(analysis.confidence * 100)}%`
                : "点击图片任意位置，可直接重新定位日期"}
            </small>
          ) : (
            <small>预览区域会自动适配不同尺寸的配料表</small>
          )}
        </div>
        <div className={`click-hint ${hasTemplates ? "" : "is-muted"}`}>
          {adaptivePosition ? <ScanLine size={14} /> : <MousePointer2 size={14} />}
          {adaptivePosition ? "自适应定位" : "点击定位"}
        </div>
      </footer>
    </section>
  );
}
