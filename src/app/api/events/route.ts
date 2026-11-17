import { handle, readJson } from "@/server/http";
import { createEvent } from "@/server/events";

export async function POST(req: Request) {
  const body = await readJson(req);
  return handle((user) => createEvent(user, body));
}
