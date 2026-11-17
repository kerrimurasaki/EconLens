import { handle, readJson } from "@/server/http";
import { saveBlueprint } from "@/server/builder";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return handle(async (user) => {
    await saveBlueprint(user, id, body);
    return { ok: true };
  });
}
