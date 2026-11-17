import { db } from "./db";
import { assertRole, TEACHING_ROLES, type SessionUser } from "./auth/policy";
import type { ExperienceListQuery, ExperienceSummary } from "@/schemas/experiences";

/** Lists experiences for the teacher's tenant. Teachers see only their own; admins see the tenant's. */
export async function listExperiences(
  user: SessionUser | null | undefined,
  query: ExperienceListQuery = {},
): Promise<ExperienceSummary[]> {
  assertRole(user, TEACHING_ROLES);
  const rows = await db.experience.findMany({
    where: {
      tenantId: user.tenantId,
      ...(user.role === "TEACHER" ? { creatorId: user.id } : {}),
      ...(query.status ? { status: query.status } : { status: { not: "ARCHIVED" } }),
      ...(query.q ? { title: { contains: query.q, mode: "insensitive" } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { currentVersion: { select: { _count: { select: { blocks: true } } } } },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    durationMinutes: r.durationMinutes,
    level: r.level,
    isDemo: r.isDemo,
    hasDraft: (r.currentVersion?._count.blocks ?? 0) > 0,
    updatedAt: r.updatedAt.toISOString(),
  }));
}
