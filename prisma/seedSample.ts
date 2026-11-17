import type { PrismaClient } from "../src/generated/prisma/client";
import { SCENARIO_LENSES, SCENARIO_STAKEHOLDERS, SCENARIO_UNKNOWNS } from "../src/server/ai/demoFixtures";
import { buildDemoExperience, type GenLens } from "../src/server/generation/templates";
import { assembleDocument } from "../src/server/generation/assemble";
import { validateExperience } from "../src/server/generation/validate";
import { writeDerivedRows } from "../src/server/generation/derived";
import { DEFAULT_BLUEPRINT } from "../src/schemas/experience";
import { CONCEPTS } from "../src/schemas/taxonomy";
import { assessmentItemRowId } from "../src/server/generation/derived";
import { autoScore, computeScenario, computeScores, type ItemResponse } from "../src/server/learn/scoring";
import type { ExperienceDocument, Item } from "../src/schemas/experience";

/**
 * Illustrative 90-minute sample built by the labelled demo template generator.
 * Every number is synthetic and the scenario is hypothetical; nothing here is real news or data.
 */
export async function seedSampleExperience(db: PrismaClient, tenantId: string, teacherId: string, eventId: string, text: string) {
  const objs = await db.curriculumObjective.findMany({ where: { tenantId, code: { in: ["MIC-01", "MIC-02", "DAT-01"] } }, orderBy: { code: "asc" } });
  const lenses = SCENARIO_LENSES.carbon_tax;
  const selectedKeys = ["externalities", "tax_incidence"];
  const source = await db.source.create({
    data: { eventCaseId: eventId, title: "Illustrative sample scenario (not a news source)", excerpt: text, status: "hypothetical" },
  });
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  await db.evidenceClaim.createMany({
    data: sentences.map((t) => ({ eventCaseId: eventId, text: t, claimType: "hypothesis" as const, verificationStatus: "hypothetical" as const, sourceId: source.id })),
  });
  await db.conceptSuggestion.createMany({
    data: lenses.map((l, rank) => ({
      eventCaseId: eventId, conceptKey: l.conceptKey, score: l.relevance, explanation: l.mechanism, rank, limitationsJson: l.limitations,
      prerequisitesJson: l.prerequisites, misconceptionJson: l.misconceptions,
      detailsJson: { inquiryQuestion: l.inquiryQuestion, alternativeLens: l.alternativeLens, evidenceClaimIndexes: [], misconceptionCorrections: l.misconceptionCorrections }, selected: selectedKeys.includes(l.conceptKey),
    })),
  });

  const question = "Who really pays a fuel tax, and does it cut emissions?";
  const bp = { ...DEFAULT_BLUEPRINT };
  const toLens = (l: (typeof lenses)[number]): GenLens => ({
    key: l.conceptKey, name: CONCEPTS[l.conceptKey], mechanism: l.mechanism, prerequisites: l.prerequisites, misconceptions: l.misconceptions,
    limitations: l.limitations, inquiryQuestion: l.inquiryQuestion, alternativeLens: l.alternativeLens, corrections: l.misconceptionCorrections,
  });
  const title = "[SAMPLE] Carbon tax: who pays and does it work?";
  const ctx = {
    title, summary: text, essentialQuestion: question, blueprint: bp,
    objectives: objs.map((o) => ({ id: o.id, code: o.code, title: o.title, concepts: Array.isArray(o.conceptsJson) ? (o.conceptsJson as string[]) : [] })),
    selected: lenses.filter((l) => selectedKeys.includes(l.conceptKey)).map(toLens), allLenses: lenses.map(toLens),
    claims: sentences.map((t) => ({ text: t, type: "hypothesis", status: "hypothetical" as const, sourceId: source.id })),
    stakeholders: SCENARIO_STAKEHOLDERS.carbon_tax, unknowns: SCENARIO_UNKNOWNS.carbon_tax, sources: [{ id: source.id, title: source.title }],
  };
  const sources = [{ id: source.id, url: null, excerpt: source.excerpt, retrievedAt: null }];
  const doc = assembleDocument({ title, essentialQuestion: question, blueprint: bp, objectiveIds: objs.map((o) => o.id), blocks: buildDemoExperience(ctx).blocks, sources });
  const validation = validateExperience(doc, sources);
  if (!validation.passed) throw new Error("Seed experience failed validation: " + validation.blocking.map((i) => i.code).join(", "));

  await db.eventCase.update({
    where: { id: eventId },
    data: { analysisMode: "demo", analysisModel: "demo-fixture", analyzedAt: new Date(), analysisJson: { summary: text, stakeholders: ctx.stakeholders, unknowns: ctx.unknowns } },
  });
  const { versionId, experienceId } = await db.$transaction(async (tx) => {
    const exp = await tx.experience.create({
      data: {
        tenantId, eventCaseId: eventId, creatorId: teacherId, title, durationMinutes: 90, isDemo: true,
        settingsJson: { sourceKind: "pasted", lensesApproved: true, blueprintApproved: true, blueprint: bp, inquiryQuestion: question, objectiveIds: objs.map((o) => o.id) },
      },
    });
    const v = await tx.experienceVersion.create({
      data: {
        experienceId: exp.id, versionNumber: 1, createdBy: teacherId, contentJson: doc as never, validationJson: validation as never, modelId: "demo-fixture", promptVersion: "demo-template",
        isPublished: true, publishedAt: new Date(), publishedBy: teacherId,
      },
    });
    await writeDerivedRows(tx, v.id, doc);
    await tx.experience.update({ where: { id: exp.id }, data: { currentVersionId: v.id, status: "PUBLISHED" } });
    return { versionId: v.id, experienceId: exp.id };
  });
  await seedClassAndAttempts(db, tenantId, teacherId, experienceId, versionId, doc);
}

