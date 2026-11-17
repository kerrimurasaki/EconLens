import { z } from "zod";
import { CONCEPT_KEYS } from "./taxonomy";

export const MAX_INPUT_CHARS = 8000;

export const eventInputSchema = z
  .object({
    inputType: z.enum(["describe", "headline", "url"]),
    text: z.string().trim().max(MAX_INPUT_CHARS).default(""),
    url: z.string().trim().max(2000).optional(),
    title: z.string().trim().max(200).optional(),
    eventDate: z.string().date().optional(),
    geography: z.string().trim().max(100).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.inputType === "url") {
      if (!v.url) ctx.addIssue({ code: "custom", path: ["url"], message: "Enter a URL." });
      else if (!/^https?:\/\//i.test(v.url)) ctx.addIssue({ code: "custom", path: ["url"], message: "URL must start with http:// or https://" });
    } else if (v.text.length < 10) {
      ctx.addIssue({ code: "custom", path: ["text"], message: "Please enter at least 10 characters." });
    }
  });
export type EventInput = z.infer<typeof eventInputSchema>;

const claimTypes = ["fact", "claim", "opinion", "hypothesis", "unknown"] as const;

/** Model-facing schema. No array-size keywords: structured-output subsets reject them; sizes are validated in code. */
export const normalizedEventSchema = z.object({
  title: z.string(),
  summary: z.string(),
  eventType: z.enum(["policy", "business", "global_affair", "historical", "everyday", "other"]),
  jurisdiction: z.string(),
  actors: z.array(z.string()),
  timeline: z.array(z.object({ when: z.string(), what: z.string() })),
  stakeholders: z.array(z.object({ name: z.string(), position: z.string() })),
  claims: z.array(z.object({ text: z.string(), type: z.enum(claimTypes) })),
  unknowns: z.array(z.string()),
  economicsOpportunities: z.array(z.string()),
});
export type NormalizedEvent = z.infer<typeof normalizedEventSchema>;

export const lensSchema = z.object({
  conceptKey: z.enum(CONCEPT_KEYS),
  relevance: z.number(),
  mechanism: z.string(),
  /** Indexes into the normalized claims list that this lens relies on. */
  evidenceClaimIndexes: z.array(z.number()),
  prerequisites: z.array(z.string()),
  misconceptions: z.array(z.string()),
  /** misconceptionCorrections[i] is a short accurate rebuttal of misconceptions[i]. */
  misconceptionCorrections: z.array(z.string()),
  inquiryQuestion: z.string(),
  alternativeLens: z.string(),
  limitations: z.array(z.string()),
});
export type Lens = z.infer<typeof lensSchema>;

export const inferResultSchema = z.object({ lenses: z.array(lensSchema) });
export type InferResult = z.infer<typeof inferResultSchema>;

export const lensSelectionSchema = z.object({
  conceptKeys: z.array(z.enum(CONCEPT_KEYS)).min(1).max(3),
  inquiryQuestion: z.string().trim().min(10).max(400),
  objectiveIds: z.array(z.string()).min(1).max(6),
});
export type LensSelection = z.infer<typeof lensSelectionSchema>;

export const claimUpdateSchema = z.object({
  verificationStatus: z.enum(["verified", "teacher_provided", "disputed", "hypothetical", "unverified"]),
  sourceId: z.string().nullable().optional(),
});
