import { db } from "./db";
import type { SessionUser } from "./auth/policy";

/** Records an audit event. Metadata must not contain student answer content or secrets. */
export async function recordAudit(
  actor: Pick<SessionUser, "id" | "tenantId">,
  action: string,
  objectType: string,
  objectId: string,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  await db.auditEvent.create({
    data: { tenantId: actor.tenantId, actorId: actor.id, action, objectType, objectId, metadataJson: metadata },
  });
}