function answerFor(item: Item, correct: boolean): ItemResponse {
  if (item.kind === "short") return { text: correct ? "The tax raises the price buyers face so they buy less, but the burden is shared depending on how responsive buyers and sellers are. I would still want data on how much demand falls." : "Taxes are bad." };
  if (item.kind === "numeric") return { value: correct ? item.teacher.numericAnswer! : item.teacher.numericAnswer! + 5 };
  const wrong = item.options.find((o) => !item.teacher.correctOptionIds.includes(o.id))!;
  if (item.kind === "multi") return { optionIds: correct ? item.teacher.correctOptionIds : [wrong.id] };
  return { optionIds: [correct ? item.teacher.correctOptionIds[0]! : wrong.id] };
}

/** Fictitious class, students and attempts so the dashboards have something real-shaped to show. */
async function seedClassAndAttempts(db: PrismaClient, tenantId: string, teacherId: string, experienceId: string, versionId: string, doc: ExperienceDocument) {
  const students = await db.user.findMany({ where: { tenantId, email: { in: ["student1@demo.econlens.test", "student2@demo.econlens.test", "student3@demo.econlens.test"] } }, orderBy: { email: "asc" } });
  const cls = await db.classroom.upsert({
    where: { joinCode: "DEMO2026" }, update: {},
    create: { tenantId, teacherId, name: "Sample class (fictitious)", term: "Demo term", joinCode: "DEMO2026", joinExpiresAt: null },
  });
  for (const st of students) await db.classEnrollment.upsert({ where: { classId_studentId: { classId: cls.id, studentId: st.id } }, update: {}, create: { classId: cls.id, studentId: st.id } });
  const assignment = await db.assignment.create({ data: { experienceId, publishedVersionId: versionId, classId: cls.id, status: "OPEN", feedbackMode: "after_submit" } });

  const items = doc.blocks.flatMap((b) => b.items);
  const scenarioBlock = doc.blocks.find((b) => b.scenario)!;
  // student1: strong; student2: weaker; student3: enrolled but has not started.
  const plans: Array<{ email: string; wrongIds: Set<string>; choices: Array<{ decisionId: string; optionId: string }> }> = [
    { email: "student1@demo.econlens.test", wrongIds: new Set([items.filter((i) => i.independent)[1]!.id]), choices: scenarioBlock.scenario!.decisions.map((d) => ({ decisionId: d.id, optionId: d.options[0]!.id })) },
    { email: "student2@demo.econlens.test", wrongIds: new Set(items.filter((i, n) => i.kind !== "short" && n % 2 === 0).map((i) => i.id)), choices: scenarioBlock.scenario!.decisions.map((d) => ({ decisionId: d.id, optionId: d.options[1]!.id })) },
  ];
  for (const plan of plans) {
    const st = students.find((x) => x.email === plan.email);
    if (!st) continue;
    computeScenario(scenarioBlock.scenario!, plan.choices); // validates the seeded choices
    const attempt = await db.attempt.create({ data: { assignmentId: assignment.id, studentId: st.id, stateJson: { scenarios: { [scenarioBlock.id]: { choices: plan.choices } } } } });
    const rows = [];
    for (const item of items) {
      const response = answerFor(item, !plan.wrongIds.has(item.id));
      const score = autoScore(item, response);
      await db.response.create({ data: { attemptId: attempt.id, assessmentItemId: assessmentItemRowId(versionId, item.id), responseJson: response as never, autoScore: score } });
      rows.push({ itemId: item.id, independent: item.independent, kind: item.kind, autoScore: score, teacherScore: null, answered: true });
    }
    const sum = computeScores(rows);
    await db.attempt.update({ where: { id: attempt.id }, data: { submittedAt: new Date(), score: sum.score, reviewStatus: sum.needsReview ? "NEEDS_REVIEW" : "NONE" } });
  }
}
