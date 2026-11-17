import { AppError } from "./errors";

/**
 * Small in-memory sliding-window limiter. It protects a single server instance (dev, one container).
 * Behind several instances or serverless functions, back it with a shared store (Redis) instead.
 */
const hits = new Map<string, number[]>();
let lastSweep = 0;

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): void {
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, v] of hits) if (v.every((t) => now - t > 15 * 60_000)) hits.delete(k);
  }
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a few minutes and try again.");
  }
  recent.push(now);
  hits.set(key, recent);
}

/** Non-throwing variant for places (like sign-in) that must answer generically. */
export function allowed(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  try {
    rateLimit(key, max, windowMs, now);
    return true;
  } catch {
    return false;
  }
}

export function resetRateLimits() {
  hits.clear();
}
