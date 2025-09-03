// Very small fixed-window rate limiter per IP

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

export async function rateLimit(
  ip: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const key = ip || "unknown";
  let window = windows.get(key);
  if (!window || now > window.resetAt) {
    window = { count: 0, resetAt: now + windowMs };
    windows.set(key, window);
  }
  if (window.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: window.resetAt };
  }
  window.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - window.count),
    resetAt: window.resetAt,
  };
}
