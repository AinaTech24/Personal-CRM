import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who is making the current request.
 *
 * The audit extension runs deep inside Prisma, far from the request handler, so
 * the actor can't be passed down as an argument. AsyncLocalStorage carries it
 * across the awaits instead.
 */
export interface Actor {
  id: string;
  name: string;
}

declare global {
  var __auditStore: AsyncLocalStorage<Actor> | undefined;
}

// One store shared by every bundle. Next compiles route handlers and server
// components separately, so a module-local instance gives the writer and the
// reader two different stores and the actor never arrives.
const store = globalThis.__auditStore ?? new AsyncLocalStorage<Actor>();
globalThis.__auditStore = store;

/**
 * Marks the rest of this request as being made by `actor`.
 *
 * KNOWN GAP: this does not currently work. `enterWith` sets the store inside
 * getCurrentUser's own async context, which is popped when its promise
 * resolves, so the route handler that called it never sees the value and every
 * entry is logged with no actor. Fixing it needs the store established around
 * the whole request — a wrapper the handlers run inside — rather than set from
 * a function they await. Left in place because the rest of the log is useful
 * and this is additive when it lands.
 */
export function setActor(actor: Actor) {
  store.enterWith(actor);
}

export function currentActor(): Actor | undefined {
  return store.getStore();
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
