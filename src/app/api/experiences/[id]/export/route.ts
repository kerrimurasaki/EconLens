import { getSessionUser } from "@/server/auth/session";
import { toErrorResponse, AppError } from "@/server/errors";
import { getDraft } from "@/server/builder";

/** Teacher-only JSON backup of the current draft (includes answer keys). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const d = await getDraft(await getSessionUser(), id);
    if (!d.doc) throw new AppError("NOT_FOUND", "This experience has no draft yet.");
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), version: d.version, document: d.doc }, null, 2);
    return new Response(body, {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="experience-${id}.json"`, "cache-control": "no-store" },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
