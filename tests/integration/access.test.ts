import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/auth/policy";
import { analyzeEvent, loadOwnedExperience, selectLenses, updateClaim } from "@/server/events";
import { generateDraft, getDraft, regenerateBlock, restoreVersion, saveBlueprint, saveDraft, validateCurrent } from "@/server/builder";
import { getPublishState, publishExperience } from "@/server/publish";
import { createClass, joinClass, rotateJoinCode } from "@/server/classes";
import { getFeedback, getLearnView, loadStudentAssignment, saveResponse, startAttempt, submitAttempt, chooseScenario } from "@/server/learn/student";
import { getInsights, releaseFeedback, scoreResponse } from "@/server/learn/insights";
import { deleteStudentData, runRetention } from "@/server/privacy";
import { listExperiences } from "@/server/experiences";

/**
 * T9: a DB-backed access-control matrix against the seeded demo data.
 * Every denied call must be rejected BEFORE any write, so this is safe to run on the dev database.
 * Skipped automatically when the database is not reachable.
 */
let reachable = false;
const ctx = {} as {
  teacher1: SessionUser; teacher2: SessionUser; admin: SessionUser; student1: SessionUser; student2: SessionUser; student3: SessionUser;
  outsiderTeacher: SessionUser; outsiderAdmin: SessionUser; outsiderStudent: SessionUser;
  experienceId: string; assignmentId: string; attemptId: string; responseId: string; blockId: string; claimId: string; classId: string; itemId: string; scenarioBlockId: string;
};

const asUser = async (email: string): Promise<SessionUser> => {
  const u = await db.user.findUniqueOrThrow({ where: { email } });
  return { id: u.id, tenantId: u.tenantId, role: u.role, name: u.name, email: u.email };
};

beforeAll(async () => {
  try {
    await db.$queryRaw`select 1`;
    reachable = true;
  } catch {
    return;
  }
  // A second institution with its own people.
  await db.tenant.upsert({ where: { id: "t-outsider" }, update: {}, create: { id: "t-outsider", name: "Outsider College (test)" } });
  for (const [email, role] of [["o-teacher@test.invalid", "TEACHER"], ["o-admin@test.invalid", "ADMIN"], ["o-student@test.invalid", "STUDENT"]] as const) {
    await db.user.upsert({ where: { email }, update: {}, create: { tenantId: "t-outsider", email, name: email, role, passwordHash: "x" } });
  }
  ctx.teacher1 = await asUser("teacher1@demo.econlens.test");
  ctx.teacher2 = await asUser("teacher2@demo.econlens.test");
  ctx.admin = await asUser("admin@demo.econlens.test");
  ctx.student1 = await asUser("student1@demo.econlens.test");
  ctx.student2 = await asUser("student2@demo.econlens.test");
  ctx.student3 = await asUser("student3@demo.econlens.test");
  ctx.outsiderTeacher = await asUser("o-teacher@test.invalid");
  ctx.outsiderAdmin = await asUser("o-admin@test.invalid");
  ctx.outsiderStudent = await asUser("o-student@test.invalid");
  const exp = await db.experience.findFirstOrThrow({ where: { isDemo: true }, include: { eventCase: { include: { claims: true } } } });
  ctx.experienceId = exp.id;
  ctx.claimId = exp.eventCase.claims[0]!.id;
  const a = await db.assignment.findFirstOrThrow({ where: { experienceId: exp.id } });
  ctx.assignmentId = a.id;
  ctx.classId = a.classId;
  const attempt = await db.attempt.findFirstOrThrow({ where: { assignmentId: a.id, studentId: ctx.student1.id }, include: { responses: true } });
  ctx.attemptId = attempt.id;
  ctx.responseId = attempt.responses[0]!.id;
  const doc = (await db.experienceVersion.findUniqueOrThrow({ where: { id: a.publishedVersionId } })).contentJson as { blocks: Array<{ id: string; scenario: unknown; items: Array<{ id: string }> }> };
  ctx.blockId = doc.blocks[0]!.id;
  ctx.scenarioBlockId = doc.blocks.find((b) => b.scenario)!.id;
  ctx.itemId = doc.blocks.flatMap((b) => b.items)[0]!.id;
});

