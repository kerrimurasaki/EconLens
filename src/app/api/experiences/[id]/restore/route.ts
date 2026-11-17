import { handle, readJson } from "@/server/http";
import { restoreVersion } from "@/server/builder";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return handle((user) => restoreVersion(user, id, body));
}
