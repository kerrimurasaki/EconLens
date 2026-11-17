import { timingSafeEqual } from "node:crypto";
import { runRetentionAllTenants } from "@/server/privacy";

/** Called daily by Vercel Cron (see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return Response.json({ error: { code: "INTERNAL", message: "Cron is not configured." } }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return Response.json({ error: { code: "UNAUTHENTICATED", message: "Unauthorized." } }, { status: 401 });
  return Response.json({ data: await runRetentionAllTenants() });
}
