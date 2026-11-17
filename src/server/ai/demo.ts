import type { LLMProvider, LLMRequest } from "./provider";
import type { InferResult, NormalizedEvent } from "@/schemas/events";
import type { Block } from "@/schemas/experience";
import { buildBlock, buildDemoExperience, type BlockSpec, type GenContext } from "../generation/templates";
import {
  detectScenario,
  SCENARIO_LENSES,
  SCENARIO_OPPORTUNITIES,
  SCENARIO_STAKEHOLDERS,
  SCENARIO_UNKNOWNS,
} from "./demoFixtures";

export const DEMO_MODEL_ID = "demo-fixture";

function classify(sentence: string): NormalizedEvent["claims"][number]["type"] {
  const s = sentence.toLowerCase();
  if (/\b(should|must|unfair|best|worst|ought|terrible|great)\b/.test(s)) return "opinion";
  if (/\b(will|would|might|could|may|if)\b/.test(s)) return "hypothesis";
  // Nothing is verified in demo mode, so statements are "claim", never "fact".
  return "claim";
}

/**
 * Deterministic template provider. It does NOT analyse the text with a model: claims are the teacher's own
 * sentences; lenses come from a built-in template chosen by keywords. The UI labels every result as demo.
 */
function normalize(text: string): NormalizedEvent {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5)
    .slice(0, 12);
  const scenario = detectScenario(text);
  return {
    title: (sentences[0] ?? text).slice(0, 120),
    summary: sentences.slice(0, 2).join(" ").slice(0, 400) || text.slice(0, 400),
    eventType: scenario === "carbon_tax" ? "policy" : scenario === "tariff" ? "global_affair" : scenario === "supermarket_price" ? "business" : "other",
    jurisdiction: "Not stated",
    actors: [],
    timeline: [],
    stakeholders: SCENARIO_STAKEHOLDERS[scenario],
    claims: sentences.map((s) => ({ text: s, type: classify(s) })),
    unknowns: ["The accuracy of the statements above has not been verified", ...SCENARIO_UNKNOWNS[scenario]],
    economicsOpportunities: SCENARIO_OPPORTUNITIES[scenario],
  };
}

function infer(text: string): InferResult {
  return { lenses: SCENARIO_LENSES[detectScenario(text)] };
}

function run(op: LLMRequest<unknown>["operation"], input: LLMRequest<unknown>["demoInput"]): unknown {
  if (op === "normalizeEvent") return normalize(input.text);
  if (op === "inferEconomics") return infer(input.text);
  if (op === "generateExperience") {
    const { ctx, variant } = input.context as { ctx: GenContext; variant: number };
    return buildDemoExperience(ctx, variant);
  }
  const { ctx, spec, variant, index, previous } = input.context as { ctx: GenContext; spec: BlockSpec; variant: number; index: number; previous: Block };
  // Try a few variants so the regenerated block really differs from the one it replaces.
  let block = buildBlock(ctx, spec, variant, index, previous.id);
  for (let v = 1; v <= 4 && JSON.stringify({ ...block, edited: false }) === JSON.stringify({ ...previous, edited: false }); v++) {
    block = buildBlock(ctx, spec, variant + v, index, previous.id);
  }
  return { block };
}

export function createDemoProvider(): LLMProvider {
  return {
    id: "demo",
    isDemo: true,
    modelId: DEMO_MODEL_ID,
    async generate<T>(req: LLMRequest<T>): Promise<T> {
      return req.schema.parse(run(req.operation, req.demoInput));
    },
  };
}
