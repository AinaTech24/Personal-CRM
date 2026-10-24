/**
 * AUT-07 respondent links: an MFD contact fills in their self-assessment
 * without an account, through an expiring link scoped to that one
 * assessment ("never leak other MFD records").
 *
 * The token is stateless — HMAC over the assessment, its assigned contact,
 * the issued question-set hash and an expiry — so it dies on its own when
 * it expires, when the respondent is changed, when the assessment is
 * re-issued, or as soon as the assessment leaves the answerable states
 * (submitted, approved, cancelled …). Nothing in it is guessable or reusable
 * for another record.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import type { Actor } from "./access";
import { systemActor, workspaceId } from "./actor";
import { HttpError } from "./engine";
import { getRec } from "./store";
import type { Rec } from "./values";

const DAY = 86_400_000;
const ANSWERABLE = ["issued", "in_progress", "reopened"];
const MAX_DAYS = 30;

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return s;
}

function sign(asm: Rec, exp: number) {
  return createHmac("sha256", secret())
    .update(`cc-respond:${asm.id as string}:${asm.assigned_contact_id as string}:${asm.version_snapshot_hash as string}:${exp}`)
    .digest("base64url");
}

/** Link expiry: three days after the due date, else 14 days; never more than 30 days out. */
export function respondentExpiry(asm: Rec, now = Date.now()) {
  const due = asm.due_at ? Date.parse(asm.due_at as string) + 3 * DAY : now + 14 * DAY;
  return Math.floor(Math.min(Math.max(due, now + DAY), now + MAX_DAYS * DAY) / 1000);
}

export function respondentToken(asm: Rec, now = Date.now()) {
  if (!asm.assigned_contact_id) throw new HttpError(422, "Set the client contact who will respond first.");
  if (!asm.version_snapshot_hash) throw new HttpError(422, "Issue the assessment first.");
  const exp = respondentExpiry(asm, now);
  return { token: `${asm.id as string}.${exp}.${sign(asm, exp)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function checkRespondentToken(token: string, asm: Rec | null, now = Date.now()): boolean {
  const [id, expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!asm || asm.id !== id || !sig || !Number.isInteger(exp) || exp * 1000 < now) return false;
  if (!asm.assigned_contact_id || !asm.version_snapshot_hash || asm.archived_at) return false;
  const expected = Buffer.from(sign(asm, exp));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export interface RespondentSession {
  asm: Rec;
  contactId: string;
  /** Whether answers can still be given (vs. a read-only "already submitted" view). */
  open: boolean;
  /** Audit identity: the assessment's consultant (the link acts on their behalf), with full rights. */
  actor: () => Promise<Actor>;
}

/** Resolves a link to its assessment, or null when the link is invalid or expired. */
export async function resolveRespondent(token: string): Promise<RespondentSession | null> {
  const id = token.split(".")[0];
  if (!id || id.length > 64) return null;
  const ws = await workspaceId();
  const asm = await getRec(db, "assessments", id, ws);
  if (!checkRespondentToken(token, asm)) return null;
  return {
    asm: asm!,
    contactId: asm!.assigned_contact_id as string,
    open: ANSWERABLE.includes(asm!.status as string),
    actor: async () => {
      const member = await getRec(db, "team_members", asm!.assigned_consultant_id as string, ws);
      return systemActor((member?.auth_user_id as string | undefined) ?? (asm!.created_by_user_id as string));
    },
  };
}
