import { cookies } from "next/headers";
import { jwtVerify } from "jose";

/**
 * Who is making the current request.
 *
 * Read from the session cookie at the moment of the write, rather than carried
 * in AsyncLocalStorage. The obvious approach — setActor() inside
 * getCurrentUser() — cannot work: enterWith() applies to that function's own
 * async context, which is popped when its promise resolves, so the handler that
 * awaited it never sees the value. Establishing the store around the whole
 * request would need a wrapper Next doesn't offer for route handlers.
 *
 * Reading the cookie here costs a JWT verify per write, so the result is cached
 * per token for the life of the process.
 */
export interface Actor {
  id: string;
  name: string;
}

const SESSION_COOKIE = "aina_session";

/** userId per token, so repeated writes in one request verify once. */
const tokenToUserId = new Map<string, string>();

/**
 * The signed-in user's id, or undefined outside a request.
 *
 * Verifies the JWT inline rather than importing from auth.ts: auth imports the
 * database client, and the client imports this module, which would be a cycle.
 */
export async function currentActorId(): Promise<string | undefined> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return undefined;

    const cached = tokenToUserId.get(token);
    if (cached) return cached;

    const secret = process.env.JWT_SECRET;
    if (!secret) return undefined;
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    const userId = typeof payload.userId === "string" ? payload.userId : undefined;
    if (userId) {
      // Bounded so a long-lived process can't accumulate every token ever seen.
      if (tokenToUserId.size > 500) tokenToUserId.clear();
      tokenToUserId.set(token, userId);
    }
    return userId;
  } catch {
    // No request context (a script, a background job) or an invalid cookie.
    return undefined;
  }
}

/**
 * Models the log ignores.
 *
 * AuditLog itself would recurse. The rest are machine chatter — sessions
 * refresh on every request, read receipts and presence change constantly — and
 * would bury the human actions the log exists to show.
 */
export const AUDIT_IGNORED_MODELS = new Set([
  "AuditLog",
  "Session",
  "Notification",
  "PushSubscription",
  "ConversationMember",
  "MessageRead",
  "MessageHidden",
]);

/** Fields never worth recording, and in some cases never worth storing twice. */
const NOISY_FIELDS = new Set(["updatedAt", "lastSeenAt", "lastReadAt", "passwordHash", "resetCode"]);

/** A short, readable label for the record being changed. */
export function describeRecord(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  for (const key of ["name", "title", "quotationNumber", "invoiceNumber", "email", "subject"]) {
    const v = d[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * The changed fields, trimmed to something a person can read.
 *
 * Blobs are replaced by a note rather than stored — an avatar would put a
 * megabyte of base64 into every log row it touched.
 */
export function summariseChanges(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (NOISY_FIELDS.has(key)) continue;
    if (typeof value === "string" && value.startsWith("data:")) {
      out[key] = `[file, ${(value.length / 1024).toFixed(0)} KB]`;
      continue;
    }
    if (value !== null && typeof value === "object") continue; // nested writes
    out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

/** "Lead" → "lead", "AttendanceAudit" → "attendance audit". */
export function humanModel(model: string) {
  return model.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}
