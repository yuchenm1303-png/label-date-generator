import {
  Check,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  ImageIcon,
  LayoutGrid,
  MousePointer2,
  ScanLine,
  Square,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import type { TemplateAnalysis, TemplateItem } from "../types";

type ViewMode = "single" | "grid";

type Props = {
  templates: TemplateItem[];
  selectedIndex: number;
  selectedTemplateNames: string[];
  viewMode: ViewMode;
  previewData: string;
  xRatio: number;
  yRatio: number;
  adaptivePosition: boolean;
  analysis: TemplateAnalysis | null;
  onPrevious: () => void;
  onNext: () => void;
  onPickPosition: (x: number, y: number) => void;
  onChooseTemplates: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenTemplate: (index: number) => void;
  onToggleTemplate: (name: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onInvertSelection: () => void;
};

export function PreviewPanel({
  templates,
  selectedIndex,
  selectedTemplateNames,
  viewMode,
  previewData,
  xRatio,
  yRatio,
  adaptivePosition,
  analysis,
  onPrevious,
  onNext,
  onPickPosition,
  onChooseTemplates,
  onViewModeChange,
  onOpenTemplate,
  onToggleTemplate,
  onSelectAll,
  onClearSelection,
  onInvertSelection,
}: Props) {
  const hasTemplates = templates.length > 0;
  const current = templates[selectedIndex];
  const selectedSet = useMemo(() => new Set(selectedTemplateNames), [selectedTemplateNames]);
  const [gridPreviews, setGridPreviews] = useState<Record<string, string>>({});
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  useEffect(() => {
    if (viewMode !== "grid" || !templates.length) return;
    let cancelled = false;

    async function load() {
      const missing = templates.filter((item) => !gridPreviews[item.path]);
      if (!missing.length) return;
      const entries = await Promise.all(
        missing.map(async (item) => {
          try {
            return [item.path, await window.dateApp.previewTemplate(item.path)] as const;
          } catch {
            return [item.path, ""] as const;
          }
        }),
      );
      if (!cancelled) {
        setGridPreviews((currentMap) => {
          const next = { ...currentMap };
          for (const [key, value] of entries) next[key] = value;
          return next;
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [viewMode, templates, gridPreviews]);

  useEffect(() => {
    setGridPreviews({});
    setShowSelectedOnly(false);
  }, [templates]);

  const box = adaptivePosition && analysis
    ? analysis.labelBox
    : { left: 0, top: 0, right: 1, bottom: 1 };
  const boxWidth = Math.max(0.001, box.right - box.left);
  const boxHeight = Math.max(0.001, box.bottom - box.top);

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

  const visibleTemplates = showSelectedOnly
    ? templates.filter((item) => selectedSet.has(item.name))
    : templates;

  return (
    <section className="preview-panel">
      <header className="preview-header">
        <div>
          <span className="eyebrow">{viewMode === "grid" ? "BATCH VIEW" : "LIVE PREVIEW"}</span>
          <h2>{viewMode === "grid" ? "模板批量视图" : "效果预览"}</h2>
        </div>

        <div className="preview-toolbar">
          <div className="view-toggle" aria-label="预览视图">
            <button
              type="button"
              className={viewMode === "single" ? "active" : ""}
              onClick={() => onViewModeChange("single")}
            >
              单张
            </button>
            <button
              type="button"
              className={viewMode === "grid" ? "active" : ""}
              onClick={() => onViewModeChange("grid")}
            >
              <LayoutGrid size={13} /> 网格
            </button>
          </div>

          {viewMode === "single" ? (
            <div className="preview-nav">
              <button type="button" onClick={onPrevious} disabled={!hasTemplates || templates.length < 2} aria-label="上一张模板">
                <ChevronLeft size={18} />
              </button>
              <span>{hasTemplates ? `${selectedIndex + 1} / ${templates.length}` : "0 / 0"}</span>
              <button type="button" onClick={onNext} disabled={!hasTemplates || templates.length < 2} aria-label="下一张模板">
                <ChevronRight size={18} />
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {viewMode === "grid" && hasTemplates ? (
        <div className="batch-workspace">
          <div className="batch-actions">
            <div className="batch-count">
              已选 <strong>{selectedTemplateNames.length}</strong> / {templates.length}
            </div>
            <div className="batch-action-buttons">
              <button type="button" onClick={onSelectAll}>全选</button>
              <button type="button" onClick={onInvertSelection}>反选</button>
              <button type="button" onClick={onClearSelection}>清空</button>
              <button
                type="button"
                className={showSelectedOnly ? "active" : ""}
                onClick={() => setShowSelectedOnly((value) => !value)}
              >
                {showSelectedOnly ? "显示全部" : "仅看已选"}
              </button>
            </div>
          </div>

          <div className="template-grid">
            {visibleTemplates.map((item) => {
              const index = templates.findIndex((template) => template.name === item.name);
              const checked = selectedSet.has(item.name);
              return (
                <button
                  type="button"
                  className={`template-card ${checked ? "selected" : ""} ${index === selectedIndex ? "current" : ""}`}
                  key={item.path}
                  onDoubleClick={() => {
                    onOpenTemplate(index);
                    onViewModeChange("single");
                  }}
                  onClick={() => onOpenTemplate(index)}
                  title="单击设为当前预览，双击进入单张视图"
                >
                  <span
                    className={`template-check ${checked ? "checked" : ""}`}
                    role="checkbox"
                    aria-checked={checked}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleTemplate(item.name);
                    }}
                  >
                    {checked ? <Check size={13} /> : <Square size={12} />}
                  </span>
                  <div className="template-thumb">
                    {gridPreviews[item.path] ? <img src={gridPreviews[item.path]} alt={item.name} /> : <ImageIcon size={22} />}
                  </div>
                  <span className="template-name">{item.name}</span>
                  <span className="template-index">{index + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={`preview-canvas ${previewData ? "has-document" : "is-empty"}`}>
          {previewData ? (
            <div className="document-shell">
              <div className="document-sheet" onClick={handleClick} title="点击图片可直接设置日期位置">
                <img src={previewData} alt={current?.name || "模板预览"} />
                {adaptivePosition && analysis ? <span className="adaptive-guide" style={guideStyle} /> : null}
              </div>
            </div>
          ) : (
            <div className="preview-empty">
              <div className="empty-icon brand-empty-icon" aria-hidden="true"><span className="brand-empty-mark" /></div>
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
      )}

      <footer className="preview-footer">
        <div className="preview-file">
          <span>
            {viewMode === "grid"
              ? `批量选择 · ${selectedTemplateNames.length} / ${templates.length}`
              : current?.name || "等待选择模板"}
          </span>
          {hasTemplates ? (
            <small>
              {viewMode === "grid"
                ? "勾选需要导出的模板；单击设为当前，双击进入精细预览"
                : adaptivePosition && analysis
                  ? `真实导出预览 · 标签识别置信度 ${Math.round(analysis.confidence * 100)}%`
                  : "点击图片任意位置，可直接重新定位日期"}
            </small>
          ) : (
            <small>预览区域会自动适配不同尺寸的配料表</small>
          )}
        </div>
        <div className={`click-hint ${hasTemplates ? "" : "is-muted"}`}>
          {viewMode === "grid" ? <LayoutGrid size={14} /> : adaptivePosition ? <ScanLine size={14} /> : <MousePointer2 size={14} />}
          {viewMode === "grid" ? "批量选择" : adaptivePosition ? "自适应定位" : "点击定位"}
        </div>
      </footer>
    </section>
  );
}
