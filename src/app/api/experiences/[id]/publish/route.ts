import { handle, readJson } from "@/server/http";
import { publishExperience } from "@/server/publish";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return handle((user) => publishExperience(user, id, body));
}
