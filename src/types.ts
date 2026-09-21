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

export type GenerationPayload = {
  templateDir: string;
  outputDir: string;
  mode: "single" | "range";
  startDate: string;
  endDate: string;
  xRatio: number;
  yRatio: number;
  fontRatio: number;
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
  updatedAt?: string;
};
