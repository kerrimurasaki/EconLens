import { handle, readJson } from "@/server/http";
import { resetScenario } from "@/server/learn/student";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return handle((user) => resetScenario(user, id, body));
}
