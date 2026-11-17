import { z } from "zod";

export const STAGES = ["HOOK", "EVIDENCE", "MODEL", "APPLY", "DEBATE", "CHECK"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  HOOK: "Hook",
  EVIDENCE: "Investigate evidence",
  MODEL: "Teach the model",
  APPLY: "Apply / experiment",
  DEBATE: "Debate and reflect",
  CHECK: "Independent check",
};

export const BLOCK_TYPES = [
  "BRIEFING",
  "EVIDENCE_CARD",
  "DATA_EXPLORER",
  "EXPLAINER",
  "QUESTION",
  "BRANCHING_SCENARIO",
  "DEBATE",
  "WORKSHEET",
  "QUIZ",
  "EXIT_TICKET",
  "REFLECTION",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const DURATIONS = [45, 60, 90, 120] as const;

// ---- Blueprint ----
export const blueprintSchema = z.object({
  durationMinutes: z.union([z.literal(45), z.literal(60), z.literal(90), z.literal(120)]),
  level: z.enum(["Foundation", "Standard", "Stretch"]),
  readiness: z.enum(["low", "mixed", "high"]),
  english: z.enum(["developing", "intermediate", "advanced"]),
  quant: z.enum(["low", "medium", "high"]),
  devices: z.enum(["one_per_student", "shared", "none"]),
  classSize: z.number().int().min(1).max(300),
  includeDebate: z.boolean(),
  includeWorksheet: z.boolean(),
});
export type Blueprint = z.infer<typeof blueprintSchema>;

export const DEFAULT_BLUEPRINT: Blueprint = {
  durationMinutes: 90,
  level: "Foundation",
  readiness: "mixed",
  english: "developing",
  quant: "low",
  devices: "one_per_student",
  classSize: 25,
  includeDebate: true,
  includeWorksheet: true,
};

// ---- Content (model-facing shapes use nullable instead of optional; no array-size keywords) ----
export const claimStatusSchema = z.enum(["verified", "teacher_provided", "disputed", "hypothetical", "unverified"]);

export const itemSchema = z.object({
  id: z.string(),
  kind: z.enum(["mcq", "multi", "numeric", "short"]),
  prompt: z.string().max(1500),
  options: z.array(z.object({ id: z.string(), text: z.string().max(600) })),
  unit: z.string().nullable(),
  objectiveId: z.string(),
  independent: z.boolean(),
  /** Teacher-only. Never serialised to students (see studentView). */
  teacher: z.object({
    correctOptionIds: z.array(z.string()),
    numericAnswer: z.number().nullable(),
    tolerance: z.number().nullable(),
    /** Optional machine-checkable derivation of numericAnswer. */
    computation: z.object({ kind: z.literal("pct_change"), from: z.number(), to: z.number() }).nullable(),
    rationale: z.string().max(2000),
    rubric: z.array(z.string().max(400)),
  }),
});
export type Item = z.infer<typeof itemSchema>;

export const tableSchema = z.object({
  caption: z.string().max(300),
  columns: z.array(z.string().max(100)),
  rows: z.array(z.array(z.string().max(100))),
  synthetic: z.boolean(),
  /** Required label text when synthetic; otherwise a source reference is required. */
  label: z.string().max(200),
  sourceId: z.string().nullable(),
  asOf: z.string().nullable(),
});

export const scenarioSchema = z.object({
  premise: z.string().max(2000),
  hypotheticalLabel: z.string().max(300),
  parameters: z.array(z.object({ id: z.string(), label: z.string().max(100), start: z.number(), unit: z.string().max(40) })),
  decisions: z.array(
    z.object({
      id: z.string(),
      prompt: z.string().max(600),
      options: z.array(
        z.object({
          id: z.string(),
          label: z.string().max(300),
          effects: z.array(z.object({ parameterId: z.string(), delta: z.number() })),
          explanation: z.string().max(800),
        }),
      ),
    }),
  ),
  rules: z.string().max(1500),
  debrief: z.string().max(2500),
});
export type Scenario = z.infer<typeof scenarioSchema>;

export const blockSchema = z.object({
  id: z.string(),
  stage: z.enum(STAGES),
  type: z.enum(BLOCK_TYPES),
  title: z.string().max(200),
  minutes: z.number().int().min(1).max(120),
  objectiveIds: z.array(z.string()),
  sourceIds: z.array(z.string()),
  /** Plain text only (paragraphs separated by blank lines). Never rendered as HTML. */
  body: z.string().max(6000),
  table: tableSchema.nullable(),
  scenario: scenarioSchema.nullable(),
  items: z.array(itemSchema),
  teacherNotes: z.string().max(4000),
  claims: z.array(z.object({ text: z.string().max(1000), status: claimStatusSchema, sourceId: z.string().nullable() })),
  /** Set by the server when a teacher changed the block. Guards regeneration overwrite. */
  edited: z.boolean(),
});
export type Block = z.infer<typeof blockSchema>;

const baseDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().max(200),
  essentialQuestion: z.string().max(400),
  durationMinutes: z.number().int(),
  level: z.string().max(40),
  objectiveIds: z.array(z.string()),
  blueprint: blueprintSchema,
  blocks: z.array(blockSchema).max(40),
});

