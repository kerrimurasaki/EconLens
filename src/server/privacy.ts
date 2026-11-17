import { db } from "./db";
import { AppError } from "./errors";
import { recordAudit } from "./audit";
import { assertRole, type SessionUser } from "./auth/policy";
import { z } from "zod";

export const DEFAULT_RETENTION_DAYS = 365;
const retentionSchema = z.object({ days: z.number().int().min(30).max(1825) });

export async function getRetentionDays(tenantId: string): Promise<number> {
  const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { settingsJson: true } });
  const v = (t?.settingsJson as { retentionDays?: number } | null)?.retentionDays;
  return typeof v === "number" ? v : DEFAULT_RETENTION_DAYS;
}

export async function setRetentionDays(user: SessionUser | null | undefined, raw: unknown) {
  assertRole(user, ["ADMIN"]);
  const { days } = retentionSchema.parse(raw);
  const t = await db.tenant.findUnique({ where: { id: user.tenantId }, select: { settingsJson: true } });
  await db.tenant.update({ where: { id: user.tenantId }, data: { settingsJson: { ...((t?.settingsJson as object | null) ?? {}), retentionDays: days } } });
  await recordAudit(user, "privacy.set_retention", "Tenant", user.tenantId, { days });
  return { days };
}

/** Deletes student attempts (and their responses, by cascade) that started before the retention cutoff. */
export async function purgeExpiredAttempts(tenantId: string, days: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const res = await db.attempt.deleteMany({ where: { startedAt: { lt: cutoff }, assignment: { classroom: { tenantId } } } });
  return { deleted: res.count, cutoff: cutoff.toISOString() };
}

export async function runRetention(user: SessionUser | null | undefined) {
  assertRole(user, ["ADMIN"]);
  const days = await getRetentionDays(user.tenantId);
  const r = await purgeExpiredAttempts(user.tenantId, days);
  await recordAudit(user, "privacy.run_retention", "Tenant", user.tenantId, { days, deleted: r.deleted });
  return { ...r, days };
}

/** Erases a student: account, enrolments, attempts and responses (all cascade). Audit keeps only the opaque id. */
export async function deleteStudentData(user: SessionUser | null | undefined, studentId: string) {
  assertRole(user, ["ADMIN"]);
  const s = await db.user.findFirst({ where: { id: studentId, tenantId: user.tenantId, role: "STUDENT" }, select: { id: true } });
  if (!s) throw new AppError("NOT_FOUND", "Not found.");
  await db.user.delete({ where: { id: s.id } });
  await recordAudit(user, "privacy.delete_student", "User", s.id);
  return { ok: true };
}

export async function listStudents(user: SessionUser | null | undefined) {
  assertRole(user, ["ADMIN"]);
  return db.user.findMany({
    where: { tenantId: user.tenantId, role: "STUDENT" }, orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, _count: { select: { attempts: true, enrollments: true } } },
  });
}
