import { db } from "../db";
import { AppError } from "../errors";
import { recordAudit } from "../audit";
import { assertRole, TEACHING_ROLES, type SessionUser } from "../auth/policy";
import { loadOwnedExperience } from "../events";
import { assessmentItemRowId } from "../generation/derived";
import { documentSchema, type ExperienceDocument } from "@/schemas/experience";
import { scoreResponseSchema } from "@/schemas/classes";
import { computeScenario, computeScores, type ItemResponse, type ScoreRow } from "./scoring";

const parseDoc = (json: unknown): ExperienceDocument => {
  const r = documentSchema.safeParse(json);
  if (!r.success) throw new AppError("INTERNAL", "Stored experience is unreadable.");
  return r.data;
};

export interface AssignmentInsights {
  assignmentId: string;
  className: string;
  version: number;
  feedbackMode: string;
  feedbackReleased: boolean;
  enrolled: number;
  started: number;
  submitted: number;
  nonSubmitters: Array<{ name: string; state: "not started" | "in progress" }>;
  averageIndependentScore: number | null;
  items: Array<{ itemId: string; section: string; prompt: string; objective: string; kind: string; submittedCount: number; correctRate: number | null; commonWrong: string | null }>;
  objectives: Array<{ code: string; correctRate: number | null; items: number }>;
  scenarios: Array<{ title: string; completed: number; choices: Array<{ decision: string; options: Array<{ label: string; count: number }> }> }>;
  reviewQueue: Array<{ responseId: string; student: string; prompt: string; answer: string; rubric: string[]; scored: boolean }>;
}

const effective = (r?: { autoScore: number | null; teacherScore: number | null }) => r?.teacherScore ?? r?.autoScore ?? null;

export async function getInsights(user: SessionUser | null | undefined, experienceId: string): Promise<AssignmentInsights[]> {
  const exp = await loadOwnedExperience(user, experienceId);
  const assignments = await db.assignment.findMany({
    where: { experienceId: exp.id, ...(user!.role === "TEACHER" ? { classroom: { teacherId: user!.id } } : {}) }, orderBy: { createdAt: "desc" },
    include: {
      publishedVersion: true,
      classroom: { include: { enrollments: { include: { student: { select: { id: true, name: true } } } } } },
      attempts: { include: { responses: true, student: { select: { id: true, name: true } } } },
    },
  });

  const objectives = await db.curriculumObjective.findMany({ where: { tenantId: user!.tenantId }, select: { id: true, code: true } });
  const codeOf = (id: string) => objectives.find((o) => o.id === id)?.code ?? "?";

  return assignments.map((a) => {
    const doc = parseDoc(a.publishedVersion.contentJson);
    const items = doc.blocks.flatMap((b) => b.items.map((item) => ({ item, block: b })));
    const submittedAttempts = a.attempts.filter((t) => t.submittedAt);
    const attemptByStudent = new Map(a.attempts.map((t) => [t.studentId, t]));

    const itemStats = items.map(({ item, block }) => {
      const rowId = assessmentItemRowId(a.publishedVersionId, item.id);
      const resps = submittedAttempts.map((t) => t.responses.find((r) => r.assessmentItemId === rowId));
      const scored = resps.map(effective);
      const markable = item.kind !== "short";
      const correctRate = submittedAttempts.length === 0 ? null : markable ? scored.reduce<number>((s, v) => s + (v ?? 0), 0) / submittedAttempts.length : (() => { const done = scored.filter((v): v is number => v !== null); return done.length ? done.reduce((s, v) => s + v, 0) / done.length : null; })();
      const wrong = new Map<string, number>();
      if (item.kind === "mcq" || item.kind === "multi") {
        for (const r of resps) {
          const resp = r?.responseJson as ItemResponse | undefined;
          if (!resp || !("optionIds" in resp) || effective(r) === 1) continue;
          for (const id of resp.optionIds) if (!item.teacher.correctOptionIds.includes(id)) wrong.set(id, (wrong.get(id) ?? 0) + 1);
        }
      }
      const top = [...wrong.entries()].sort((x, y) => y[1] - x[1])[0];
      return {
        itemId: item.id, section: block.type === "EXIT_TICKET" ? "Independent check" : "Practice", prompt: item.prompt, objective: codeOf(item.objectiveId), kind: item.kind,
        submittedCount: resps.filter(Boolean).length, correctRate,
        commonWrong: top ? `${item.options.find((o) => o.id === top[0])?.text ?? top[0]} (${top[1]})` : null,
      };
    });

    // concept-level: group item correctness by objective
    const byObjective = new Map<string, number[]>();
    for (const s of itemStats) if (s.correctRate !== null) byObjective.set(s.objective, [...(byObjective.get(s.objective) ?? []), s.correctRate]);
    const objectiveRows = [...byObjective.entries()].map(([id, rates]) => ({ code: id, correctRate: rates.reduce((x, y) => x + y, 0) / rates.length, items: rates.length }));

    const scenarioBlocks = doc.blocks.filter((b) => b.scenario);
    const scenarios = scenarioBlocks.map((b) => {
      const sc = b.scenario!;
      const counts = sc.decisions.map((d) => ({ decision: d.prompt, options: d.options.map((o) => ({ label: o.label, count: 0 })) }));
      let completed = 0;
      for (const t of a.attempts) {
        const choices = ((t.stateJson as { scenarios?: Record<string, { choices: Array<{ decisionId: string; optionId: string }> }> } | null)?.scenarios?.[b.id]?.choices) ?? [];
        try { if (computeScenario(sc, choices).complete) completed++; } catch { continue; }
        choices.forEach((c, i) => {
          const oi = sc.decisions[i]?.options.findIndex((o) => o.id === c.optionId) ?? -1;
          if (oi >= 0) counts[i]!.options[oi]!.count++;
        });
      }
      return { title: b.title, completed, choices: counts };
    });

    const reviewQueue: AssignmentInsights["reviewQueue"] = [];
    for (const t of submittedAttempts) {
      for (const { item } of items.filter((x) => x.item.kind === "short")) {
        const r = t.responses.find((x) => x.assessmentItemId === assessmentItemRowId(a.publishedVersionId, item.id));
        const resp = r?.responseJson as ItemResponse | undefined;
        if (r && resp && "text" in resp) reviewQueue.push({ responseId: r.id, student: t.student.name, prompt: item.prompt, answer: resp.text, rubric: item.teacher.rubric.filter(Boolean), scored: r.teacherScore !== null });
      }
    }

    const scores = submittedAttempts.map((t) => t.score).filter((s): s is number => s !== null);
    return {
      assignmentId: a.id, className: a.classroom.name, version: a.publishedVersion.versionNumber, feedbackMode: a.feedbackMode, feedbackReleased: a.feedbackMode === "after_submit" || Boolean(a.feedbackReleasedAt),
      enrolled: a.classroom.enrollments.length, started: a.attempts.length, submitted: submittedAttempts.length,
      nonSubmitters: a.classroom.enrollments.filter((e) => !attemptByStudent.get(e.studentId)?.submittedAt).map((e) => ({ name: e.student.name, state: attemptByStudent.has(e.studentId) ? ("in progress" as const) : ("not started" as const) })),
      averageIndependentScore: scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null,
      items: itemStats, objectives: objectiveRows, scenarios, reviewQueue,
    };
  });
}

