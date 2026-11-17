import { handle, readJson } from "@/server/http";
import { setRetentionDays } from "@/server/privacy";

export async function PATCH(req: Request) {
  const body = await readJson(req);
  return handle((user) => setRetentionDays(user, body));
}
