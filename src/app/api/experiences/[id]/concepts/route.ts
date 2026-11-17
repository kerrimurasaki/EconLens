import { handle, readJson } from "@/server/http";
import { selectLenses } from "@/server/events";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return handle(async (user) => {
    await selectLenses(user, id, body);
    return { ok: true };
  });
}
