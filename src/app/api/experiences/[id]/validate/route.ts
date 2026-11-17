import { handle } from "@/server/http";
import { validateCurrent } from "@/server/builder";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle((user) => validateCurrent(user, id));
}
