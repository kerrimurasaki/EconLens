import { z } from "zod";
import { AppError } from "../errors";
import type { Item, Scenario } from "@/schemas/experience";

// ---------- response shapes (client mutation / persisted) ----------
export const responseSchemas = {
  mcq: z.object({ optionIds: z.array(z.string().max(40)).length(1) }),
  multi: z.object({ optionIds: z.array(z.string().max(40)).max(12) }),
  numeric: z.object({ value: z.number().finite().min(-1e12).max(1e12) }),
  short: z.object({ text: z.string().max(3000) }),
} as const;
export type ItemResponse = z.infer<(typeof responseSchemas)[keyof typeof responseSchemas]>;

/** Validates a student's answer against the item definition. Throws VALIDATION on any mismatch. */
export function parseResponse(item: Pick<Item, "kind" | "options">, raw: unknown): ItemResponse {
  const parsed = responseSchemas[item.kind].safeParse(raw);
  if (!parsed.success) throw new AppError("VALIDATION", "That answer is not valid for this question.");
  const r = parsed.data;
  if ("optionIds" in r) {
    const ids = new Set(item.options.map((o) => o.id));
    if (!r.optionIds.every((id) => ids.has(id)) || new Set(r.optionIds).size !== r.optionIds.length) {
      throw new AppError("VALIDATION", "That answer is not valid for this question.");
    }
  }
  return r;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Auto score: 1 or 0 for machine-markable items; null when a teacher must mark (short answer). */
export function autoScore(item: Pick<Item, "kind" | "teacher">, r: ItemResponse): number | null {
  if (item.kind === "short") return null;
  if ("optionIds" in r) return sameSet(r.optionIds, item.teacher.correctOptionIds) ? 1 : 0;
  if ("value" in r) {
    const { numericAnswer, tolerance } = item.teacher;
    if (numericAnswer === null) return null;
    return Math.abs(r.value - numericAnswer) <= (tolerance ?? 0) + 1e-9 ? 1 : 0;
  }
  return null;
}

export interface ScoreRow { itemId: string; independent: boolean; kind: Item["kind"]; autoScore: number | null; teacherScore: number | null; answered: boolean }

export interface ScoreSummary {
  independent: { earned: number; possible: number; pending: number };
  formative: { earned: number; possible: number; pending: number };
  /** Independent mastery as a fraction 0..1 over items already scored; null when nothing is scored yet. */
  score: number | null;
  needsReview: boolean;
}

/** Unanswered auto-marked items count as 0; short answers stay pending until a teacher scores them. */
export function computeScores(rows: ScoreRow[]): ScoreSummary {
  const sum = (indep: boolean) => {
    let earned = 0, possible = 0, pending = 0;
    for (const r of rows.filter((x) => x.independent === indep)) {
      const eff = r.teacherScore ?? r.autoScore ?? (r.kind === "short" ? (r.answered ? null : 0) : 0);
      if (eff === null) pending++;
      else { earned += eff; possible++; }
    }
    return { earned, possible, pending };
  };
  const independent = sum(true);
  const formative = sum(false);
  return {
    independent, formative,
    score: independent.possible > 0 ? independent.earned / independent.possible : null,
    needsReview: independent.pending + formative.pending > 0,
  };
}

// ---------- scenario engine (server-authoritative; pure) ----------
export interface ScenarioState {
  values: Record<string, number>;
  steps: Array<{ decisionId: string; optionId: string; label: string; explanation: string }>;
  complete: boolean;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Applies an ordered list of choices. Choices must follow decision order with no gaps. */
export function computeScenario(sc: Scenario, choices: Array<{ decisionId: string; optionId: string }>): ScenarioState {
  const values: Record<string, number> = Object.fromEntries(sc.parameters.map((p) => [p.id, p.start]));
  const steps: ScenarioState["steps"] = [];
  choices.forEach((c, i) => {
    const decision = sc.decisions[i];
    const option = decision?.options.find((o) => o.id === c.optionId);
    if (!decision || decision.id !== c.decisionId || !option) throw new AppError("VALIDATION", "That choice is not valid at this step.");
    for (const e of option.effects) values[e.parameterId] = r2((values[e.parameterId] ?? 0) + e.delta);
    steps.push({ decisionId: decision.id, optionId: option.id, label: option.label, explanation: option.explanation });
  });
  for (const k of Object.keys(values)) values[k] = r2(values[k]!);
  return { values, steps, complete: choices.length === sc.decisions.length };
}
