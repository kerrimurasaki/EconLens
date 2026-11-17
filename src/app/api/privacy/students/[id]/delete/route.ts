import { handle } from "@/server/http";
import { deleteStudentData } from "@/server/privacy";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle((user) => deleteStudentData(user, id));
}
