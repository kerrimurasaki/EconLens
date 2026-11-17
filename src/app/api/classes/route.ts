import { handle, readJson } from "@/server/http";
import { createClass } from "@/server/classes";

export async function POST(req: Request) {
  const body = await readJson(req);
  return handle((user) => createClass(user, body));
}
