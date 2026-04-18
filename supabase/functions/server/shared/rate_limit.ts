// In-memory rate limiter with lazy cleanup.
// Extracted from routes.tsx — no external deps.

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
let _lastRateLimitCleanup = Date.now();

export function rateLimit(ip: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  if (now - _lastRateLimitCleanup > 60000) {
    _lastRateLimitCleanup = now;
    for (const [key, val] of rateLimitStore.entries()) {
      if (now > val.resetAt) rateLimitStore.delete(key);
    }
  }
  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

export function getClientIp(c: any): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s: string) => s.trim()).filter(Boolean);
    return parts[0] || "unknown";
  }
  return c.req.header("x-real-ip") || "unknown";
}
