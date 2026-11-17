import { getServerSession } from "next-auth";
import { authOptions } from "./options";
import { assertProductionSecret } from "./secret";
import { db } from "../db";
import type { SessionUser } from "./policy";

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user;
  if (!u?.id || !u.role || !u.tenantId) return null;
  assertProductionSecret();
  // JWTs are not trusted blindly: a deleted or re-roled user loses access immediately.
  const row = await db.user.findUnique({ where: { id: u.id }, select: { role: true, tenantId: true, name: true, email: true } });
  if (!row || row.role !== u.role || row.tenantId !== u.tenantId) return null;
  return { id: u.id, role: row.role, tenantId: row.tenantId, name: row.name, email: row.email };
}
