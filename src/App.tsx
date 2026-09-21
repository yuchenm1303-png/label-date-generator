import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ExternalLink,
  Layers3,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { FilePickerCard } from "./components/FilePickerCard";
import { PreviewPanel } from "./components/PreviewPanel";
import { RangeControl } from "./components/RangeControl";
import type { GenerationProgress, GenerationResult, TemplateItem } from "./types";

const DEFAULTS = { xRatio: 13.2, yRatio: 49.2, fontRatio: 4.3 };
const LEGACY_DEFAULTS = { xRatio: 28.5, yRatio: 52, fontRatio: 3.5 };

function localDateValue(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function prettyDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return `${year} 年 ${month} 月 ${String(day).padStart(2, "0")} 日`;
}

function inclusiveDays(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const diff = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000);
  return Number.isFinite(diff) && diff >= 0 ? diff + 1 : 0;
}

export default function App() {
  const today = localDateValue();
  const [templateDir, setTemplateDir] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [previewData, setPreviewData] = useState("");
  const [mode, setMode] = useState<"single" | "range">("single");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [xRatio, setXRatio] = useState(DEFAULTS.xRatio);
  const [yRatio, setYRatio] = useState(DEFAULTS.yRatio);
  const [fontRatio, setFontRatio] = useState(DEFAULTS.fontRatio);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem("date-generator:settings");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      const isLegacyDefault =
        parsed.xRatio === LEGACY_DEFAULTS.xRatio &&
        parsed.yRatio === LEGACY_DEFAULTS.yRatio &&
        parsed.fontRatio === LEGACY_DEFAULTS.fontRatio;
      if (isLegacyDefault) {
        setXRatio(DEFAULTS.xRatio);
        setYRatio(DEFAULTS.yRatio);
        setFontRatio(DEFAULTS.fontRatio);
      } else {
        if (Number.isFinite(parsed.xRatio)) setXRatio(parsed.xRatio);
        if (Number.isFinite(parsed.yRatio)) setYRatio(parsed.yRatio);
        if (Number.isFinite(parsed.fontRatio)) setFontRatio(parsed.fontRatio);
      }
    } catch {
      // Keep defaults when an older local value is malformed.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("date-generator:settings", JSON.stringify({ xRatio, yRatio, fontRatio }));
  }, [xRatio, yRatio, fontRatio]);

  useEffect(() => {
    if (!window.dateApp) {
      setError("桌面桥接没有加载成功。请关闭当前窗口并重新运行 npm run dev；如果仍然出现，请查看启动终端里的 preload failed 信息。");
      return;
    }
    return window.dateApp.onGenerationProgress(setProgress);
  }, []);

  useEffect(() => {
    const current = templates[selectedIndex];
    if (!current) {
      setPreviewData("");
      return;
    }
    let cancelled = false;
    window.dateApp.previewTemplate(current.path)
      .then((data) => {
        if (!cancelled) setPreviewData(data);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [templates, selectedIndex]);

  const dateCount = mode === "range" ? inclusiveDays(startDate, endDate) : 1;
  const totalImages = templates.length * dateCount;
  const canGenerate = templates.length > 0 && Boolean(outputDir) && dateCount > 0 && !generating && !preparing;
  const completion = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const summary = useMemo(() => {
    if (!templates.length) return "先选择模板文件夹";
    if (!outputDir) return `已识别 ${templates.length} 个模板 · 请选择输出位置`;
    if (mode === "range") return `${templates.length} 个模板 × ${dateCount} 天 · 将生成 ${totalImages} 张图片`;
    return `${templates.length} 个模板 · ${prettyDate(startDate)} · 将生成 ${templates.length} 张图片`;
  }, [templates.length, outputDir, mode, dateCount, totalImages, startDate]);

  async function chooseTemplates() {
    setError("");
    if (!window.dateApp) {
      setError("桌面桥接没有加载成功，请重新启动应用。");
      return;
    }
    const selection = await window.dateApp.chooseTemplates();
    if (!selection) return;
    setTemplateDir(selection.dir);
    setTemplates(selection.templates);
    setSelectedIndex(0);
    setResult(null);
    if (!outputDir) setOutputDir(selection.suggestedOutput);
    if (selection.templates.length === 0) setError("这个文件夹里没有找到可用的图片模板。");
  }

  async function prepareTemplates() {
    if (preparing) return;
    setPreparing(true);
    setError("");
    setResult(null);
    try {
      const selection = await window.dateApp.prepareTemplates();
      if (!selection) return;
      setTemplateDir(selection.dir);
      setTemplates(selection.templates);
      setSelectedIndex(0);
      setOutputDir(selection.suggestedOutput);
      setXRatio(DEFAULTS.xRatio);
      setYRatio(DEFAULTS.yRatio);
      setFontRatio(DEFAULTS.fontRatio);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPreparing(false);
    }
  }

  async function chooseOutput() {
    setError("");
    if (!window.dateApp) {
      setError("桌面桥接没有加载成功，请重新启动应用。");
      return;
    }
    const next = await window.dateApp.chooseOutput();
    if (next) {
      setOutputDir(next);
      setResult(null);
    }
  }

  function resetPosition() {
    setXRatio(DEFAULTS.xRatio);
    setYRatio(DEFAULTS.yRatio);
    setFontRatio(DEFAULTS.fontRatio);
  }

  async function generate() {
    if (!canGenerate) return;
    setGenerating(true);
    setProgress(null);
    setResult(null);
    setError("");
    try {
      const finalResult = await window.dateApp.runGeneration({
        templateDir,
        outputDir,
        mode,
        startDate,
        endDate,
        xRatio,
        yRatio,
        fontRatio,
      });
      setResult(finalResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="window-drag-region" />
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={18} /></div>
          <div>
            <h1>配料表日期生成器</h1>
            <p>批量生成 · 精准预览 · 原图不覆盖</p>
          </div>
        </div>
        <div className="header-badge"><span /> 本地处理</div>
      </header>

      <main className="workspace">
        <section className="settings-column">
          <div className="section-heading">
            <div>
              <span className="eyebrow">WORKFLOW</span>
              <h2>生成设置</h2>
            </div>
            <span className="step-badge">模板一次准备 · 日常 3 步</span>
          </div>

          <div className="settings-card file-card">
            <div className="card-title"><Layers3 size={17} /><span>模板与输出</span></div>
            <FilePickerCard
              title="模板文件夹"
              description="选择32张无日期模板；生成后的文件名保持产品名不变"
              path={templateDir}
              actionLabel={templateDir ? "更换" : "选择"}
              meta={templates.length ? `${templates.length} 张` : undefined}
              ready={templates.length > 0}
              onChoose={() => void chooseTemplates()}
            />
            <button
              className="secondary-button prepare-template-button"
              type="button"
              disabled={preparing || generating}
              onClick={() => void prepareTemplates()}
            >
              {preparing ? "正在生成无日期模板…" : "没有无日期模板？从历史成品一键生成"}
            </button>
            <div className="row-divider" />
            <FilePickerCard
              title="输出位置"
              description="每个日期会自动创建独立文件夹"
              path={outputDir}
              actionLabel={outputDir ? "更换" : "选择"}
              ready={Boolean(outputDir)}
              onChoose={() => void chooseOutput()}
            />
          </div>

          <div className="settings-card">
            <div className="card-title-row">
              <div className="card-title"><CalendarDays size={17} /><span>生成日期</span></div>
              <div className="segmented-control" aria-label="日期模式">
                <button className={mode === "single" ? "active" : ""} type="button" onClick={() => setMode("single")}>单日</button>
                <button className={mode === "range" ? "active" : ""} type="button" onClick={() => setMode("range")}>日期范围</button>
              </div>
            </div>
            <div className={`date-grid ${mode === "range" ? "two-columns" : ""}`}>
              <label className="date-field">
                <span>{mode === "range" ? "开始日期" : "日期"}</span>
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              {mode === "range" ? (
                <label className="date-field">
                  <span>结束日期</span>
                  <input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                </label>
              ) : null}
              <button className="today-button" type="button" onClick={() => { setStartDate(today); setEndDate(today); }}>
                今天
              </button>
            </div>
            {mode === "range" ? <div className="date-note">将连续生成 {dateCount || 0} 天，每天包含全部 {templates.length || 0} 个模板。</div> : null}
          </div>

          <div className="settings-card controls-card">
            <div className="card-title-row">
              <div className="card-title"><SlidersHorizontal size={17} /><span>日期位置</span></div>
              <button className="ghost-button" type="button" onClick={resetPosition}><RotateCcw size={13} /> 重置</button>
            </div>
            <RangeControl label="水平位置" hint="图片宽度" value={xRatio} min={0} max={90} step={0.5} onChange={setXRatio} />
            <RangeControl label="垂直位置" hint="图片高度" value={yRatio} min={0} max={95} step={0.5} onChange={setYRatio} />
            <RangeControl label="日期字号" hint="相对图片高度" value={fontRatio} min={1.5} max={8} step={0.1} onChange={setFontRatio} />
            <div className="position-tip">也可以直接点击右侧预览图上的目标位置，自动设置 X / Y。</div>
          </div>
        </section>

        <PreviewPanel
          templates={templates}
          selectedIndex={selectedIndex}
          previewData={previewData}
          dateLabel={prettyDate(startDate)}
          xRatio={xRatio}
          yRatio={yRatio}
          fontRatio={fontRatio}
          onPrevious={() => setSelectedIndex((index) => (index - 1 + templates.length) % templates.length)}
          onNext={() => setSelectedIndex((index) => (index + 1) % templates.length)}
          onPickPosition={(x, y) => { setXRatio(Number(x.toFixed(1))); setYRatio(Number(y.toFixed(1))); }}
        />
      </main>

      <footer className="action-bar">
        <div className="action-status">
          {result ? (
            <>
              <div className="success-icon"><Check size={16} /></div>
              <div><strong>生成完成</strong><span>已生成 {result.done} 张图片，共 {result.dates} 个日期文件夹</span></div>
            </>
          ) : generating ? (
            <>
              <div className="progress-ring" style={{ "--progress": `${completion * 3.6}deg` } as React.CSSProperties} />
              <div><strong>正在生成 {progress?.done ?? 0} / {progress?.total ?? totalImages}</strong><span>{progress?.file || "正在准备图片…"}</span></div>
            </>
          ) : (
            <div><strong>{summary}</strong><span>所有处理都在本机完成，不会上传模板图片。</span></div>
          )}
        </div>

        <div className="action-buttons">
          {result ? (
            <button className="open-button" type="button" onClick={() => void window.dateApp.openFolder(result.outputDir)}>
              <ExternalLink size={16} /> 打开文件夹
            </button>
          ) : null}
          <button className="primary-button" type="button" disabled={!canGenerate} onClick={() => void generate()}>
            <Play size={16} fill="currentColor" />
            {generating ? "正在生成…" : mode === "range" ? "开始批量生成" : "生成今日配料表"}
          </button>
        </div>
      </footer>

      {error ? (
        <div className="toast-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>×</button>
        </div>
      ) : null}
    </div>
  );
}
