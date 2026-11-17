import { handle } from "@/server/http";
import { startAttempt } from "@/server/learn/student";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle((user) => startAttempt(user, id));
}
