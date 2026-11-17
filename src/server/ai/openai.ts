import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { AIProviderError, type LLMProvider, type LLMRequest } from "./provider";

export function createOpenAIProvider(apiKey: string, model: string): LLMProvider {
  const client = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 0 });
  return {
    id: "openai",
    isDemo: false,
    modelId: model,
    async generate<T>(req: LLMRequest<T>): Promise<T> {
      try {
        const res = await client.responses.parse({
          model,
          input: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          text: { format: zodTextFormat(req.schema as never, req.schemaName) },
          store: false,
        });
        if (res.status === "incomplete") throw new AIProviderError("INCOMPLETE");
        const refused = res.output.some((o) => o.type === "message" && o.content.some((c) => c.type === "refusal"));
        if (refused) throw new AIProviderError("REFUSED");
        if (res.output_parsed == null) throw new AIProviderError("INVALID_OUTPUT");
        const checked = req.schema.safeParse(res.output_parsed);
        if (!checked.success) throw new AIProviderError("INVALID_OUTPUT");
        return checked.data;
      } catch (e) {
        if (e instanceof AIProviderError) throw e;
        const err = e as { status?: number; name?: string; code?: string };
        if (err.name === "APIConnectionTimeoutError") throw new AIProviderError("TIMEOUT");
        if (err.status === 429) throw new AIProviderError("QUOTA");
        if (err.status === 404 || err.status === 401 || err.status === 403 || (err.status ?? 0) >= 500 || err.name === "APIConnectionError") {
          throw new AIProviderError("UNAVAILABLE");
        }
        // Parse failures from the SDK helper surface as generic errors.
        throw new AIProviderError("INVALID_OUTPUT");
      }
    },
  };
}
