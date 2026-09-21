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
  Save,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Type,
} from "lucide-react";
import featherQuillIcon from "./assets/feather-quill.png";
import { FilePickerCard } from "./components/FilePickerCard";
import { PreviewPanel } from "./components/PreviewPanel";
import { MediaIcon } from "./components/MediaIcon";
import { RangeControl } from "./components/RangeControl";
import type {
  AutomationConfig,
  FontFamily,
  GenerationHistoryItem,
  GenerationProgress,
  GenerationResult,
  ParameterPreset,
  TemplateAnalysis,
  TemplateItem,
} from "./types";

const DEFAULTS = {
  xRatio: 14.3,
  yRatio: 49.9,
  fontRatio: 4.0,
  adaptivePosition: true,
  fontFamily: "simhei" as FontFamily,
  bold: false,
  letterSpacing: -7,
};

const LEGACY_PRESETS = [
  { xRatio: 28.5, yRatio: 52, fontRatio: 3.5 },
  { xRatio: 13.2, yRatio: 49.2, fontRatio: 4.3 },
  { xRatio: 15, yRatio: 50, fontRatio: 4.1 },
  { xRatio: 15.1, yRatio: 50.3, fontRatio: 2.6 },
  { xRatio: 13.9, yRatio: 49.9, fontRatio: 1.8 },
];

