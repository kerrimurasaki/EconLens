import { handle } from "@/server/http";
import { releaseFeedback } from "@/server/learn/insights";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle((user) => releaseFeedback(user, id));
}
