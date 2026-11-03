import type { NextRequest } from "next/server";

/**
 * Client IP + user agent for audit records and rate-limit keys.
 *
 * `X-Forwarded-For` is attacker-controlled: nginx is configured with
 * `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, which
 * *appends* the real client IP rather than overwriting it, so a request sent
 * with its own `X-Forwarded-For: 1.2.3.4` arrives here as `1.2.3.4, <real>`
 * — reading the first entry (the old behavior) trusts whatever the client
 * put there, letting an attacker mint a fresh rate-limit bucket on every
 * request just by rotating that header. `X-Real-IP` doesn't have this
 * problem: nginx sets it from `$remote_addr` with `proxy_set_header` (not
 * `proxy_add_*`), which *replaces* any client-supplied value, so it's safe
 * to trust as long as the app only ever receives traffic through that proxy
 * (true for both the VPS/nginx and Render deployments this app targets).
 * Fall back to the *last* X-Forwarded-For hop — the one the proxy itself
 * appended — only if X-Real-IP is somehow absent.
 */
export function requestDevice(req: NextRequest): { ip: string | null; userAgent: string | null } {
  const realIp = req.headers.get("x-real-ip")?.trim();
  const forwardedFor = req.headers.get("x-forwarded-for");
  const lastForwardedHop = forwardedFor?.split(",").map((s) => s.trim()).filter(Boolean).pop();

  return {
    ip: realIp || lastForwardedHop || null,
    userAgent: req.headers.get("user-agent"),
  };
}
