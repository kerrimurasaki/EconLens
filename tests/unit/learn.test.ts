import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoProvider } from "@/server/ai/demo";
import { SCENARIO_LENSES } from "@/server/ai/demoFixtures";
import { assembleDocument } from "@/server/generation/assemble";
import { buildDemoExperience, type GenContext, type GenLens } from "@/server/generation/templates";
import { toStudentView } from "@/server/generation/studentView";
import { assessmentItemRowId } from "@/server/generation/derived";
import { DEFAULT_BLUEPRINT, type ExperienceDocument } from "@/schemas/experience";
import { autoScore, computeScenario, computeScores, parseResponse } from "@/server/learn/scoring";
import { generateJoinCode, normalizeCode } from "@/server/classes";

void createDemoProvider;

const mockDb = vi.hoisted(() => ({
  assignment: { findFirst: vi.fn(), findMany: vi.fn() },
  attempt: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }), upsert: vi.fn() },
  response: { upsert: vi.fn(), findMany: vi.fn() },
  classroom: { findFirst: vi.fn() },
  classEnrollment: { upsert: vi.fn() },
  auditEvent: { create: vi.fn() },
}));
vi.mock("@/server/db", () => ({ db: mockDb }));

import { getFeedback, getLearnView, loadStudentAssignment, saveResponse, submitAttempt } from "@/server/learn/student";
import { joinClass } from "@/server/classes";

const toLens = (l: (typeof SCENARIO_LENSES)["carbon_tax"][number]): GenLens => ({
  key: l.conceptKey, name: l.conceptKey, mechanism: l.mechanism, prerequisites: l.prerequisites, misconceptions: l.misconceptions, limitations: l.limitations,
  inquiryQuestion: l.inquiryQuestion, alternativeLens: l.alternativeLens, corrections: l.misconceptionCorrections,
});
const all = SCENARIO_LENSES.carbon_tax.map(toLens);
const ctx: GenContext = {
  title: "T", summary: "S", essentialQuestion: "Q?", blueprint: DEFAULT_BLUEPRINT, objectives: [{ id: "o1", code: "A", title: "a" }, { id: "o2", code: "B", title: "b" }, { id: "o3", code: "C", title: "c" }],
  selected: all.slice(0, 2), allLenses: all, claims: [], stakeholders: [], unknowns: [], sources: [],
};
const doc: ExperienceDocument = assembleDocument({ title: "T", essentialQuestion: "Q?", blueprint: DEFAULT_BLUEPRINT, objectiveIds: ["o1", "o2", "o3"], blocks: buildDemoExperience(ctx).blocks, sources: [] });
const student = { id: "s1", tenantId: "A", role: "STUDENT" as const };
const items = doc.blocks.flatMap((b) => b.items);
const independent = items.filter((i) => i.independent);
const version = { id: "v1", contentJson: doc, isPublished: true };
const assignmentRow = { id: "a1", publishedVersionId: "v1", publishedVersion: version, experience: { title: "T" }, classroom: { name: "C" }, feedbackMode: "after_submit", feedbackReleasedAt: null };

beforeEach(() => { vi.clearAllMocks(); });

