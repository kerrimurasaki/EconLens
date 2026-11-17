import { getSessionUser } from "@/server/auth/session";
import { toErrorResponse } from "@/server/errors";
import { listExperiences } from "@/server/experiences";
import { experienceListQuery } from "@/schemas/experiences";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const params = Object.fromEntries(new URL(req.url).searchParams);
    const query = experienceListQuery.parse(params);
    return Response.json({ data: await listExperiences(user, query) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
