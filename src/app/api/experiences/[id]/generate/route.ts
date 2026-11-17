import { handle } from "@/server/http";
import { generateDraft } from "@/server/builder";

export const maxDuration = 180;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle((user) => generateDraft(user, id));
}
