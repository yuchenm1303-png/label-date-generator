import type {
  AutomationConfig,
  GenerationHistoryItem,
  GenerationPayload,
  GenerationProgress,
  GenerationResult,
  PreviewRenderPayload,
  TemplateAnalysis,
  TemplatePreparationResult,
  TemplateSelection,
} from "./types";

declare global {
  interface Window {
    dateApp: {
      scanTemplates: (dir: string) => Promise<TemplateSelection | null>;
      chooseTemplates: () => Promise<TemplateSelection | null>;
      prepareTemplates: () => Promise<TemplatePreparationResult | null>;
      chooseOutput: () => Promise<string | null>;
      validateDirectory: (path: string) => Promise<boolean>;
      previewTemplate: (path: string) => Promise<string>;
      renderPreview: (payload: PreviewRenderPayload) => Promise<string>;
      analyzeTemplate: (path: string) => Promise<TemplateAnalysis>;
      runGeneration: (payload: GenerationPayload) => Promise<GenerationResult>;
      listHistory: () => Promise<GenerationHistoryItem[]>;
      clearHistory: () => Promise<boolean>;
      getAutomation: () => Promise<AutomationConfig>;
      installAutomation: (config: AutomationConfig) => Promise<AutomationConfig>;
      removeAutomation: () => Promise<AutomationConfig>;
      openFolder: (path: string) => Promise<boolean>;
      onGenerationProgress: (callback: (payload: GenerationProgress) => void) => () => void;
    };
  }
}

export {};
