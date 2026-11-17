import type { ZodType } from "zod";

export type AIOperation = "normalizeEvent" | "inferEconomics" | "generateExperience" | "regenerateBlock";

export type AIErrorCode =
  | "NOT_CONFIGURED"
  | "REFUSED"
  | "TIMEOUT"
  | "INCOMPLETE"
  | "INVALID_OUTPUT"
  | "QUOTA"
  | "UNAVAILABLE";

const USER_MESSAGE: Record<AIErrorCode, string> = {
  NOT_CONFIGURED: "The AI provider is not configured. Set the provider environment variables, or use demo mode (AI_PROVIDER=demo).",
  REFUSED: "The AI model declined to process this input. Try rewording it or describing the event in your own words.",
  TIMEOUT: "The AI request timed out. Please try again.",
  INCOMPLETE: "The AI response was cut off. Please try again with a shorter input.",
  INVALID_OUTPUT: "The AI returned an answer that did not match the required format. Please try again.",
  QUOTA: "The AI provider quota or rate limit was reached. Please try again later.",
  UNAVAILABLE: "The AI provider is currently unavailable or the configured model was not found.",
};

export class AIProviderError extends Error {
  constructor(public readonly code: AIErrorCode) {
    super(USER_MESSAGE[code]);
    this.name = "AIProviderError";
  }
  /** Errors worth a bounded retry. */
  get retryable() {
    return this.code === "TIMEOUT" || this.code === "INVALID_OUTPUT" || this.code === "INCOMPLETE";
  }
}

export interface LLMRequest<T> {
  operation: AIOperation;
  promptVersion: string;
  /** Fixed policy. Never contains user content. */
  system: string;
  /** User-supplied content, already wrapped in untrusted-data delimiters. */
  user: string;
  schema: ZodType<T>;
  schemaName: string;
  /** Raw teacher text; used only by the demo provider (which does not read prompts). */
  demoInput: { text: string; normalized?: unknown; context?: unknown };
}

export interface LLMProvider {
  readonly id: "openai" | "demo";
  readonly isDemo: boolean;
  readonly modelId: string;
  generate<T>(req: LLMRequest<T>): Promise<T>;
}

export async function generateWithRetry<T>(provider: LLMProvider, req: LLMRequest<T>, maxAttempts = 2): Promise<{ data: T; attempts: number }> {
  let last: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return { data: await provider.generate(req), attempts: attempt };
    } catch (e) {
      last = e;
      if (!(e instanceof AIProviderError) || !e.retryable) throw e;
    }
  }
  throw last;
}
