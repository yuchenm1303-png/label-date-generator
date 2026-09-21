export type TemplateItem = {
  name: string;
  path: string;
};

export type TemplateSelection = {
  dir: string;
  templates: TemplateItem[];
  suggestedOutput: string;
};

export type TemplatePreparationResult = TemplateSelection & {
  count: number;
};

export type LabelBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type TemplateAnalysis = {
  type?: "analysis";
  path: string;
  width: number;
  height: number;
  labelBox: LabelBox;
  confidence: number;
};

export type FontFamily = "simhei" | "msyh" | "simsun";

export type GenerationPayload = {
  templateDir: string;
  outputDir: string;
  mode: "single" | "range";
  startDate: string;
  endDate: string;
  xRatio: number;
  yRatio: number;
  fontRatio: number;
  adaptivePosition: boolean;
  fontFamily: FontFamily;
  bold: boolean;
  letterSpacing: number;
  templateNames?: string[];
  exportScope?: "current" | "selected" | "all";
};

export type PreviewRenderPayload = {
  path: string;
  date: string;
  xRatio: number;
  yRatio: number;
  fontRatio: number;
  adaptivePosition: boolean;
  fontFamily: FontFamily;
  bold: boolean;
  letterSpacing: number;
};

export type GenerationProgress = {
  type: "progress";
  done: number;
  total: number;
  file?: string;
  date?: string;
};

export type GenerationResult = {
  type: "done";
  done: number;
  total: number;
  dates: number;
  outputDir: string;
  created?: number;
  skipped?: number;
};

export type GenerationHistoryItem = {
  id: string;
  date: string;
  folder: string;
  expected: number;
  actual: number;
  complete: boolean;
  source: "manual" | "auto";
  scope?: "current" | "selected" | "all";
  updatedAt: string;
};

export type AutomationConfig = {
  enabled: boolean;
  time: string;
  horizonDays: number;
  templateDir?: string;
  outputDir?: string;
  xRatio?: number;
  yRatio?: number;
  fontRatio?: number;
  adaptivePosition?: boolean;
  fontFamily?: FontFamily;
  bold?: boolean;
  letterSpacing?: number;
  updatedAt?: string;
};

export type ParameterPreset = {
  id: string;
  name: string;
  xRatio: number;
  yRatio: number;
  fontRatio: number;
  adaptivePosition: boolean;
  fontFamily: FontFamily;
  bold: boolean;
  letterSpacing: number;
};
