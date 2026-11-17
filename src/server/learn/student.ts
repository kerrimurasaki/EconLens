import { db } from "../db";
import { AppError } from "../errors";
import { assertRole, type SessionUser } from "../auth/policy";
import { recordAudit } from "../audit";
import { assessmentItemRowId } from "../generation/derived";
import { toStudentView, type StudentScope } from "../generation/studentView";
import { documentSchema, type ExperienceDocument, type Item } from "@/schemas/experience";
import { saveResponseSchema, scenarioChoiceSchema, scenarioResetSchema } from "@/schemas/classes";
import { autoScore, computeScenario, computeScores, parseResponse, type ItemResponse, type ScoreRow } from "./scoring";
import type { Prisma } from "@/generated/prisma/client";

type Choice = { decisionId: string; optionId: string };
type AttemptState = { scenarios?: Record<string, { choices: Choice[] }> };

function parseDoc(json: unknown): ExperienceDocument {
  const r = documentSchema.safeParse(json);
  if (!r.success) throw new AppError("INTERNAL", "This activity is unavailable.");
  return r.data;
}
const allItems = (doc: ExperienceDocument) => doc.blocks.flatMap((b) => b.items);

/** Assignment visible to this student: same tenant, enrolled, open, published snapshot. Anything else is NOT_FOUND. */
export async function loadStudentAssignment(user: SessionUser | null | undefined, assignmentId: string) {
  assertRole(user, ["STUDENT"]);
  const a = await db.assignment.findFirst({
    where: {
      id: assignmentId, status: "OPEN", startAt: { lte: new Date() }, publishedVersion: { isPublished: true },
      classroom: { tenantId: user.tenantId, enrollments: { some: { studentId: user.id } } },
    },
    include: { publishedVersion: true, experience: { select: { title: true } }, classroom: { select: { name: true } } },
  });
  if (!a) throw new AppError("NOT_FOUND", "Not found.");
  return a;
}

/** Loads an attempt owned by this student on a still-open assignment. */
async function loadOwnAttempt(user: SessionUser | null | undefined, attemptId: string) {
  assertRole(user, ["STUDENT"]);
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, studentId: user.id, assignment: { status: "OPEN", classroom: { tenantId: user.tenantId, enrollments: { some: { studentId: user.id } } } } },
    include: { assignment: { include: { publishedVersion: true } } },
  });
  if (!attempt) throw new AppError("NOT_FOUND", "Not found.");
  return attempt;
}

export async function listMyAssignments(user: SessionUser | null | undefined) {
  assertRole(user, ["STUDENT"]);
  const rows = await db.assignment.findMany({
    where: { status: "OPEN", startAt: { lte: new Date() }, publishedVersion: { isPublished: true }, classroom: { tenantId: user.tenantId, enrollments: { some: { studentId: user.id } } } },
    orderBy: { createdAt: "desc" },
    include: { experience: { select: { title: true } }, classroom: { select: { name: true } }, attempts: { where: { studentId: user.id }, select: { id: true, submittedAt: true } } },
  });
  return rows.map((a) => ({
    id: a.id, title: a.experience.title, className: a.classroom.name, dueAt: a.dueAt?.toISOString() ?? null,
    state: a.attempts[0] ? (a.attempts[0].submittedAt ? ("submitted" as const) : ("in_progress" as const)) : ("not_started" as const),
  }));
}

export async function startAttempt(user: SessionUser | null | undefined, assignmentId: string) {
  const a = await loadStudentAssignment(user, assignmentId);
  const key = { assignmentId_studentId: { assignmentId: a.id, studentId: user!.id } };
  const attempt = await db.attempt.upsert({ where: key, update: {}, create: { assignmentId: a.id, studentId: user!.id } }).catch(async (e) => {
    if ((e as { code?: string }).code === "P2002") return db.attempt.findUniqueOrThrow({ where: key }); // two tabs started at once
    throw e;
  });
  return { attemptId: attempt.id };
}

function scenarioViews(doc: ExperienceDocument, state: AttemptState) {
  const out: Record<string, { values: Record<string, number>; steps: Array<{ decisionId: string; optionId: string; label: string; explanation: string }>; complete: boolean; debrief: string | null }> = {};
  for (const b of doc.blocks) {
    if (!b.scenario) continue;
    const s = computeScenario(b.scenario, state.scenarios?.[b.id]?.choices ?? []);
    out[b.id] = { ...s, debrief: s.complete ? b.scenario.debrief : null };
  }
  return out;
}

