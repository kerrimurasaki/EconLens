import { describe, expect, it } from "vitest";
import { isCrossSiteWrite } from "@/lib/csrf";
import { allowed, rateLimit, resetRateLimits } from "@/server/rateLimit";

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

describe("CSRF origin check", () => {
  it("allows same-origin writes and header-less clients", () => {
    expect(isCrossSiteWrite("POST", "/api/classes", h({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(false);
    expect(isCrossSiteWrite("POST", "/api/classes", h({ host: "localhost:3000" }))).toBe(false);
    expect(isCrossSiteWrite("PATCH", "/api/classes", h({ "sec-fetch-site": "same-origin", host: "x" }))).toBe(false);
  });
  it("blocks cross-site browser writes", () => {
    expect(isCrossSiteWrite("POST", "/api/join", h({ origin: "https://evil.example", host: "localhost:3000" }))).toBe(true);
    expect(isCrossSiteWrite("PUT", "/api/experiences/1/draft", h({ "sec-fetch-site": "cross-site", host: "x" }))).toBe(true);
    expect(isCrossSiteWrite("POST", "/api/join", h({ origin: "null", host: "localhost:3000" }))).toBe(true);
    expect(isCrossSiteWrite("DELETE", "/api/x", h({ origin: "http://localhost:3001", host: "localhost:3000" }))).toBe(true);
  });
  it("ignores reads and next-auth's own routes", () => {
    expect(isCrossSiteWrite("GET", "/api/experiences", h({ origin: "https://evil.example", host: "x" }))).toBe(false);
    expect(isCrossSiteWrite("POST", "/api/auth/callback/credentials", h({ origin: "https://evil.example", host: "x" }))).toBe(false);
    expect(isCrossSiteWrite("POST", "/login", h({ origin: "https://evil.example", host: "x" }))).toBe(false);
  });
});

describe("rate limiter", () => {
  it("blocks after the maximum within the window and recovers afterwards", () => {
    resetRateLimits();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) rateLimit("k", 3, 60_000, t0 + i);
    expect(() => rateLimit("k", 3, 60_000, t0 + 10)).toThrowError(expect.objectContaining({ code: "RATE_LIMITED" }));
    expect(() => rateLimit("k", 3, 60_000, t0 + 61_000)).not.toThrow();
  });
  it("keeps keys independent and offers a non-throwing form", () => {
    resetRateLimits();
    expect(allowed("a", 1, 1000, 1)).toBe(true);
    expect(allowed("a", 1, 1000, 2)).toBe(false);
    expect(allowed("b", 1, 1000, 2)).toBe(true);
  });
});
