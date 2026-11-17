import { NextResponse, type NextRequest } from "next/server";
import { isCrossSiteWrite } from "@/lib/csrf";

export function proxy(req: NextRequest) {
  if (isCrossSiteWrite(req.method, req.nextUrl.pathname, req.headers)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Cross-site request blocked." } }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