/**
 * Student activity ("learn") or independent check ("check"). Answer keys, rubrics, notes and the exit ticket
 * (outside the check scope) are never included; scenario outcomes are revealed only for decisions already made.
 */
export async function getLearnView(user: SessionUser | null | undefined, assignmentId: string, scope: Exclude<StudentScope, "all">) {
  const a = await loadStudentAssignment(user, assignmentId);
  const doc = parseDoc(a.publishedVersion.contentJson);
  const attempt = await db.attempt.findUnique({ where: { assignmentId_studentId: { assignmentId: a.id, studentId: user!.id } }, include: { responses: true } });
  const view = toStudentView(doc, scope);
  const visibleItems = new Set(view.blocks.flatMap((b) => b.items.map((i) => assessmentItemRowId(a.publishedVersionId, i.id))));
  const responses: Record<string, unknown> = {};
  for (const r of attempt?.responses ?? []) if (visibleItems.has(r.assessmentItemId)) responses[r.assessmentItemId.slice(a.publishedVersionId.length + 1)] = r.responseJson;
  return {
    assignmentId: a.id, title: a.experience.title, className: a.classroom.name, doc: view,
    attempt: attempt ? { id: attempt.id, submitted: Boolean(attempt.submittedAt) } : null,
    responses,
    scenarios: attempt ? scenarioViews(doc, (attempt.stateJson ?? {}) as AttemptState) : {},
  };
}

export async function saveResponse(user: SessionUser | null | undefined, attemptId: string, raw: unknown) {
  const body = saveResponseSchema.parse(raw);
  const attempt = await loadOwnAttempt(user, attemptId);
  if (attempt.submittedAt) throw new AppError("CONFLICT", "This activity has already been submitted.");
  const doc = parseDoc(attempt.assignment.publishedVersion.contentJson);
  const item = allItems(doc).find((i) => i.id === body.itemId);
  if (!item) throw new AppError("NOT_FOUND", "Question not found.");
  const response = parseResponse(item, body.response);
  const rowId = assessmentItemRowId(attempt.assignment.publishedVersionId, item.id);
  const score = autoScore(item, response);
  await db.response.upsert({
    where: { attemptId_assessmentItemId: { attemptId: attempt.id, assessmentItemId: rowId } },
    update: { responseJson: response as Prisma.InputJsonValue, autoScore: score, teacherScore: null, feedbackJson: undefined },
    create: { attemptId: attempt.id, assessmentItemId: rowId, responseJson: response as Prisma.InputJsonValue, autoScore: score },
  });
  return { saved: true }; // never echo the score: that would reveal the answer key
}

async function loadScenarioContext(user: SessionUser | null | undefined, attemptId: string, blockId: string) {
  const attempt = await loadOwnAttempt(user, attemptId);
  if (attempt.submittedAt) throw new AppError("CONFLICT", "This activity has already been submitted.");
  const doc = parseDoc(attempt.assignment.publishedVersion.contentJson);
  const block = doc.blocks.find((b) => b.id === blockId && b.scenario);
  if (!block?.scenario) throw new AppError("NOT_FOUND", "Scenario not found.");
  return { attempt, block, scenario: block.scenario, state: (attempt.stateJson ?? {}) as AttemptState };
}

/** Records the next decision of the branching scenario. Order is enforced; the server computes the outcome. */
export async function chooseScenario(user: SessionUser | null | undefined, attemptId: string, raw: unknown) {
  const body = scenarioChoiceSchema.parse(raw);
  const { attempt, block, scenario, state } = await loadScenarioContext(user, attemptId, body.blockId);
  const choices = state.scenarios?.[block.id]?.choices ?? [];
  const next = scenario.decisions[choices.length];
  if (!next || next.id !== body.decisionId) throw new AppError("CONFLICT", "That decision is not available now.");
  const updated = [...choices, { decisionId: body.decisionId, optionId: body.optionId }];
  const result = computeScenario(scenario, updated); // throws VALIDATION for an unknown option
  await db.attempt.update({ where: { id: attempt.id }, data: { stateJson: { ...state, scenarios: { ...state.scenarios, [block.id]: { choices: updated } } } as Prisma.InputJsonValue } });
  return { ...result, debrief: result.complete ? scenario.debrief : null };
}

