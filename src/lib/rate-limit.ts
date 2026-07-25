/**
 * A fixed-window rate limiter, kept in memory rather than a separate store.
 * That's only safe because this app is deliberately pinned to a single PM2
 * fork-mode process (see DEPLOY_HOSTINGER_VPS.md — Socket.io depends on the
 * same constraint), so "in memory" already means "shared across every
 * request" here. Scaling this app past one process needs a real store (e.g.
 * Redis) for this too, same as it would for Socket.io.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Bounds how long a stale bucket lingers before an unrelated call sweeps it. */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCleanup = Date.now();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may try again; 0 when allowed. */
  retryAfterSeconds: number;
}

/**
 * Consumes one attempt against `key`'s window. `limit` attempts are allowed
 * per `windowMs`; the window resets `windowMs` after the first attempt in it,
 * not on a fixed clock boundary.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Piggybacks on whichever request happens to call in — no timer to leak,
  // no cron to schedule, and buckets aren't dense enough for the O(n) sweep
  // to matter once every 10 minutes.
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    for (const [k, b] of buckets) {
      if (b.resetAt < now) buckets.delete(k);
    }
    lastCleanup = now;
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
