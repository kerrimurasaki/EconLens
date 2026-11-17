import { handle, readJson } from "@/server/http";
import { saveDraft } from "@/server/builder";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return handle((user) => saveDraft(user, id, body));
}
