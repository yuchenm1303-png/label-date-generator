import type {
  GenerationPayload,
  GenerationProgress,
  GenerationResult,
  TemplatePreparationResult,
  TemplateSelection,
} from "./types";

declare global {
  interface Window {
    dateApp: {
      chooseTemplates: () => Promise<TemplateSelection | null>;
      prepareTemplates: () => Promise<TemplatePreparationResult | null>;
      chooseOutput: () => Promise<string | null>;
      previewTemplate: (path: string) => Promise<string>;
      runGeneration: (payload: GenerationPayload) => Promise<GenerationResult>;
      openFolder: (path: string) => Promise<boolean>;
      onGenerationProgress: (callback: (payload: GenerationProgress) => void) => () => void;
    };
  }
}

export {};
