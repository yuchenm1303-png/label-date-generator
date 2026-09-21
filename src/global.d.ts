import type {
  AutomationConfig,
  GenerationHistoryItem,
  GenerationPayload,
  GenerationProgress,
  GenerationResult,
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
      previewTemplate: (path: string) => Promise<string>;
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