afterAll(async () => {
  if (!reachable) return;
  await db.user.deleteMany({ where: { tenantId: "t-outsider" } });
  await db.tenant.deleteMany({ where: { id: "t-outsider" } });
  await db.$disconnect();
});

const guard = (name: string, fn: () => Promise<void>) => it(name, async (t) => { if (!reachable) return t.skip(); await fn(); });
const denied = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: { code?: string }) => x);
  expect(e, "call should have been denied").not.toBeNull();
  return e!.code;
};

describe("T9 teacher-side resources", () => {
  const body = { baseVersion: 1, doc: {} };
  const calls: Array<[string, (u: SessionUser | null) => Promise<unknown>]> = [
    ["loadOwnedExperience", (u) => loadOwnedExperience(u, ctx.experienceId)],
    ["getDraft", (u) => getDraft(u, ctx.experienceId)],
    ["validateCurrent", (u) => validateCurrent(u, ctx.experienceId)],
    ["saveDraft", (u) => saveDraft(u, ctx.experienceId, body)],
    ["regenerateBlock", (u) => regenerateBlock(u, ctx.experienceId, ctx.blockId, { baseVersion: 1 })],
    ["restoreVersion", (u) => restoreVersion(u, ctx.experienceId, { baseVersion: 1, versionNumber: 1 })],
    ["saveBlueprint", (u) => saveBlueprint(u, ctx.experienceId, {})],
    ["generateDraft", (u) => generateDraft(u, ctx.experienceId)],
    ["analyzeEvent", (u) => analyzeEvent(u, ctx.experienceId)],
    ["selectLenses", (u) => selectLenses(u, ctx.experienceId, {})],
    ["updateClaim", (u) => updateClaim(u, ctx.experienceId, ctx.claimId, { verificationStatus: "verified" })],
    ["getPublishState", (u) => getPublishState(u, ctx.experienceId)],
    ["publishExperience", (u) => publishExperience(u, ctx.experienceId, { classId: ctx.classId })],
    ["getInsights", (u) => getInsights(u, ctx.experienceId)],
    ["rotateJoinCode", (u) => rotateJoinCode(u, ctx.classId)],
    ["releaseFeedback", (u) => releaseFeedback(u, ctx.assignmentId)],
    ["scoreResponse", (u) => scoreResponse(u, ctx.responseId, { teacherScore: 1 })],
  ];

  for (const [name, call] of calls) {
    guard(`${name}: another teacher in the same tenant is denied`, async () => expect(await denied(call(ctx.teacher2))).toBe("NOT_FOUND"));
    guard(`${name}: a teacher and an admin from another tenant are denied`, async () => {
      expect(await denied(call(ctx.outsiderTeacher))).toBe("NOT_FOUND");
      expect(await denied(call(ctx.outsiderAdmin))).toBe("NOT_FOUND");
    });
    guard(`${name}: students and anonymous users are denied`, async () => {
      expect(await denied(call(ctx.student1))).toBe("FORBIDDEN");
      expect(await denied(call(ctx.outsiderStudent))).toBe("FORBIDDEN");
      expect(await denied(call(null))).toBe("UNAUTHENTICATED");
    });
  }

  guard("the experience list only shows a teacher's own work", async () => {
    expect((await listExperiences(ctx.teacher2)).some((e) => e.id === ctx.experienceId)).toBe(false);
    expect((await listExperiences(ctx.outsiderAdmin)).some((e) => e.id === ctx.experienceId)).toBe(false);
    expect((await listExperiences(ctx.teacher1)).some((e) => e.id === ctx.experienceId)).toBe(true);
  });

  guard("the owner and a same-tenant admin can read it", async () => {
    await expect(loadOwnedExperience(ctx.teacher1, ctx.experienceId)).resolves.toBeTruthy();
    await expect(loadOwnedExperience(ctx.admin, ctx.experienceId)).resolves.toBeTruthy();
  });

  guard("privacy controls are admin-only and tenant-scoped", async () => {
    expect(await denied(deleteStudentData(ctx.teacher1, ctx.student1.id))).toBe("FORBIDDEN");
    expect(await denied(deleteStudentData(ctx.student1, ctx.student2.id))).toBe("FORBIDDEN");
    expect(await denied(deleteStudentData(ctx.outsiderAdmin, ctx.student1.id))).toBe("NOT_FOUND");
    expect(await denied(runRetention(ctx.teacher1))).toBe("FORBIDDEN");
    expect(await denied(createClass(ctx.student1, { name: "x" }))).toBe("FORBIDDEN");
  });
});

