import { handle, readJson } from "@/server/http";
import { joinClass } from "@/server/classes";

export async function POST(req: Request) {
  const body = await readJson(req);
  return handle((user) => joinClass(user, body));
}
