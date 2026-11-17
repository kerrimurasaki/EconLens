/**
 * Cross-site request check for cookie-authenticated JSON APIs. Session cookies are SameSite=Lax already;
 * this adds a second layer: a state-changing request must come from our own origin when the browser says where it came from.
 * Requests with neither Origin nor Sec-Fetch-Site (curl, server-to-server) carry no ambient browser cookies from another site.
 */
export function isCrossSiteWrite(method: string, pathname: string, headers: { get(name: string): string | null }): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) return false;
  if (!pathname.startsWith("/api/") || pathname.startsWith("/api/auth/")) return false; // next-auth has its own CSRF token
  const origin = headers.get("origin");
  const host = headers.get("host");
  if (origin) {
    try {
      return new URL(origin).host !== host;
    } catch {
      return true;
    }
  }
  const site = headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin" && site !== "none";
}
