import { handle, readJson } from "@/server/http";
import { scoreResponse } from "@/server/learn/insights";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return handle((user) => scoreResponse(user, id, body));
}
