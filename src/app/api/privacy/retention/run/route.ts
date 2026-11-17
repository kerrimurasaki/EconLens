import { handle } from "@/server/http";
import { runRetention } from "@/server/privacy";

export async function POST() {
  return handle((user) => runRetention(user));
}