describe("scoring", () => {
  it("validates answers against the item definition", () => {
    const mcq = items.find((i) => i.kind === "mcq")!;
    expect(() => parseResponse(mcq, { optionIds: ["zzz"] })).toThrow();
    expect(() => parseResponse(mcq, { optionIds: [mcq.options[0]!.id, mcq.options[1]!.id] })).toThrow();
    expect(() => parseResponse(mcq, { value: 3 })).toThrow();
    expect(parseResponse(mcq, { optionIds: [mcq.options[0]!.id] })).toEqual({ optionIds: [mcq.options[0]!.id] });
    const num = items.find((i) => i.kind === "numeric")!;
    expect(() => parseResponse(num, { value: "x" })).toThrow();
    expect(() => parseResponse(num, { value: Infinity })).toThrow();
    expect(() => parseResponse(items.find((i) => i.kind === "short")!, { text: "x".repeat(3001) })).toThrow();
  });

  it("scores mcq, multi (exact set) and numeric with tolerance; short answers wait for a teacher", () => {
    const mcq = items.find((i) => i.kind === "mcq")!;
    expect(autoScore(mcq, { optionIds: mcq.teacher.correctOptionIds })).toBe(1);
    expect(autoScore(mcq, { optionIds: [mcq.options.find((o) => !mcq.teacher.correctOptionIds.includes(o.id))!.id] })).toBe(0);
    const multi = items.find((i) => i.kind === "multi")!;
    expect(autoScore(multi, { optionIds: [...multi.teacher.correctOptionIds].reverse() })).toBe(1);
    expect(autoScore(multi, { optionIds: multi.teacher.correctOptionIds.slice(0, 1) })).toBe(0);
    const num = items.find((i) => i.kind === "numeric")!;
    const ans = num.teacher.numericAnswer!;
    expect(autoScore(num, { value: ans + 0.1 })).toBe(1);
    expect(autoScore(num, { value: ans + 0.5 })).toBe(0);
    expect(autoScore(items.find((i) => i.kind === "short")!, { text: "x" })).toBeNull();
  });

  it("computes independent mastery; unanswered counts as zero; pending short answers flag review", () => {
    const rows = independent.map((i, n) => ({ itemId: i.id, independent: true, kind: i.kind, autoScore: n === 0 ? 1 : 0, teacherScore: null, answered: true }));
    const s = computeScores(rows);
    expect(s.score).toBeCloseTo(1 / independent.length);
    expect(computeScores([{ itemId: "x", independent: true, kind: "mcq", autoScore: null, teacherScore: null, answered: false }]).score).toBe(0);
    const pending = computeScores([{ itemId: "p", independent: false, kind: "short", autoScore: null, teacherScore: null, answered: true }]);
    expect(pending.needsReview).toBe(true);
    expect(computeScores([{ itemId: "p", independent: false, kind: "short", autoScore: null, teacherScore: 0.5, answered: true }]).needsReview).toBe(false);
  });

  it("scenario engine is order-enforced and server-authoritative", () => {
    const sc = doc.blocks.find((b) => b.scenario)!.scenario!;
    const [d1, d2] = sc.decisions;
    const r1 = computeScenario(sc, [{ decisionId: d1!.id, optionId: d1!.options[0]!.id }]);
    expect(r1.complete).toBe(false);
    expect(r1.values.emissions).toBe(96);
    const r2 = computeScenario(sc, [{ decisionId: d1!.id, optionId: d1!.options[0]!.id }, { decisionId: d2!.id, optionId: d2!.options[1]!.id }]);
    expect(r2.complete).toBe(true);
    expect(() => computeScenario(sc, [{ decisionId: d2!.id, optionId: d2!.options[0]!.id }])).toThrow(); // out of order
    expect(() => computeScenario(sc, [{ decisionId: d1!.id, optionId: "nope" }])).toThrow();
    // different choices give different outcomes
    const alt = computeScenario(sc, [{ decisionId: d1!.id, optionId: d1!.options[1]!.id }]);
    expect(alt.values.emissions).not.toBe(r1.values.emissions);
  });
});

describe("student view scopes (T5)", () => {
  it("the activity excludes the independent check; the check contains only it", () => {
    const learn = toStudentView(doc, "learn");
    const check = toStudentView(doc, "check");
    expect(learn.blocks.some((b) => b.type === "EXIT_TICKET")).toBe(false);
    expect(learn.blocks.flatMap((b) => b.items).every((i) => !i.independent)).toBe(true);
    expect(check.blocks.every((b) => b.type === "EXIT_TICKET")).toBe(true);
    expect(check.blocks.flatMap((b) => b.items).length).toBe(independent.length);
  });

  it("never serialises keys, notes, scenario effects, explanations or the debrief", () => {
    const json = JSON.stringify(toStudentView(doc, "learn")) + JSON.stringify(toStudentView(doc, "check"));
    for (const k of ["teacherNotes", "correctOptionIds", "numericAnswer", "tolerance", "rationale", "rubric", "computation", "effects", "explanation", "debrief", "delta", "edited"]) expect(json).not.toContain(`"${k}"`);
    const sc = doc.blocks.find((b) => b.scenario)!.scenario!;
    expect(json).not.toContain(sc.debrief);
    for (const d of sc.decisions) for (const o of d.options) expect(json).not.toContain(o.explanation);
  });
});