/** Teacher marks (or overrides) one response, then the attempt score and review status are recomputed. */
export async function scoreResponse(user: SessionUser | null | undefined, responseId: string, raw: unknown) {
  assertRole(user, TEACHING_ROLES);
  const body = scoreResponseSchema.parse(raw);
  const r = await db.response.findFirst({
    where: { id: responseId, attempt: { assignment: { classroom: { tenantId: user.tenantId, ...(user.role === "TEACHER" ? { teacherId: user.id } : {}) } } } },
    include: { attempt: { include: { assignment: { include: { publishedVersion: true } }, responses: true } } },
  });
  if (!r) throw new AppError("NOT_FOUND", "Not found.");
  if (!r.attempt.submittedAt) throw new AppError("CONFLICT", "The student has not submitted yet.");
  await db.response.update({ where: { id: r.id }, data: { teacherScore: body.teacherScore, feedbackJson: body.feedback ? { text: body.feedback } : undefined } });

  const doc = parseDoc(r.attempt.assignment.publishedVersion.contentJson);
  const vId = r.attempt.assignment.publishedVersionId;
  const fresh = await db.response.findMany({ where: { attemptId: r.attemptId } });
  const rows: ScoreRow[] = doc.blocks.flatMap((b) => b.items).map((i) => {
    const x = fresh.find((f) => f.assessmentItemId === assessmentItemRowId(vId, i.id));
    return { itemId: i.id, independent: i.independent, kind: i.kind, autoScore: x?.autoScore ?? null, teacherScore: x?.teacherScore ?? null, answered: Boolean(x) };
  });
  const s = computeScores(rows);
  await db.attempt.update({ where: { id: r.attemptId }, data: { score: s.score, reviewStatus: s.needsReview ? "NEEDS_REVIEW" : "REVIEWED" } });
  await recordAudit(user, "response.score", "Response", r.id, { score: body.teacherScore });
  return { ok: true };
}

export async function releaseFeedback(user: SessionUser | null | undefined, assignmentId: string) {
  assertRole(user, TEACHING_ROLES);
  const a = await db.assignment.findFirst({ where: { id: assignmentId, classroom: { tenantId: user.tenantId, ...(user.role === "TEACHER" ? { teacherId: user.id } : {}) } } });
  if (!a) throw new AppError("NOT_FOUND", "Not found.");
  await db.assignment.update({ where: { id: a.id }, data: { feedbackReleasedAt: a.feedbackReleasedAt ?? new Date() } });
  await recordAudit(user, "feedback.release", "Assignment", a.id);
  return { ok: true };
}
