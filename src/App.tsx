import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  Clock3,
  ExternalLink,
  History,
  Layers3,
  Play,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { FilePickerCard } from "./components/FilePickerCard";
import { PreviewPanel } from "./components/PreviewPanel";
import { RangeControl } from "./components/RangeControl";
import type {
  AutomationConfig,
  GenerationHistoryItem,
  GenerationProgress,
  GenerationResult,
  TemplateItem,
} from "./types";

const DEFAULTS = { xRatio: 15.1, yRatio: 50.3, fontRatio: 2.6 };
const LEGACY_PRESETS = [
  { xRatio: 28.5, yRatio: 52, fontRatio: 3.5 },
  { xRatio: 13.2, yRatio: 49.2, fontRatio: 4.3 },
  { xRatio: 15, yRatio: 50, fontRatio: 4.1 },
];

function localDateValue(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysValue(value: string, days: number) {
  const current = new Date(`${value}T00:00:00`);
  current.setDate(current.getDate() + days);
  return localDateValue(current);
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
  const [settingsReady, setSettingsReady] = useState(false);
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [automationTime, setAutomationTime] = useState("06:00");
  const [automationHorizon, setAutomationHorizon] = useState(1);
  const [automationBusy, setAutomationBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function restoreSettings() {
      const stored = window.localStorage.getItem("date-generator:settings");
      if (!stored) {
        if (!cancelled) setSettingsReady(true);
        return;
      }

      try {
        const parsed = JSON.parse(stored);
        const isLegacyPreset = LEGACY_PRESETS.some((preset) =>
          parsed.xRatio === preset.xRatio &&
          parsed.yRatio === preset.yRatio &&
          parsed.fontRatio === preset.fontRatio
        );

        if (!isLegacyPreset) {
          if (Number.isFinite(parsed.xRatio)) setXRatio(parsed.xRatio);
          if (Number.isFinite(parsed.yRatio)) setYRatio(parsed.yRatio);
          if (Number.isFinite(parsed.fontRatio)) setFontRatio(parsed.fontRatio);
        }

        if (parsed.mode === "single" || parsed.mode === "range") setMode(parsed.mode);
        if (typeof parsed.outputDir === "string") setOutputDir(parsed.outputDir);

        if (typeof parsed.templateDir === "string" && parsed.templateDir && window.dateApp) {
          const restored = await window.dateApp.scanTemplates(parsed.templateDir);
          if (!cancelled && restored?.templates?.length) {
            setTemplateDir(restored.dir);
            setTemplates(restored.templates);
            setSelectedIndex(0);
          }
        }
      } catch {
        // Keep safe defaults when an older local value is malformed.
      } finally {
        if (!cancelled) setSettingsReady(true);
      }
    }

    void restoreSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    window.localStorage.setItem(
      "date-generator:settings",
      JSON.stringify({ xRatio, yRatio, fontRatio, templateDir, outputDir, mode }),
    );
  }, [settingsReady, xRatio, yRatio, fontRatio, templateDir, outputDir, mode]);

  useEffect(() => {
    if (!window.dateApp) {
      setError("桌面桥接没有加载成功。请关闭当前窗口并重新运行 npm run dev；如果仍然出现，请查看启动终端里的 preload failed 信息。");
      return;
    }

    void window.dateApp.listHistory().then(setHistory).catch(() => undefined);
    void window.dateApp.getAutomation()
      .then((config) => {
        setAutomationEnabled(Boolean(config.enabled));
        if (config.time) setAutomationTime(config.time);
        if (Number.isFinite(config.horizonDays)) setAutomationHorizon(config.horizonDays);
      })
      .catch(() => undefined);

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
  const tomorrow = addDaysValue(today, 1);
  const afterTomorrow = addDaysValue(today, 2);
  const nextWeekEnd = addDaysValue(today, 6);
  const quickDateSelection =
    mode === "single" && startDate === today ? "today" :
    mode === "single" && startDate === tomorrow ? "tomorrow" :
    mode === "single" && startDate === afterTomorrow ? "after-tomorrow" :
    mode === "range" && startDate === today && endDate === nextWeekEnd ? "week" :
    "custom";
  const canGenerate = templates.length > 0 && Boolean(outputDir) && dateCount > 0 && !generating && !preparing;
  const completion = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const summary = useMemo(() => {
    if (!templates.length) return "先选择模板文件夹";
    const countLabel = templates.length === 32 ? "32 个模板已就绪" : `已识别 ${templates.length} 个模板（常规应为 32）`;
    if (!outputDir) return `${countLabel} · 请选择输出位置`;
    if (mode === "range") return `${countLabel} × ${dateCount} 天 · 将生成 ${totalImages} 张图片`;
    return `${countLabel} · ${prettyDate(startDate)} · 将生成 ${templates.length} 张图片`;
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

  function useQuickDate(offset: number) {
    const value = addDaysValue(today, offset);
    setMode("single");
    setStartDate(value);
    setEndDate(value);
  }

  function useNextSevenDays() {
    setMode("range");
    setStartDate(today);
    setEndDate(addDaysValue(today, 6));
  }

  async function refreshHistory() {
    if (!window.dateApp) return;
    try {
      setHistory(await window.dateApp.listHistory());
    } catch {
      // History is a convenience feature; generation itself should keep working.
    }
  }

  async function enableAutomation() {
    if (!window.dateApp) return;
    if (!templates.length || !templateDir) {
      setError("请先准备或选择无日期模板。");
      return;
    }
    if (!outputDir) {
      setError("请先选择输出位置。");
      return;
    }

    setAutomationBusy(true);
    setError("");
    try {
      const config: AutomationConfig = {
        enabled: true,
        time: automationTime,
        horizonDays: automationHorizon,
        templateDir,
        outputDir,
        xRatio,
        yRatio,
        fontRatio,
      };
      const saved = await window.dateApp.installAutomation(config);
      setAutomationEnabled(Boolean(saved.enabled));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAutomationBusy(false);
    }
  }

  async function disableAutomation() {
    if (!window.dateApp) return;
    setAutomationBusy(true);
    setError("");
    try {
      await window.dateApp.removeAutomation();
      setAutomationEnabled(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAutomationBusy(false);
    }
  }

  async function clearHistory() {
    if (!window.dateApp) return;
    await window.dateApp.clearHistory();
    setHistory([]);
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
      await refreshHistory();
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
              <div className={`segmented-control ${mode === "range" ? "is-range" : "is-single"}`} aria-label="日期模式">
                <span className="segmented-thumb" aria-hidden="true" />
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
            </div>
            <div className={`quick-date-row quick-date-${quickDateSelection}`}>
              <span className="quick-date-thumb" aria-hidden="true" />
              <button className={`quick-date-button ${quickDateSelection === "today" ? "active" : ""}`} aria-pressed={quickDateSelection === "today"} type="button" onClick={() => useQuickDate(0)}>今天</button>
              <button className={`quick-date-button ${quickDateSelection === "tomorrow" ? "active" : ""}`} aria-pressed={quickDateSelection === "tomorrow"} type="button" onClick={() => useQuickDate(1)}>明天</button>
              <button className={`quick-date-button ${quickDateSelection === "after-tomorrow" ? "active" : ""}`} aria-pressed={quickDateSelection === "after-tomorrow"} type="button" onClick={() => useQuickDate(2)}>后天</button>
              <button className={`quick-date-button ${quickDateSelection === "week" ? "active" : ""}`} aria-pressed={quickDateSelection === "week"} type="button" onClick={useNextSevenDays}>未来 7 天</button>
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

          <div className="settings-card automation-card">
            <div className="card-title-row">
              <div className="card-title"><Clock3 size={17} /><span>自动化中心</span></div>
              <span className={automationEnabled ? "automation-status enabled" : "automation-status"}>
                {automationEnabled ? "已开启" : "未开启"}
              </span>
            </div>
            <div className="automation-grid">
              <label className="automation-time">
                <span>每天运行时间</span>
                <input type="time" value={automationTime} onChange={(event) => setAutomationTime(event.target.value)} />
              </label>
              <div className="automation-range">
                <span>每天准备</span>
                <div className={`automation-segment horizon-${automationHorizon}`}>
                  <span className="automation-thumb" aria-hidden="true" />
                  {[1, 2, 7].map((days) => (
                    <button
                      key={days}
                      type="button"
                      className={automationHorizon === days ? "active" : ""}
                      aria-pressed={automationHorizon === days}
                      onClick={() => setAutomationHorizon(days)}
                    >
                      {days === 1 ? "当天" : days === 2 ? "今明两天" : "未来7天"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="automation-actions">
              <button
                className="automation-primary"
                type="button"
                disabled={automationBusy || !templates.length || !outputDir}
                onClick={() => void enableAutomation()}
              >
                <ShieldCheck size={14} />
                {automationBusy ? "处理中…" : automationEnabled ? "更新自动任务" : "开启每日自动生成"}
              </button>
              {automationEnabled ? (
                <button className="automation-secondary" type="button" disabled={automationBusy} onClick={() => void disableAutomation()}>
                  关闭
                </button>
              ) : null}
            </div>
            <div className="automation-note">
              到点自动生成；电脑当时未开机时，下次登录会自动补跑。已存在的图片会跳过，只补缺失文件。
            </div>
          </div>

          <div className="settings-card history-card">
            <div className="card-title-row">
              <div className="card-title"><History size={17} /><span>最近生成</span></div>
              {history.length ? (
                <button className="ghost-button" type="button" onClick={() => void clearHistory()}><Trash2 size={13} /> 清空记录</button>
              ) : null}
            </div>
            {history.length ? (
              <div className="history-list">
                {history.slice(0, 5).map((item) => (
                  <div className="history-row" key={item.id}>
                    <div className={item.complete ? "history-dot complete" : "history-dot"} />
                    <div className="history-copy">
                      <strong>{prettyDate(item.date)}</strong>
                      <span>{item.source === "auto" ? "自动" : "手动"} · {item.actual}/{item.expected} 张</span>
                    </div>
                    <span className={item.complete ? "history-badge complete" : "history-badge"}>
                      {item.complete ? "完整" : "需检查"}
                    </span>
                    <button className="history-open" type="button" onClick={() => void window.dateApp.openFolder(item.folder)}>
                      <ExternalLink size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-history">还没有生成记录。完成一次生成后，这里会显示日期与 32/32 完整性。</div>
            )}
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
          onChooseTemplates={() => void chooseTemplates()}
        />
      </main>

      <footer className="action-bar">
        <div className="action-status">
          {result ? (
            <>
              <div className="success-icon"><Check size={16} /></div>
              <div>
                <strong>生成完成</strong>
                <span>
                  {typeof result.created === "number" ? `新生成 ${result.created} 张` : `已处理 ${result.done} 张`}
                  {result.skipped ? ` · 跳过 ${result.skipped} 张` : ""}
                  { ` · 共 ${result.dates} 个日期文件夹` }
                </span>
              </div>
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
