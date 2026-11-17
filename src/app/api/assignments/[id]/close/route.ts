import { handle } from "@/server/http";
import { closeAssignment } from "@/server/publish";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle((user) => closeAssignment(user, id));
}