const LIMITS = { items: 30, options: 12, rubric: 12, rows: 40, columns: 10, claims: 40, ids: 30, params: 10, decisions: 6, decisionOptions: 6, effects: 12 };

/** Persisted/saved documents are bounded so a client cannot store arbitrarily large drafts. */
export const documentSchema = baseDocumentSchema.superRefine((d, ctx) => {
  const bad = (msg: string) => ctx.addIssue({ code: "custom", message: msg });
  if (d.objectiveIds.length > LIMITS.ids) bad("Too many objectives.");
  for (const b of d.blocks) {
    if (b.items.length > LIMITS.items || b.claims.length > LIMITS.claims || b.objectiveIds.length > LIMITS.ids || b.sourceIds.length > LIMITS.ids) bad("A block has too many entries.");
    if (b.table && (b.table.rows.length > LIMITS.rows || b.table.columns.length > LIMITS.columns || b.table.rows.some((r) => r.length > LIMITS.columns))) bad("A table is too large.");
    if (b.scenario) {
      const sc = b.scenario;
      if (sc.parameters.length > LIMITS.params || sc.decisions.length > LIMITS.decisions || sc.decisions.some((x) => x.options.length > LIMITS.decisionOptions || x.options.some((o) => o.effects.length > LIMITS.effects))) bad("A scenario is too large.");
    }
    for (const i of b.items) if (i.options.length > LIMITS.options || i.teacher.rubric.length > LIMITS.rubric || i.teacher.correctOptionIds.length > LIMITS.options) bad("A question has too many entries.");
  }
});
export type ExperienceDocument = z.infer<typeof baseDocumentSchema>;

/** Model output for generateExperience / regenerateBlock. */
export const generatedExperienceSchema = z.object({
  title: z.string(),
  essentialQuestion: z.string(),
  blocks: z.array(blockSchema),
});
export const generatedBlockSchema = z.object({ block: blockSchema });

// ---- Client mutations ----
export const saveDraftSchema = z.object({ baseVersion: z.number().int().min(1), doc: documentSchema });
export const regenerateSchema = z.object({
  baseVersion: z.number().int().min(1),
  instruction: z.string().trim().max(500).optional(),
  confirmOverwrite: z.boolean().default(false),
});
export const restoreSchema = z.object({ baseVersion: z.number().int().min(1), versionNumber: z.number().int().min(1) });

// ---- Validation ----
export interface ValidationIssue {
  severity: "blocking" | "warning";
  code: string;
  message: string;
  blockId?: string;
  itemId?: string;
}
export interface ValidationResult {
  passed: boolean;
  blocking: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: { formativeItems: number; independentItems: number; totalMinutes: number; blocks: number };
}
