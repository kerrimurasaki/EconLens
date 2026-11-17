import { handle } from "@/server/http";
import { analyzeEvent } from "@/server/events";

export const maxDuration = 120;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle((user) => analyzeEvent(user, id));
}
