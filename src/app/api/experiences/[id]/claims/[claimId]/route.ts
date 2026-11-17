import { handle, readJson } from "@/server/http";
import { updateClaim } from "@/server/events";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; claimId: string }> }) {
  const { id, claimId } = await ctx.params;
  const body = await readJson(req);
  return handle(async (user) => {
    await updateClaim(user, id, claimId, body);
    return { ok: true };
  });
}
