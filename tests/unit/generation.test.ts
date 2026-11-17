import { describe, expect, it } from "vitest";
import { createDemoProvider } from "@/server/ai/demo";
import { SCENARIO_LENSES } from "@/server/ai/demoFixtures";
import { planStages, splitMinutes } from "@/server/generation/stages";
import { buildBlock, buildDemoExperience, pctChange, planSpecs, type GenContext, type GenLens } from "@/server/generation/templates";
import { validateExperience, type SourceFacts } from "@/server/generation/validate";
import { assembleDocument, markEdits, normalizeBlock, replaceBlock } from "@/server/generation/assemble";
import { toStudentView } from "@/server/generation/studentView";
import { DEFAULT_BLUEPRINT, documentSchema, generatedBlockSchema, generatedExperienceSchema, type Blueprint, type ExperienceDocument } from "@/schemas/experience";
import { generateWithRetry } from "@/server/ai/provider";

const toLens = (l: (typeof SCENARIO_LENSES)["carbon_tax"][number]): GenLens => ({
  key: l.conceptKey, name: l.conceptKey.replace(/_/g, " "), mechanism: l.mechanism, prerequisites: l.prerequisites, misconceptions: l.misconceptions,
  limitations: l.limitations, inquiryQuestion: l.inquiryQuestion, alternativeLens: l.alternativeLens, corrections: l.misconceptionCorrections,
});

function makeCtx(over: Partial<Blueprint> = {}, scenario: keyof typeof SCENARIO_LENSES = "carbon_tax", nSelected = 2): GenContext {
  const all = SCENARIO_LENSES[scenario].map(toLens);
  return {
    title: "Carbon tax on fuel", summary: "A government introduced a per-litre fuel tax.", essentialQuestion: "Who pays a fuel tax and does it cut emissions?",
    blueprint: { ...DEFAULT_BLUEPRINT, ...over },
    objectives: [{ id: "o1", code: "MIC-01", title: "Explain externalities" }, { id: "o2", code: "MIC-02", title: "Predict tax incidence" }, { id: "o3", code: "DAT-01", title: "Read data" }],
    selected: all.slice(0, nSelected), allLenses: all,
    claims: [
      { text: "The tax is 10 cents per litre.", type: "claim", status: "teacher_provided", sourceId: "s1" },
      { text: "Critics say it is unfair to rural drivers.", type: "opinion", status: "teacher_provided", sourceId: "s1" },
    ],
    stakeholders: [{ name: "Households", position: "Face higher fuel costs" }, { name: "Government", position: "Wants lower emissions" }],
    unknowns: ["How revenue is used"], sources: [{ id: "s1", title: "Teacher-provided description" }],
  };
}
const sources: SourceFacts[] = [{ id: "s1", url: null, excerpt: "text", retrievedAt: null }];

function makeDoc(ctx = makeCtx()): ExperienceDocument {
  const g = buildDemoExperience(ctx);
  return assembleDocument({ title: g.title, essentialQuestion: g.essentialQuestion, blueprint: ctx.blueprint, objectiveIds: ctx.objectives.map((o) => o.id), blocks: g.blocks, sources, storedClaims: ctx.claims.map((c) => ({ text: c.text, status: c.status, sourceId: c.sourceId })) });
}

