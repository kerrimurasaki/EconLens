import { handle } from "@/server/http";
import { rotateJoinCode } from "@/server/classes";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle((user) => rotateJoinCode(user, id));
}