export async function resetScenario(user: SessionUser | null | undefined, attemptId: string, raw: unknown) {
  const body = scenarioResetSchema.parse(raw);
  const { attempt, block, scenario, state } = await loadScenarioContext(user, attemptId, body.blockId);
  const { [block.id]: _dropped, ...rest } = state.scenarios ?? {};
  void _dropped;
  await db.attempt.update({ where: { id: attempt.id }, data: { stateJson: { ...state, scenarios: rest } as Prisma.InputJsonValue } });
  return { ...computeScenario(scenario, []), debrief: null };
}

export async function submitAttempt(user: SessionUser | null | undefined, attemptId: string) {
  const attempt = await loadOwnAttempt(user, attemptId);
  if (attempt.submittedAt) return { submitted: true, alreadySubmitted: true };
  const doc = parseDoc(attempt.assignment.publishedVersion.contentJson);
  const vId = attempt.assignment.publishedVersionId;
  const responses = await db.response.findMany({ where: { attemptId: attempt.id } });
  const byItem = new Map(responses.map((r) => [r.assessmentItemId, r]));
  const rows: ScoreRow[] = allItems(doc).map((i) => {
    const r = byItem.get(assessmentItemRowId(vId, i.id));
    return { itemId: i.id, independent: i.independent, kind: i.kind, autoScore: r?.autoScore ?? null, teacherScore: r?.teacherScore ?? null, answered: Boolean(r) };
  });
  const s = computeScores(rows);
  // Conditional update: only the first submit wins, so a concurrent save cannot slip in an unscored answer afterwards.
  const done = await db.attempt.updateMany({ where: { id: attempt.id, submittedAt: null }, data: { submittedAt: new Date(), score: s.score, reviewStatus: s.needsReview ? "NEEDS_REVIEW" : "NONE" } });
  if (done.count === 0) return { submitted: true, alreadySubmitted: true };
  await recordAudit(user!, "attempt.submit", "Attempt", attempt.id);
  return { submitted: true, alreadySubmitted: false };
}

function optionTexts(item: Item, ids: string[]) {
  return ids.map((id) => item.options.find((o) => o.id === id)?.text ?? id);
}

/** Answer keys and explanations: only after submission and only when the teacher's setting allows it. */
export async function getFeedback(user: SessionUser | null | undefined, assignmentId: string) {
  const a = await loadStudentAssignment(user, assignmentId);
  const attempt = await db.attempt.findUnique({ where: { assignmentId_studentId: { assignmentId: a.id, studentId: user!.id } }, include: { responses: true } });
  if (!attempt?.submittedAt) return { status: "not_submitted" as const };
  const released = a.feedbackMode === "after_submit" || Boolean(a.feedbackReleasedAt);
  if (!released) return { status: "withheld" as const };

  const doc = parseDoc(a.publishedVersion.contentJson);
  const byItem = new Map(attempt.responses.map((r) => [r.assessmentItemId, r]));
  const items = doc.blocks.flatMap((b) => b.items.map((item) => ({ item, block: b })));
  return {
    status: "released" as const,
    score: attempt.score,
    items: items.map(({ item, block }) => {
      const r = byItem.get(assessmentItemRowId(a.publishedVersionId, item.id));
      const resp = (r?.responseJson ?? null) as ItemResponse | null;
      const eff = r?.teacherScore ?? r?.autoScore ?? null;
      return {
        id: item.id, section: block.type === "EXIT_TICKET" ? "Independent check" : "Practice", prompt: item.prompt, kind: item.kind,
        yourAnswer: !resp ? null : "optionIds" in resp ? optionTexts(item, resp.optionIds).join("; ") : "value" in resp ? `${resp.value}${item.unit ? ` ${item.unit}` : ""}` : "text" in resp ? resp.text : null,
        result: eff === null ? (item.kind === "short" ? ("awaiting_teacher" as const) : ("unanswered" as const)) : eff >= 1 ? ("correct" as const) : eff > 0 ? ("partial" as const) : ("incorrect" as const),
        correctAnswer: item.kind === "mcq" || item.kind === "multi" ? optionTexts(item, item.teacher.correctOptionIds).join("; ") : item.kind === "numeric" ? `${item.teacher.numericAnswer}${item.unit ? ` ${item.unit}` : ""}` : null,
        explanation: item.teacher.rationale,
        teacherFeedback: ((r?.feedbackJson ?? null) as { text?: string } | null)?.text ?? null,
      };
    }),
  };
}
