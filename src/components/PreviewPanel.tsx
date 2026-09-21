import { ChevronLeft, ChevronRight, ImageIcon, MousePointer2 } from "lucide-react";
import type { MouseEvent } from "react";
import type { TemplateItem } from "../types";

type Props = {
  templates: TemplateItem[];
  selectedIndex: number;
  previewData: string;
  dateLabel: string;
  xRatio: number;
  yRatio: number;
  fontRatio: number;
  onPrevious: () => void;
  onNext: () => void;
  onPickPosition: (x: number, y: number) => void;
};

export function PreviewPanel({
  templates,
  selectedIndex,
  previewData,
  dateLabel,
  xRatio,
  yRatio,
  fontRatio,
  onPrevious,
  onNext,
  onPickPosition,
}: Props) {
  const hasTemplates = templates.length > 0;
  const current = templates[selectedIndex];

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!previewData) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    onPickPosition(Math.min(95, Math.max(0, x)), Math.min(95, Math.max(0, y)));
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
            <ChevronLeft size={17} />
          </button>
          <span>{hasTemplates ? `${selectedIndex + 1} / ${templates.length}` : "0 / 0"}</span>
          <button type="button" onClick={onNext} disabled={!hasTemplates || templates.length < 2} aria-label="下一张模板">
            <ChevronRight size={17} />
          </button>
        </div>
      </header>

      <div className="preview-canvas">
        {previewData ? (
          <div className="document-shell">
            <div className="document-sheet" onClick={handleClick} title="点击图片可直接设置日期位置">
              <img src={previewData} alt={current?.name || "模板预览"} />
              <span
                className="date-overlay"
                style={{ left: `${xRatio}%`, top: `${yRatio}%`, fontSize: `${fontRatio * 5}px` }}
              >
                {dateLabel}
              </span>
            </div>
          </div>
        ) : (
          <div className="preview-empty">
            <div className="empty-icon"><ImageIcon size={25} /></div>
            <h3>选择模板文件夹后即可预览</h3>
            <p>支持 PNG、JPG、JPEG、BMP 与 WEBP 图片。</p>
          </div>
        )}
      </div>

      <footer className="preview-footer">
        <div className="preview-file">
          <span>{current?.name || "暂无模板"}</span>
          {hasTemplates ? <small>点击图片即可重新定位日期</small> : <small>预览会自动适配窗口大小</small>}
        </div>
        <div className="click-hint"><MousePointer2 size={14} /> 点击定位</div>
      </footer>
    </section>
  );
}
