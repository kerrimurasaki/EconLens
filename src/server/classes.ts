import { randomInt } from "node:crypto";
import { db } from "./db";
import { AppError } from "./errors";
import { recordAudit } from "./audit";
import { assertRole, TEACHING_ROLES, type SessionUser } from "./auth/policy";
import { createClassSchema, joinSchema } from "@/schemas/classes";
import { rateLimit } from "./rateLimit";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
export const JOIN_CODE_DAYS = 14;

export function generateJoinCode(len = 8): string {
  return Array.from({ length: len }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}
export const normalizeCode = (c: string) => c.trim().toUpperCase().replace(/[\s-]/g, "");
const expiry = () => new Date(Date.now() + JOIN_CODE_DAYS * 24 * 60 * 60 * 1000);
const isUnique = (e: unknown) => (e as { code?: string })?.code === "P2002";

/** Teacher owns the class; admins may act on any class in their tenant. Misses are NOT_FOUND. */
export async function loadManagedClass(user: SessionUser | null | undefined, classId: string) {
  assertRole(user, TEACHING_ROLES);
  const c = await db.classroom.findFirst({ where: { id: classId, tenantId: user.tenantId, ...(user.role === "TEACHER" ? { teacherId: user.id } : {}) } });
  if (!c) throw new AppError("NOT_FOUND", "Not found.");
  return c;
}

export async function createClass(user: SessionUser | null | undefined, raw: unknown) {
  assertRole(user, TEACHING_ROLES);
  const body = createClassSchema.parse(raw);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const c = await db.classroom.create({
        data: { tenantId: user.tenantId, teacherId: user.id, name: body.name, term: body.term ?? null, joinCode: generateJoinCode(), joinExpiresAt: expiry() },
      });
      await recordAudit(user, "class.create", "Classroom", c.id);
      return { id: c.id };
    } catch (e) {
      if (!isUnique(e)) throw e;
    }
  }
  throw new AppError("INTERNAL", "Could not create a join code. Please try again.");
}

export async function rotateJoinCode(user: SessionUser | null | undefined, classId: string) {
  const c = await loadManagedClass(user, classId);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.classroom.update({ where: { id: c.id }, data: { joinCode: generateJoinCode(), joinExpiresAt: expiry() } });
      await recordAudit(user!, "class.rotate_code", "Classroom", c.id);
      return { ok: true };
    } catch (e) {
      if (!isUnique(e)) throw e;
    }
  }
  throw new AppError("INTERNAL", "Could not create a join code. Please try again.");
}

export async function listClasses(user: SessionUser | null | undefined) {
  assertRole(user, TEACHING_ROLES);
  return db.classroom.findMany({
    where: { tenantId: user.tenantId, ...(user.role === "TEACHER" ? { teacherId: user.id } : {}) },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { enrollments: true } }, assignments: { orderBy: { createdAt: "desc" }, include: { experience: { select: { id: true, title: true } }, publishedVersion: { select: { versionNumber: true } } } } },
  });
}

/** Students join with a code. Unknown, expired and other-tenant codes all give the same message (no enumeration). */
export async function joinClass(user: SessionUser | null | undefined, raw: unknown) {
  assertRole(user, ["STUDENT"]);
  rateLimit(`join:${user.id}`, 10, 10 * 60_000);
  const { code } = joinSchema.parse(raw);
  const c = await db.classroom.findFirst({ where: { joinCode: normalizeCode(code), tenantId: user.tenantId } });
  if (!c || (c.joinExpiresAt && c.joinExpiresAt < new Date())) throw new AppError("NOT_FOUND", "That code is not valid or has expired. Ask your teacher for a new one.");
  await db.classEnrollment.upsert({ where: { classId_studentId: { classId: c.id, studentId: user.id } }, update: {}, create: { classId: c.id, studentId: user.id } });
  await recordAudit(user, "class.join", "Classroom", c.id);
  return { classId: c.id, name: c.name };
}
