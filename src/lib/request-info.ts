import type { NextRequest } from "next/server";

/** Client IP + user agent for audit records. IP comes from the proxy's X-Forwarded-For. */
export function requestDevice(req: NextRequest): { ip: string | null; userAgent: string | null } {
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent"),
  };
}
