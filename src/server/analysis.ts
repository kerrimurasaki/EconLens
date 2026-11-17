import {
  inferResultSchema,
  normalizedEventSchema,
  type InferResult,
  type NormalizedEvent,
} from "@/schemas/events";
import { generateWithRetry, type LLMProvider } from "./ai/provider";
import { loadPrompt, PROMPT_VERSIONS, wrapUntrusted } from "./ai/prompts";
import { AppError } from "./errors";

export const MIN_LENSES = 4;
export const MAX_LENSES = 8;
const MAX_CLAIMS = 30;

export async function normalizeEvent(provider: LLMProvider, text: string): Promise<NormalizedEvent> {
  const { data } = await generateWithRetry(provider, {
    operation: "normalizeEvent",
    promptVersion: PROMPT_VERSIONS.normalizeEvent,
    system: loadPrompt("normalizeEvent"),
    user: wrapUntrusted(text),
    schema: normalizedEventSchema,
    schemaName: "normalized_event",
    demoInput: { text },
  });
  return { ...data, claims: data.claims.filter((c) => c.text.trim()).slice(0, MAX_CLAIMS) };
}

/** Validates model output: dedupes, clamps scores, drops bad claim links, enforces 4-8 lenses, ranks. */
export function cleanLenses(result: InferResult, claimCount: number): InferResult["lenses"] {
  const seen = new Set<string>();
  const lenses = result.lenses
    .filter((l) => (seen.has(l.conceptKey) ? false : (seen.add(l.conceptKey), true)))
    .map((l) => ({
      ...l,
      relevance: Math.min(1, Math.max(0, Number.isFinite(l.relevance) ? l.relevance : 0)),
      // Corrections must line up one-to-one with misconceptions; otherwise drop them (the item generator then skips them).
      misconceptionCorrections: l.misconceptionCorrections.length === l.misconceptions.length ? l.misconceptionCorrections : [],
      evidenceClaimIndexes: l.evidenceClaimIndexes.filter((i) => Number.isInteger(i) && i >= 0 && i < claimCount),
    }))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, MAX_LENSES);
  if (lenses.length < MIN_LENSES) throw new AppError("AI_ERROR", "The AI returned too few distinct concepts. Please try again.");
  return lenses;
}

export async function inferEconomics(provider: LLMProvider, event: NormalizedEvent, text: string) {
  const payload = JSON.stringify({ event, claimsAreZeroIndexed: true });
  const { data } = await generateWithRetry(provider, {
    operation: "inferEconomics",
    promptVersion: PROMPT_VERSIONS.inferEconomics,
    system: loadPrompt("inferEconomics"),
    user: wrapUntrusted(payload),
    schema: inferResultSchema,
    schemaName: "economic_lenses",
    demoInput: { text, normalized: event },
  });
  return cleanLenses(data, event.claims.length);
}

export type ClaimStatus = "verified" | "teacher_provided" | "disputed" | "hypothetical" | "unverified";

export function initialClaimStatus(type: NormalizedEvent["claims"][number]["type"], sourceKind: "pasted" | "fetched"): ClaimStatus {
  if (type === "hypothesis") return "hypothetical";
  return sourceKind === "pasted" ? "teacher_provided" : "unverified";
}

export interface SourceFacts {
  url: string | null;
  excerpt: string | null;
  retrievedAt: Date | null;
}

/** A claim may only be `verified` against a source with a stored URL, excerpt and retrieval time; opinions never. */
export function canMarkVerified(claimType: string, source: SourceFacts | null): { ok: true } | { ok: false; reason: string } {
  if (claimType === "opinion") return { ok: false, reason: "An opinion cannot be marked as a verified fact." };
  if (!source?.url || !source.excerpt || !source.retrievedAt) {
    return { ok: false, reason: "A claim can only be marked verified when linked to a fetched source (URL, excerpt and retrieval time)." };
  }
  return { ok: true };
}
