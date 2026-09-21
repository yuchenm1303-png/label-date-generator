import type {
  GenerationPayload,
  GenerationProgress,
  GenerationResult,
  TemplateSelection,
} from "./types";

declare global {
  interface Window {
    dateApp: {
      chooseTemplates: () => Promise<TemplateSelection | null>;
      chooseOutput: () => Promise<string | null>;
      previewTemplate: (path: string) => Promise<string>;
      runGeneration: (payload: GenerationPayload) => Promise<GenerationResult>;
      openFolder: (path: string) => Promise<boolean>;
      onGenerationProgress: (callback: (payload: GenerationProgress) => void) => () => void;
    };
  }
}

export {};