describe("student access control (T5, T9)", () => {
  it("only students may load assignments, and the query is scoped to tenant, enrolment, published and open", async () => {
    await expect(loadStudentAssignment({ id: "t", tenantId: "A", role: "TEACHER" }, "a1")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(loadStudentAssignment(null, "a1")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    mockDb.assignment.findFirst.mockResolvedValueOnce(null);
    await expect(loadStudentAssignment(student, "a1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const where = mockDb.assignment.findFirst.mock.calls[0]![0].where;
    expect(where.status).toBe("OPEN");
    expect(where.publishedVersion).toEqual({ isPublished: true });
    expect(where.classroom).toEqual({ tenantId: "A", enrollments: { some: { studentId: "s1" } } });
  });

  it("getLearnView returns no teacher data even from a document containing it", async () => {
    mockDb.assignment.findFirst.mockResolvedValue(assignmentRow);
    mockDb.attempt.findUnique.mockResolvedValue(null);
    const v = await getLearnView(student, "a1", "learn");
    const json = JSON.stringify(v);
    expect(json).not.toContain("correctOptionIds");
    expect(json).not.toContain("teacherNotes");
    expect(json).not.toContain(independent[0]!.prompt);
  });

  it("an attempt belonging to another student is not found", async () => {
    mockDb.attempt.findFirst.mockResolvedValueOnce(null);
    await expect(saveResponse(student, "other", { itemId: items[0]!.id, response: { optionIds: ["a"] } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.attempt.findFirst.mock.calls[0]![0].where.studentId).toBe("s1");
  });

  it("saving an answer does not echo the score and rejects invalid answers and submitted attempts", async () => {
    const mcq = items.find((i) => i.kind === "mcq")!;
    const attempt = { id: "t1", submittedAt: null, assignment: { publishedVersionId: "v1", publishedVersion: version } };
    mockDb.attempt.findFirst.mockResolvedValue(attempt);
    const res = await saveResponse(student, "t1", { itemId: mcq.id, response: { optionIds: mcq.teacher.correctOptionIds } });
    expect(res).toEqual({ saved: true });
    expect(mockDb.response.upsert.mock.calls[0]![0].create.autoScore).toBe(1);
    expect(mockDb.response.upsert.mock.calls[0]![0].create.assessmentItemId).toBe(assessmentItemRowId("v1", mcq.id));
    await expect(saveResponse(student, "t1", { itemId: mcq.id, response: { optionIds: ["zzz"] } })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(saveResponse(student, "t1", { itemId: "nope", response: { optionIds: ["a"] } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    mockDb.attempt.findFirst.mockResolvedValue({ ...attempt, submittedAt: new Date() });
    await expect(saveResponse(student, "t1", { itemId: mcq.id, response: { optionIds: mcq.teacher.correctOptionIds } })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("submit stores a mastery score and is idempotent", async () => {
    const attempt = { id: "t1", submittedAt: null, assignment: { publishedVersionId: "v1", publishedVersion: version } };
    mockDb.attempt.findFirst.mockResolvedValue(attempt);
    mockDb.response.findMany.mockResolvedValue(independent.map((i) => ({ assessmentItemId: assessmentItemRowId("v1", i.id), autoScore: 1, teacherScore: null })));
    await submitAttempt(student, "t1");
    const data = mockDb.attempt.updateMany.mock.calls[0]![0].data;
    expect(mockDb.attempt.updateMany.mock.calls[0]![0].where.submittedAt).toBeNull(); // only the first submit wins
    expect(data.score).toBe(1);
    expect(data.submittedAt).toBeInstanceOf(Date);
    mockDb.attempt.findFirst.mockResolvedValue({ ...attempt, submittedAt: new Date() });
    expect(await submitAttempt(student, "t1")).toMatchObject({ alreadySubmitted: true });
  });
});

describe("feedback release (T5)", () => {
  const submitted = { submittedAt: new Date(), score: 0.5, responses: [] };
  it("returns nothing before submission", async () => {
    mockDb.assignment.findFirst.mockResolvedValue(assignmentRow);
    mockDb.attempt.findUnique.mockResolvedValue({ ...submitted, submittedAt: null });
    expect(await getFeedback(student, "a1")).toEqual({ status: "not_submitted" });
    mockDb.attempt.findUnique.mockResolvedValue(null);
    expect(await getFeedback(student, "a1")).toEqual({ status: "not_submitted" });
  });

  it("withholds keys when the teacher holds feedback, and releases them afterwards", async () => {
    mockDb.attempt.findUnique.mockResolvedValue(submitted);
    mockDb.assignment.findFirst.mockResolvedValue({ ...assignmentRow, feedbackMode: "manual" });
    const held = await getFeedback(student, "a1");
    expect(held).toEqual({ status: "withheld" });
    mockDb.assignment.findFirst.mockResolvedValue({ ...assignmentRow, feedbackMode: "manual", feedbackReleasedAt: new Date() });
    const rel = await getFeedback(student, "a1");
    expect(rel.status).toBe("released");
    expect(JSON.stringify(rel)).toContain(independent[0]!.teacher.rationale.slice(0, 20));
    expect(JSON.stringify(rel)).not.toContain("teacherNotes");
  });
});

describe("classes", () => {
  it("join codes use an unambiguous alphabet and are unpredictable", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateJoinCode()));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(normalizeCode(" ab-cd 23 ")).toBe("ABCD23");
  });

  it("only students join; wrong, expired and other-tenant codes get the same answer", async () => {
    await expect(joinClass({ id: "t", tenantId: "A", role: "TEACHER" }, { code: "ABCDEFGH" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    mockDb.classroom.findFirst.mockResolvedValueOnce(null);
    const missing = await joinClass(student, { code: "ABCDEFGH" }).catch((e) => e);
    expect(mockDb.classroom.findFirst.mock.calls[0]![0].where).toEqual({ joinCode: "ABCDEFGH", tenantId: "A" });
    mockDb.classroom.findFirst.mockResolvedValueOnce({ id: "c1", name: "C", joinExpiresAt: new Date(Date.now() - 1000) });
    const expired = await joinClass(student, { code: "ABCDEFGH" }).catch((e) => e);
    expect(expired.message).toBe(missing.message);
    expect(expired.code).toBe("NOT_FOUND");
    mockDb.classroom.findFirst.mockResolvedValueOnce({ id: "c1", name: "C", joinExpiresAt: new Date(Date.now() + 100000) });
    expect(await joinClass(student, { code: "abcd-efgh" })).toEqual({ classId: "c1", name: "C" });
    expect(mockDb.classEnrollment.upsert).toHaveBeenCalled();
  });
});