describe("T9 student-side resources", () => {
  guard("a student from another tenant or a teacher cannot load or use the assignment", async () => {
    expect(await denied(loadStudentAssignment(ctx.outsiderStudent, ctx.assignmentId))).toBe("NOT_FOUND");
    expect(await denied(getLearnView(ctx.outsiderStudent, ctx.assignmentId, "learn"))).toBe("NOT_FOUND");
    expect(await denied(getFeedback(ctx.outsiderStudent, ctx.assignmentId))).toBe("NOT_FOUND");
    expect(await denied(startAttempt(ctx.outsiderStudent, ctx.assignmentId))).toBe("NOT_FOUND");
    expect(await denied(loadStudentAssignment(ctx.teacher1, ctx.assignmentId))).toBe("FORBIDDEN");
    expect(await denied(getFeedback(null, ctx.assignmentId))).toBe("UNAUTHENTICATED");
  });

  guard("a student cannot read, write, submit or play another student's attempt", async () => {
    const answer = { itemId: ctx.itemId, response: { optionIds: ["a"] } };
    expect(await denied(saveResponse(ctx.student2, ctx.attemptId, answer))).toBe("NOT_FOUND");
    expect(await denied(saveResponse(ctx.outsiderStudent, ctx.attemptId, answer))).toBe("NOT_FOUND");
    expect(await denied(submitAttempt(ctx.student2, ctx.attemptId))).toBe("NOT_FOUND");
    expect(await denied(chooseScenario(ctx.student2, ctx.attemptId, { blockId: ctx.scenarioBlockId, decisionId: "d1", optionId: "x" }))).toBe("NOT_FOUND");
    expect(await denied(saveResponse(ctx.teacher1, ctx.attemptId, answer))).toBe("FORBIDDEN");
  });

  guard("the owner of a submitted attempt cannot change it", async () => {
    expect(await denied(saveResponse(ctx.student1, ctx.attemptId, { itemId: ctx.itemId, response: { optionIds: ["a"] } }))).toMatch(/CONFLICT|VALIDATION/);
  });

  guard("a student from another tenant cannot join this class by code", async () => {
    const cls = await db.classroom.findUniqueOrThrow({ where: { id: ctx.classId } });
    expect(await denied(joinClass(ctx.outsiderStudent, { code: cls.joinCode }))).toBe("NOT_FOUND");
    expect(await db.classEnrollment.count({ where: { classId: ctx.classId, studentId: ctx.outsiderStudent.id } })).toBe(0);
  });

  guard("an enrolled student with no progress gets the activity with no teacher data and no scenario outcomes", async () => {
    const v = await getLearnView(ctx.student3, ctx.assignmentId, "learn");
    const json = JSON.stringify(v);
    for (const k of ["correctOptionIds", "teacherNotes", "numericAnswer", "rubric", "rationale", "effects", "debrief", "explanation", "delta"]) expect(json.includes(`"${k}"`), k).toBe(false);
    const check = JSON.stringify(await getLearnView(ctx.student3, ctx.assignmentId, "check"));
    expect(check.includes("correctOptionIds")).toBe(false);
  });

  guard("a student who finished the scenario sees only their own steps, never keys or notes", async () => {
    const json = JSON.stringify(await getLearnView(ctx.student1, ctx.assignmentId, "learn"));
    for (const k of ["correctOptionIds", "teacherNotes", "numericAnswer", "rubric", "rationale", "effects", "delta"]) expect(json.includes(`"${k}"`), k).toBe(false);
  });
});
