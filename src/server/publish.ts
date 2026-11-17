import { db } from "./db";
import { AppError } from "./errors";
import { recordAudit } from "./audit";
import { assertRole, TEACHING_ROLES, type SessionUser } from "./auth/policy";
import { getDraft } from "./builder";
import { loadManagedClass } from "./classes";
import { publishSchema } from "@/schemas/classes";

/**
 * Publishes the current draft version as an immutable snapshot and assigns it to a class.
 * Gated by the deterministic quality check (FR-16). Idempotent: repeating it for the same version and class
 * returns the existing assignment. Later edits create NEW versions; the published row is never updated again.
 */
export async function publishExperience(user: SessionUser | null | undefined, experienceId: string, raw: unknown) {
  assertRole(user, TEACHING_ROLES);
  const body = publishSchema.parse(raw);
  const d = await getDraft(user, experienceId);
  if (!d.doc || !d.version || !d.validation) throw new AppError("VALIDATION", "There is no draft to publish.");
  if (!d.validation.passed) {
    throw new AppError("VALIDATION", `The quality check found ${d.validation.blocking.length} blocking issue(s). Fix them in the builder before publishing.`);
  }
  const cls = await loadManagedClass(user, body.classId);
  const version = await db.experienceVersion.findFirstOrThrow({ where: { experienceId, versionNumber: d.version } });

  const assignment = await db.$transaction(async (tx) => {
    if (!version.isPublished) {
      await tx.experienceVersion.update({ where: { id: version.id }, data: { isPublished: true, publishedAt: new Date(), publishedBy: user.id } });
    }
    await tx.experience.update({ where: { id: experienceId }, data: { status: "PUBLISHED" } });
    const existing = await tx.assignment.findUnique({
      where: { experienceId_publishedVersionId_classId: { experienceId, publishedVersionId: version.id, classId: cls.id } },
    });
    if (existing) return existing;
    return tx.assignment.create({
      data: {
        experienceId, publishedVersionId: version.id, classId: cls.id, status: "OPEN",
        dueAt: body.dueAt ? new Date(body.dueAt) : null, feedbackMode: body.feedbackMode,
      },
    });
  }).catch(async (e) => {
    if ((e as { code?: string }).code !== "P2002") throw e;
    // A concurrent publish created it first: return that one (idempotent).
    return db.assignment.findUniqueOrThrow({ where: { experienceId_publishedVersionId_classId: { experienceId, publishedVersionId: version.id, classId: cls.id } } });
  });
  await recordAudit(user, "experience.publish", "Assignment", assignment.id, { version: d.version, classId: cls.id });
  return { assignmentId: assignment.id, version: d.version, joinCode: cls.joinCode };
}

export async function getPublishState(user: SessionUser | null | undefined, experienceId: string) {
  assertRole(user, TEACHING_ROLES);
  const d = await getDraft(user, experienceId);
  const classes = await db.classroom.findMany({
    where: { tenantId: user.tenantId, ...(user.role === "TEACHER" ? { teacherId: user.id } : {}) }, orderBy: { name: "asc" },
    select: { id: true, name: true, joinCode: true, joinExpiresAt: true, _count: { select: { enrollments: true } } },
  });
  const assignments = await db.assignment.findMany({
    where: { experienceId }, orderBy: { createdAt: "desc" },
    include: { classroom: { select: { name: true } }, publishedVersion: { select: { versionNumber: true } }, _count: { select: { attempts: true } } },
  });
  const current = d.version ? await db.experienceVersion.findFirst({ where: { experienceId, versionNumber: d.version }, select: { isPublished: true } }) : null;
  return { d, classes, assignments, currentIsPublished: Boolean(current?.isPublished) };
}

/** Closes an assignment: students can no longer open, save or submit. Existing attempts and results are kept. */
export async function closeAssignment(user: SessionUser | null | undefined, assignmentId: string) {
  assertRole(user, TEACHING_ROLES);
  const a = await db.assignment.findFirst({ where: { id: assignmentId, classroom: { tenantId: user.tenantId, ...(user.role === "TEACHER" ? { teacherId: user.id } : {}) } } });
  if (!a) throw new AppError("NOT_FOUND", "Not found.");
  await db.assignment.update({ where: { id: a.id }, data: { status: "CLOSED" } });
  await recordAudit(user, "assignment.close", "Assignment", a.id);
  return { ok: true };
}
