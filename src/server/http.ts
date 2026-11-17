import { getSessionUser } from "./auth/session";
import { toErrorResponse } from "./errors";
import type { SessionUser } from "./auth/policy";

/** Wraps a route handler: resolves the session, runs it, and maps errors to the consistent payload. */
export async function handle(run: (user: SessionUser | null) => Promise<unknown>): Promise<Response> {
  try {
    const user = await getSessionUser();
    return Response.json({ data: await run(user) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export { readJson } from "./body";