describe("planStages / splitMinutes", () => {
  it.each([45, 60, 90, 120])("allocates exactly %i minutes with a 5-minute floor", (d) => {
    const plan = planStages(d);
    expect(Object.values(plan).reduce((a, b) => a + b, 0)).toBe(d);
    expect(Math.min(...Object.values(plan))).toBeGreaterThanOrEqual(5);
  });
  it("splits minutes exactly with every part >= 1", () => {
    for (const [t, w] of [[5, [3, 2]], [10, [3, 3, 3, 2]], [7, [1, 1, 1, 1]]] as Array<[number, number[]]>) {
      const parts = splitMinutes(t, w);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(t);
      expect(Math.min(...parts)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("T2/T3/T15 generated experience", () => {
  it.each([45, 60, 90, 120] as const)("a %i-minute experience passes the quality gate", (d) => {
    const doc = makeDoc(makeCtx({ durationMinutes: d }));
    expect(documentSchema.safeParse(doc).success).toBe(true);
    const v = validateExperience(doc, sources);
    expect(v.blocking).toEqual([]);
    expect(v.stats.totalMinutes).toBe(d);
  });

  it.each([1, 2, 3])("works with %i selected lens(es), without debate/worksheet, and in every scenario", (n) => {
    for (const scenario of ["carbon_tax", "supermarket_price", "tariff", "generic"] as const) {
      for (const opts of [{}, { includeDebate: false, includeWorksheet: false }, { durationMinutes: 45 as const, level: "Stretch" as const }]) {
        const ctx = makeCtx(opts, scenario, Math.min(n, SCENARIO_LENSES[scenario].length));
        const v = validateExperience(makeDoc(ctx), sources);
        expect(v.blocking, `${scenario} ${JSON.stringify(opts)}`).toEqual([]);
      }
    }
  });

  it("includes objectives, evidence, explanation, interactive scenario, questions with keys, reflection (T3)", () => {
    const doc = makeDoc();
    const types = doc.blocks.map((b) => b.type);
    for (const t of ["BRIEFING", "EVIDENCE_CARD", "DATA_EXPLORER", "EXPLAINER", "BRANCHING_SCENARIO", "REFLECTION", "EXIT_TICKET"]) expect(types).toContain(t);
    expect(doc.objectiveIds.length).toBeGreaterThan(0);
    const items = doc.blocks.flatMap((b) => b.items);
    expect(items.filter((i) => !i.independent).length).toBeGreaterThanOrEqual(5);
    expect(items.filter((i) => i.independent).length).toBeGreaterThanOrEqual(3);
    for (const i of items) expect(i.teacher.rationale.length).toBeGreaterThan(0);
    for (const b of doc.blocks) expect(b.objectiveIds.length).toBeGreaterThan(0);
  });

  it("answer keys are correct by construction", () => {
    const items = makeDoc().blocks.flatMap((b) => b.items);
    for (const i of items) {
      if (i.kind === "mcq") expect(i.teacher.correctOptionIds).toHaveLength(1);
      if (i.kind === "numeric" && i.teacher.computation) expect(i.teacher.numericAnswer).toBe(pctChange(i.teacher.computation.from, i.teacher.computation.to));
      if (i.kind === "multi") expect(i.teacher.correctOptionIds.length).toBeLessThan(i.options.length);
    }
  });

  it("labels synthetic data and the hypothetical scenario", () => {
    const doc = makeDoc();
    const table = doc.blocks.find((b) => b.table)!.table!;
    expect(table.synthetic).toBe(true);
    expect(table.label).toMatch(/synthetic teaching data/i);
    const sc = doc.blocks.find((b) => b.scenario)!.scenario!;
    expect(sc.hypotheticalLabel).toMatch(/hypothetical/i);
    expect(sc.decisions.length).toBeGreaterThanOrEqual(2);
  });

  it("evidence card never upgrades claim statuses", () => {
    const claims = makeDoc().blocks.flatMap((b) => b.claims);
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((c) => c.status === "teacher_provided")).toBe(true);
  });
});

describe("objective alignment", () => {
  it("maps questions to the objective that lists the concept; data questions to the data objective", () => {
    const ctx = makeCtx();
    ctx.objectives = [
      { id: "o1", code: "MIC-01", title: "x", concepts: ["externalities"] },
      { id: "o2", code: "MIC-02", title: "y", concepts: ["tax incidence", "elasticity"] },
      { id: "o3", code: "DAT-01", title: "z", concepts: ["data literacy"] },
    ];
    ctx.selected = ctx.allLenses.filter((l) => l.key === "externalities" || l.key === "tax_incidence");
    const doc = makeDoc(ctx);
    const quiz = doc.blocks.find((b) => b.type === "QUIZ")!;
    expect(quiz.items[0]!.objectiveId).toBe("o1");
    expect(quiz.items[1]!.objectiveId).toBe("o2");
    expect(doc.blocks.find((b) => b.type === "DATA_EXPLORER")!.items.every((i) => i.objectiveId === "o3")).toBe(true);
    const explainers = doc.blocks.filter((b) => b.type === "EXPLAINER");
    expect(explainers.map((b) => b.objectiveIds[0])).toEqual(["o1", "o2"]);
    expect(validateExperience(doc, sources).blocking).toEqual([]);
  });
});

describe("validator catches critical problems (FR-16)", () => {
  const base = () => makeDoc();
  const codes = (d: ExperienceDocument) => validateExperience(d, sources).blocking.map((i) => i.code);
  const clone = (d: ExperienceDocument) => structuredClone(d);

  it("T4: blocks a verified claim with no actual source", () => {
    const d = clone(base());
    d.blocks.find((b) => b.type === "EVIDENCE_CARD")!.claims[0]!.status = "verified";
    expect(codes(d)).toContain("UNSOURCED_VERIFIED_CLAIM");
    // a fetched source makes it valid
    const ok = validateExperience(d, [{ id: "s1", url: "https://example.com/a", excerpt: "x", retrievedAt: new Date() }]);
    expect(ok.blocking.map((i) => i.code)).not.toContain("UNSOURCED_VERIFIED_CLAIM");
  });

  it("T4: blocks assessments with no answer key", () => {
    const d = clone(base());
    const mcq = d.blocks.flatMap((b) => b.items).find((i) => i.kind === "mcq")!;
    mcq.teacher.correctOptionIds = [];
    const short = d.blocks.flatMap((b) => b.items).find((i) => i.kind === "short")!;
    short.teacher.rubric = [];
    const num = d.blocks.flatMap((b) => b.items).find((i) => i.kind === "numeric")!;
    num.teacher.numericAnswer = null;
    const c = codes(d);
    expect(c.filter((x) => x === "ANSWER_KEY_MISSING").length).toBeGreaterThanOrEqual(3);
  });

  it("blocks wrong numeric keys and bad option references", () => {
    const d = clone(base());
    const num = d.blocks.flatMap((b) => b.items).find((i) => i.kind === "numeric" && i.teacher.computation)!;
    num.teacher.numericAnswer = 99;
    const mcq = d.blocks.flatMap((b) => b.items).find((i) => i.kind === "mcq")!;
    mcq.teacher.correctOptionIds = ["zzz"];
    expect(codes(d)).toEqual(expect.arrayContaining(["ANSWER_KEY_INCONSISTENT", "ANSWER_KEY_INVALID"]));
  });

  it("blocks missing objectives, stages, duration mismatch, no independent check", () => {
    let d = clone(base());
    d.objectiveIds = [];
    expect(codes(d)).toContain("NO_OBJECTIVES");
    d = clone(base());
    d.blocks[0]!.objectiveIds = [];
    expect(codes(d)).toContain("BLOCK_NO_OBJECTIVE");
    d = clone(base());
    d.blocks = d.blocks.filter((b) => b.stage !== "DEBATE");
    expect(codes(d)).toContain("MISSING_STAGE");
    expect(codes(d)).toContain("DURATION_MISMATCH");
    d = clone(base());
    d.blocks = d.blocks.filter((b) => b.type !== "EXIT_TICKET");
    expect(codes(d)).toContain("NO_INDEPENDENT_CHECK");
  });

  it("blocks answer leakage into student-visible text", () => {
    const d = clone(base());
    const item = d.blocks.flatMap((b) => b.items).find((i) => i.kind === "short")!;
    d.blocks.find((b) => b.type === "BRIEFING")!.body += ` ${item.teacher.rationale}`;
    expect(codes(d)).toContain("ANSWER_LEAK");
    const d2 = clone(base());
    const ex = d2.blocks.find((b) => b.type === "EXIT_TICKET")!.items[0]!;
    const correct = ex.options.find((o) => ex.teacher.correctOptionIds.includes(o.id))!.text;
    d2.blocks.find((b) => b.type === "QUIZ")!.items[0]!.prompt += ` Hint: ${correct}`;
    expect(codes(d2)).toContain("ANSWER_LEAK");
  });

  it("blocks unlabelled synthetic data, unsourced real data and unlabelled scenarios", () => {
    let d = clone(base());
    d.blocks.find((b) => b.table)!.table!.label = "Table";
    expect(codes(d)).toContain("SYNTHETIC_UNLABELLED");
    d = clone(base());
    const t = d.blocks.find((b) => b.table)!.table!;
    t.synthetic = false;
    expect(codes(d)).toContain("DATA_UNSOURCED");
    d = clone(base());
    d.blocks.find((b) => b.scenario)!.scenario!.hypotheticalLabel = "Real numbers";
    expect(codes(d)).toContain("SCENARIO_UNLABELLED");
    d = clone(base());
    d.blocks.find((b) => b.table)!.table!.caption = "";
    expect(codes(d)).toContain("TABLE_UNLABELLED");
  });
});

describe("student view (rule 1)", () => {
  it("omits every teacher-only field from the raw JSON", () => {
    const doc = makeDoc();
    const json = JSON.stringify(toStudentView(doc));
    for (const key of ["teacherNotes", "correctOptionIds", "numericAnswer", "tolerance", "rationale", "rubric", "computation", "edited", "objectiveIds", "sourceIds"]) {
      expect(json).not.toContain(`"${key}"`);
    }
    for (const i of doc.blocks.flatMap((b) => b.items)) {
      expect(json).not.toContain(i.teacher.rationale);
      for (const r of i.teacher.rubric) expect(json).not.toContain(r);
    }
    expect(JSON.parse(json).blocks.flatMap((b: { items: unknown[] }) => b.items).length).toBeGreaterThan(0);
  });

  it("is an allow-list: unknown future fields do not leak", () => {
    const doc = makeDoc() as ExperienceDocument & { blocks: Array<Record<string, unknown>> };
    doc.blocks[0]!.secretField = "TOPSECRET";
    expect(JSON.stringify(toStudentView(doc))).not.toContain("TOPSECRET");
  });
});

describe("T2 editing and one-block regeneration", () => {
  it("replaceBlock leaves every other block byte-identical", () => {
    const doc = makeDoc();
    const target = doc.blocks.find((b) => b.type === "EXPLAINER")!;
    const fresh = { ...target, title: "Changed", edited: false };
    const next = replaceBlock(doc, target.id, fresh);
    next.blocks.forEach((b, i) => {
      if (b.id === target.id) expect(b.title).toBe("Changed");
      else expect(JSON.stringify(b)).toBe(JSON.stringify(doc.blocks[i]));
    });
    expect(next.blocks).toHaveLength(doc.blocks.length);
  });

  it("the demo provider regenerates one block with a different, valid result", async () => {
    const ctx = makeCtx();
    const doc = makeDoc(ctx);
    const index = doc.blocks.findIndex((b) => b.type === "QUIZ");
    const old = doc.blocks[index]!;
    const spec = { stage: old.stage, type: old.type, minutes: old.minutes, ordinal: 0 };
    const { data } = await generateWithRetry(createDemoProvider(), {
      operation: "regenerateBlock", promptVersion: "v", system: "s", user: "u", schema: generatedBlockSchema, schemaName: "block",
      demoInput: { text: "", context: { ctx, spec, index, previous: old, variant: 1 } },
    });
    expect(data.block.id).toBe(old.id);
    expect(JSON.stringify({ ...data.block, edited: false })).not.toBe(JSON.stringify({ ...old, edited: false }));
    const next = replaceBlock(doc, old.id, normalizeBlock(data.block, { objectiveIds: doc.objectiveIds, sources, keepId: old.id, forceStage: old.stage, forceType: old.type, forceMinutes: old.minutes }, new Set()));
    expect(validateExperience(next, sources).blocking).toEqual([]);
  });

  it("demo provider output satisfies the model-facing schema", async () => {
    const ctx = makeCtx();
    const { data } = await generateWithRetry(createDemoProvider(), {
      operation: "generateExperience", promptVersion: "v", system: "s", user: "u", schema: generatedExperienceSchema, schemaName: "e",
      demoInput: { text: "", context: { ctx, variant: 0 } },
    });
    expect(data.blocks.length).toBe(planSpecs(ctx).length);
  });

  it("markEdits sets the edited flag server-side and cannot be cleared by the client", () => {
    const doc = makeDoc();
    const edited = structuredClone(doc);
    edited.blocks[1]!.body += " More.";
    edited.blocks[2]!.edited = true; // client lies: unchanged block claims edited
    const out = markEdits(doc, edited);
    expect(out.blocks[1]!.edited).toBe(true);
    expect(out.blocks[2]!.edited).toBe(false);
    const again = structuredClone(out);
    again.blocks[1]!.edited = false; // client tries to clear the flag
    expect(markEdits(out, again).blocks[1]!.edited).toBe(true);
    const added = structuredClone(out);
    added.blocks.push({ ...buildBlock(makeCtx(), { stage: "CHECK", type: "REFLECTION", minutes: 1, ordinal: 1 }, 0, 0), id: "new1" });
    expect(markEdits(out, added).blocks.at(-1)!.edited).toBe(true);
  });

  it("normalizeBlock takes claim status only from the stored, teacher-reviewed claim (never from the model)", () => {
    const b = buildBlock(makeCtx(), { stage: "EVIDENCE", type: "EVIDENCE_CARD", minutes: 5, ordinal: 0 }, 0, 0);
    const text = b.claims[0]!.text;
    const fetched = [{ id: "s1", url: "https://e.com", excerpt: "x", retrievedAt: new Date() }];
    b.claims[0]!.status = "verified"; // the model claims verified
    // no stored claim: can never be verified, even with a fully fetched source
    expect(normalizeBlock(b, { objectiveIds: ["o1"], sources: fetched, storedClaims: [] }, new Set()).claims[0]!.status).toBe("unverified");
    // stored as teacher_provided: stays teacher_provided
    expect(normalizeBlock(b, { objectiveIds: ["o1"], sources: fetched, storedClaims: [{ text, status: "teacher_provided", sourceId: "s1" }] }, new Set()).claims[0]!.status).toBe("teacher_provided");
    // stored as verified against a fetched source: allowed
    expect(normalizeBlock(b, { objectiveIds: ["o1"], sources: fetched, storedClaims: [{ text, status: "verified", sourceId: "s1" }] }, new Set()).claims[0]!.status).toBe("verified");
    // stored as verified but the source is not actually fetched: downgraded
    expect(normalizeBlock(b, { objectiveIds: ["o1"], sources, storedClaims: [{ text, status: "verified", sourceId: "s1" }] }, new Set()).claims[0]!.status).toBe("unverified");
  });
});
