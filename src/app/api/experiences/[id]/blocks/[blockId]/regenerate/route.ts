import { handle, readJson } from "@/server/http";
import { regenerateBlock } from "@/server/builder";

export const maxDuration = 120;

export async function POST(req: Request, ctx: { params: Promise<{ id: string; blockId: string }> }) {
  const { id, blockId } = await ctx.params;
  const body = await readJson(req);
  return handle((user) => regenerateBlock(user, id, blockId, body));
}