const BUILTIN_PRESETS: ParameterPreset[] = [
  {
    id: "builtin-self-operated",
    name: "自营标准",
    xRatio: DEFAULTS.xRatio,
    yRatio: DEFAULTS.yRatio,
    fontRatio: DEFAULTS.fontRatio,
    adaptivePosition: DEFAULTS.adaptivePosition,
    fontFamily: DEFAULTS.fontFamily,
    bold: DEFAULTS.bold,
    letterSpacing: DEFAULTS.letterSpacing,
    builtIn: true,
  },
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

function isFontFamily(value: unknown): value is FontFamily {
  return value === "simhei" || value === "msyh" || value === "simsun";
}

export default function App() {
  const today = localDateValue();
  const [templateDir, setTemplateDir] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedTemplateNames, setSelectedTemplateNames] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"single" | "grid">("single");
  const [previewData, setPreviewData] = useState("");
  const [analysis, setAnalysis] = useState<TemplateAnalysis | null>(null);
  const [mode, setMode] = useState<"single" | "range">("single");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [xRatio, setXRatio] = useState(DEFAULTS.xRatio);
  const [yRatio, setYRatio] = useState(DEFAULTS.yRatio);
  const [fontRatio, setFontRatio] = useState(DEFAULTS.fontRatio);
  const [adaptivePosition, setAdaptivePosition] = useState(DEFAULTS.adaptivePosition);
  const [fontFamily, setFontFamily] = useState<FontFamily>(DEFAULTS.fontFamily);
  const [bold, setBold] = useState(DEFAULTS.bold);
  const [letterSpacing, setLetterSpacing] = useState(DEFAULTS.letterSpacing);
  const [presets, setPresets] = useState<ParameterPreset[]>(BUILTIN_PRESETS);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingScope, setGeneratingScope] = useState<"current" | "selected" | "all">("all");
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
      const storedPresets = window.localStorage.getItem("date-generator:presets");

      if (storedPresets) {
        try {
          const parsedPresets = JSON.parse(storedPresets);
          if (Array.isArray(parsedPresets) && !cancelled) {
            const customPresets = parsedPresets.filter(
              (preset) => preset?.id !== "builtin-self-operated" && preset?.name !== "自营标准",
            );
            setPresets([...BUILTIN_PRESETS, ...customPresets].slice(0, 12));
          }
        } catch {
          // Ignore malformed old preset data.
        }
      }

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

        if (!isLegacyPreset) {
          if (typeof parsed.adaptivePosition === "boolean") setAdaptivePosition(parsed.adaptivePosition);
          if (isFontFamily(parsed.fontFamily)) setFontFamily(parsed.fontFamily);
          if (typeof parsed.bold === "boolean") setBold(parsed.bold);
          if (Number.isFinite(parsed.letterSpacing)) setLetterSpacing(parsed.letterSpacing);
        }
        if (parsed.mode === "single" || parsed.mode === "range") setMode(parsed.mode);
        if (parsed.viewMode === "single" || parsed.viewMode === "grid") setViewMode(parsed.viewMode);

        let restoredTemplates = null;
        if (typeof parsed.templateDir === "string" && parsed.templateDir && window.dateApp) {
          restoredTemplates = await window.dateApp.scanTemplates(parsed.templateDir);
          if (!cancelled && restoredTemplates?.templates?.length) {
            setTemplateDir(restoredTemplates.dir);
            setTemplates(restoredTemplates.templates);
            setSelectedTemplateNames(restoredTemplates.templates.map((item) => item.name));
            setSelectedIndex(0);
          }
        }

        if (typeof parsed.outputDir === "string" && parsed.outputDir && window.dateApp) {
          const outputValid = await window.dateApp.validateDirectory(parsed.outputDir);
          if (!cancelled && outputValid) {
            setOutputDir(parsed.outputDir);
          } else if (!cancelled && restoredTemplates?.suggestedOutput) {
            // Old versions could persist mojibake paths when the Windows user
            // name contained Chinese characters. Never reuse a broken path.
            setOutputDir(restoredTemplates.suggestedOutput);
          }
        } else if (!cancelled && restoredTemplates?.suggestedOutput) {
          setOutputDir(restoredTemplates.suggestedOutput);
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
      JSON.stringify({
        xRatio,
        yRatio,
        fontRatio,
        adaptivePosition,
        fontFamily,
        bold,
        letterSpacing,
        templateDir,
        outputDir,
        mode,
        viewMode,
      }),
    );
  }, [
    settingsReady,
    xRatio,
    yRatio,
    fontRatio,
    adaptivePosition,
    fontFamily,
    bold,
    letterSpacing,
    templateDir,
    outputDir,
    mode,
    viewMode,
  ]);

  useEffect(() => {
    if (!settingsReady) return;
    window.localStorage.setItem("date-generator:presets", JSON.stringify(presets));
  }, [settingsReady, presets]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 8000);
    return () => window.clearTimeout(timer);
  }, [error]);

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
      setAnalysis(null);
      return;
    }

    let cancelled = false;
    setAnalysis(null);

    const timer = window.setTimeout(() => {
      window.dateApp.renderPreview({
        path: current.path,
        date: startDate,
        xRatio,
        yRatio,
        fontRatio,
        adaptivePosition,
        fontFamily,
        bold,
        letterSpacing,
      })
        .then((data) => {
          if (!cancelled) setPreviewData(data);
        })
        .catch((cause) => {
          if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
        });

      if (adaptivePosition) {
        window.dateApp.analyzeTemplate(current.path)
          .then((nextAnalysis) => {
            if (!cancelled) setAnalysis(nextAnalysis);
          })
          .catch((cause) => {
            if (!cancelled) {
              setAnalysis(null);
              setError(`自适应定位分析失败，将按整张图片定位：${cause instanceof Error ? cause.message : String(cause)}`);
            }
          });
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    templates,
    selectedIndex,
    startDate,
    xRatio,
    yRatio,
    fontRatio,
    adaptivePosition,
    fontFamily,
    bold,
    letterSpacing,
  ]);

  const dateCount = mode === "range" ? inclusiveDays(startDate, endDate) : 1;
  const selectedCount = selectedTemplateNames.length;
  const totalImages = templates.length * dateCount;
  const activeTemplateCount =
    generatingScope === "current" ? (templates[selectedIndex] ? 1 : 0) :
    generatingScope === "selected" ? selectedCount :
    templates.length;
  const activeTotalImages = activeTemplateCount * dateCount;
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
    const selectedLabel = selectedCount && selectedCount !== templates.length ? ` · 已选 ${selectedCount} 张` : "";
    if (mode === "range") return `${countLabel}${selectedLabel} · ${dateCount} 天范围`;
    return `${countLabel}${selectedLabel} · ${prettyDate(startDate)}`;
  }, [templates.length, outputDir, mode, dateCount, startDate, selectedCount]);

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
    setSelectedTemplateNames(selection.templates.map((item) => item.name));
    setSelectedIndex(0);
    setAnalysis(null);
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
      setSelectedTemplateNames(selection.templates.map((item) => item.name));
      setSelectedIndex(0);
      setAnalysis(null);
      setOutputDir(selection.suggestedOutput);
      resetParameters();
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

  function resetParameters() {
    setXRatio(DEFAULTS.xRatio);
    setYRatio(DEFAULTS.yRatio);
    setFontRatio(DEFAULTS.fontRatio);
    setAdaptivePosition(DEFAULTS.adaptivePosition);
    setFontFamily(DEFAULTS.fontFamily);
    setBold(DEFAULTS.bold);
    setLetterSpacing(DEFAULTS.letterSpacing);
    setSelectedPresetId("");
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

  function applyPreset(id: string) {
    setSelectedPresetId(id);
    const preset = presets.find((item) => item.id === id);
    if (!preset) {
      setPresetName("");
      return;
    }
    setPresetName(preset.name);
    setXRatio(preset.xRatio);
    setYRatio(preset.yRatio);
    setFontRatio(preset.fontRatio);
    setAdaptivePosition(preset.adaptivePosition);
    setFontFamily(preset.fontFamily);
    setBold(preset.bold);
    setLetterSpacing(preset.letterSpacing);
  }

  function savePreset() {
    const name = presetName.trim();
    if (!name) {
      setError("请先输入参数方案名称，例如“自营标准”。");
      return;
    }

    if (name === "自营标准") {
      setError("“自营标准”是程序内置方案，会随默认参数自动更新，请使用其他名称保存自定义方案。");
      return;
    }

    const preset: ParameterPreset = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      xRatio,
      yRatio,
      fontRatio,
      adaptivePosition,
      fontFamily,
      bold,
      letterSpacing,
    };

    setPresets((items) => [preset, ...items.filter((item) => item.name !== preset.name)].slice(0, 12));
    setSelectedPresetId(preset.id);
    setError("");
  }

  function deletePreset() {
    if (!selectedPresetId) return;
    const selected = presets.find((item) => item.id === selectedPresetId);
    if (selected?.builtIn) {
      setError("“自营标准”是程序内置方案，不能删除。");
      return;
    }
    setPresets((items) => items.filter((item) => item.id !== selectedPresetId));
    setSelectedPresetId("");
    setPresetName("");
  }

  function toggleTemplate(name: string) {
    setSelectedTemplateNames((items) =>
      items.includes(name) ? items.filter((item) => item !== name) : [...items, name],
    );
  }

  function selectAllTemplates() {
    setSelectedTemplateNames(templates.map((item) => item.name));
  }

  function clearTemplateSelection() {
    setSelectedTemplateNames([]);
  }

  function invertTemplateSelection() {
    const selected = new Set(selectedTemplateNames);
    setSelectedTemplateNames(templates.filter((item) => !selected.has(item.name)).map((item) => item.name));
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
        adaptivePosition,
        fontFamily,
        bold,
        letterSpacing,
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

  async function openFolder(folderPath: string) {
    if (!window.dateApp || !folderPath) return;
    setError("");
    try {
      await window.dateApp.openFolder(folderPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function generate(scope: "current" | "selected" | "all") {
    if (!canGenerate) return;

    let templateNames: string[] | undefined;
    if (scope === "current") {
      const current = templates[selectedIndex];
      if (!current) return;
      templateNames = [current.name];
    } else if (scope === "selected") {
      if (!selectedTemplateNames.length) {
        setError("请先在网格视图中勾选至少一张模板。");
        return;
      }
      templateNames = selectedTemplateNames;
    }

    setGeneratingScope(scope);
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
        adaptivePosition,
        fontFamily,
        bold,
        letterSpacing,
        templateNames,
        exportScope: scope,
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
          <MediaIcon src={featherQuillIcon} size={56} className="brand-mark" />
          <div>
            <h1>配料表日期生成器</h1>
            <p>批量生成 · 自适应定位 · 原图不覆盖</p>
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
              <div className="card-title"><SlidersHorizontal size={17} /><span>定位与字体</span></div>
              <button className="ghost-button" type="button" onClick={resetParameters}><RotateCcw size={13} /> 重置</button>
            </div>

            <div className="adaptive-row">
              <div className="adaptive-copy">
                <div className="adaptive-icon"><ScanLine size={15} /></div>
                <div>
                  <strong>自适应每张模板</strong>
                  <span>识别标签外框，按标签区域计算坐标与字号</span>
                </div>
              </div>
              <button
                className={`switch-button ${adaptivePosition ? "on" : ""}`}
                type="button"
                role="switch"
                aria-checked={adaptivePosition}
                onClick={() => setAdaptivePosition((value) => !value)}
              >
                <span />
              </button>
            </div>

            <RangeControl label="水平位置" hint={adaptivePosition ? "标签宽度" : "图片宽度"} value={xRatio} min={0} max={90} step={0.1} onChange={setXRatio} />
            <RangeControl label="垂直位置" hint={adaptivePosition ? "标签高度" : "图片高度"} value={yRatio} min={0} max={95} step={0.1} onChange={setYRatio} />
            <RangeControl label="日期字号" hint={adaptivePosition ? "相对标签高度" : "相对图片高度"} value={fontRatio} min={1.2} max={6} step={0.1} onChange={setFontRatio} />

            <div className="font-divider" />
            <div className="font-heading"><Type size={14} /><span>字体样式</span></div>
            <div className="font-grid">
              <label className="font-select-field">
                <span>字体</span>
                <select value={fontFamily} onChange={(event) => setFontFamily(event.target.value as FontFamily)}>
                  <option value="simhei">黑体</option>
                  <option value="msyh">微软雅黑</option>
                  <option value="simsun">宋体</option>
                </select>
              </label>
              <label className="bold-toggle">
                <span>字重</span>
                <button className={bold ? "active" : ""} type="button" onClick={() => setBold((value) => !value)}>
                  {bold ? "粗体" : "常规"}
                </button>
              </label>
            </div>
            <RangeControl label="字间距" hint="相对字号" value={letterSpacing} min={-10} max={40} step={1} onChange={setLetterSpacing} />

            <div className="preset-row">
              <select value={selectedPresetId} onChange={(event) => applyPreset(event.target.value)}>
                <option value="">读取已保存方案</option>
                {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </select>
              <input
                className="preset-name-input"
                value={presetName}
                maxLength={20}
                placeholder="方案名称，如：自营标准"
                onChange={(event) => setPresetName(event.target.value)}
              />
              <button className="preset-save" type="button" onClick={savePreset}><Save size={13} /> 保存</button>
              {selectedPresetId ? (
                <button className="preset-delete" type="button" onClick={deletePreset} aria-label="删除当前参数方案"><Trash2 size={13} /></button>
              ) : null}
            </div>
            <div className="position-tip">
              参数会自动保存。开启自适应后，同一组参数会基于每张图片自己的标签外框重新换算，减少尺寸差异造成的偏移。
            </div>
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
              到点自动生成；电脑当时未开机时，下次登录会自动补跑。自动任务会使用当前自适应与字体参数。
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
                      <span>
                        {item.source === "auto" ? "自动" : item.scope === "current" ? "当前" : item.scope === "selected" ? "选中" : "全部"}
                        {" · "}{item.actual}/{item.expected} 张
                      </span>
                    </div>
                    <span className={item.complete ? "history-badge complete" : "history-badge"}>
                      {item.complete ? "完整" : "需检查"}
                    </span>
                    <button className="history-open" type="button" onClick={() => void openFolder(item.folder)}>
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
          selectedTemplateNames={selectedTemplateNames}
          viewMode={viewMode}
          previewData={previewData}
          xRatio={xRatio}
          yRatio={yRatio}
          adaptivePosition={adaptivePosition}
          analysis={analysis}
          onPrevious={() => setSelectedIndex((index) => (index - 1 + templates.length) % templates.length)}
          onNext={() => setSelectedIndex((index) => (index + 1) % templates.length)}
          onPickPosition={(x, y) => { setXRatio(Number(x.toFixed(1))); setYRatio(Number(y.toFixed(1))); }}
          onChooseTemplates={() => void chooseTemplates()}
          onViewModeChange={setViewMode}
          onOpenTemplate={(index) => setSelectedIndex(index)}
          onToggleTemplate={toggleTemplate}
          onSelectAll={selectAllTemplates}
          onClearSelection={clearTemplateSelection}
          onInvertSelection={invertTemplateSelection}
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
              <div><strong>正在生成 {progress?.done ?? 0} / {progress?.total ?? activeTotalImages}</strong><span>{progress?.file || "正在准备图片…"}</span></div>
            </>
          ) : (
            <div><strong>{summary}</strong><span>所有处理都在本机完成，不会上传模板图片。</span></div>
          )}
        </div>

        <div className="action-buttons">
          {result ? (
            <button className="open-button" type="button" onClick={() => void openFolder(result.openPath || result.outputDir)}>
              <ExternalLink size={16} /> 打开文件夹
            </button>
          ) : null}
          <button
            className="scope-button"
            type="button"
            disabled={!canGenerate || generating}
            onClick={() => void generate("current")}
          >
            导出当前
          </button>
          <button
            className="scope-button selected-export"
            type="button"
            disabled={!canGenerate || generating || selectedCount === 0}
            onClick={() => void generate("selected")}
          >
            导出选中 {selectedCount ? `(${selectedCount})` : ""}
          </button>
          <button className="primary-button" type="button" disabled={!canGenerate} onClick={() => void generate("all")}>
            <Play size={16} fill="currentColor" />
            {generating
              ? generatingScope === "current" ? "正在导出当前…" : generatingScope === "selected" ? "正在导出选中…" : "正在导出全部…"
              : `导出全部 ${templates.length || 0} 张`}
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
