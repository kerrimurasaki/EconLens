import { AIProviderError, type LLMProvider } from "./provider";
import { createDemoProvider } from "./demo";
import { createOpenAIProvider } from "./openai";

/**
 * Selects the provider from env. Never silently falls back to demo when a real provider is requested:
 * a misconfigured real provider is an explicit error (CLAUDE.md rule 7).
 */
export function getProvider(env: NodeJS.ProcessEnv = process.env): LLMProvider {
  const which = (env.AI_PROVIDER ?? "demo").toLowerCase();
  if (which === "demo") return createDemoProvider();
  if (which === "openai") {
    if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL) throw new AIProviderError("NOT_CONFIGURED");
    return createOpenAIProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
  }
  // "anthropic" adapter is not implemented yet.
  throw new AIProviderError("NOT_CONFIGURED");
}
