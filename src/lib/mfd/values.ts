/**
 * Converting between three shapes of a record:
 *  - API JSON / "Rec": spec column names (snake_case); dates "YYYY-MM-DD",
 *    instants ISO-8601 UTC strings, decimals canonical strings (never
 *    floats — spec: "numeric uses decimal; no floating point for money"),
 *    bigints as numbers.
 *  - Prisma: camelCase props, Date / Decimal / BigInt values.
 * plus per-field input validation derived from the field dictionary.
 */
import { Prisma } from "@/generated/prisma/client";
import { picklistValues, tableDef } from "./catalog";
import type { FieldDef } from "./catalog-types";

export type Rec = Record<string, unknown>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const E164_RE = /^\+[1-9]\d{6,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_COLUMNS = new Set(["email", "primary_email", "work_email"]);
const PHONE_COLUMNS = new Set(["mobile_e164", "primary_phone"]);
const HTTPS_COLUMNS = new Set(["website_url", "meeting_link"]);

export class FieldError extends Error {
  constructor(
    public field: string,
    message: string
  ) {
    super(message);
  }
}

/** Numeric bounds expressed in the spec's rule text ("0..100", "Nonnegative", "Positive"). */
export function boundsOf(f: FieldDef): { min?: number; max?: number; exclusiveMin?: boolean } {
  const text = `${f.rule} ${f.help}`;
  const range = /(-?\d+(?:\.\d+)?)\s*(?:\.\.|–|—)\s*(-?\d+(?:\.\d+)?)/.exec(text);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  if (/non-?negative/i.test(text)) return { min: 0 };
  if (/\bpositive\b/i.test(text)) return { min: 0, exclusiveMin: true };
  return {};
}

function isValidDateKey(v: string) {
  if (!DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Validate and normalize one incoming value to Rec form. Throws FieldError. */
export function normalizeInput(table: string, f: FieldDef, raw: unknown): unknown {
  const fail = (m: string): never => {
    throw new FieldError(f.column, `${f.label}: ${m}`);
  };
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") {
    if (f.kind === "bool") fail("must be true or false");
    return null;
  }

  if (f.picklist) {
    const v = String(raw).trim();
    if (!picklistValues(f.picklist).includes(v)) fail(`"${v}" is not an allowed value`);
    return v;
  }

  switch (f.kind) {
    case "uuid": {
      const v = String(raw).trim();
      if (v.length > 191) fail("invalid reference");
      return v;
    }
    case "string":
    case "char":
    case "text": {
      if (typeof raw !== "string" && typeof raw !== "number") fail("must be text");
      const v = String(raw).trim();
      if (!v) return null;
      if (f.maxLength && v.length > f.maxLength) fail(`must be at most ${f.maxLength} characters`);
      if (f.kind === "text" && v.length > 1_000_000) fail("is too long");
      if (f.kind === "char" && f.maxLength && v.length !== f.maxLength) fail(`must be exactly ${f.maxLength} characters`);
      if (EMAIL_COLUMNS.has(f.column) && !EMAIL_RE.test(v)) fail("must be a valid email address");
      if (PHONE_COLUMNS.has(f.column) && !E164_RE.test(v)) fail("must be in E.164 format, e.g. +919876543210");
      if (HTTPS_COLUMNS.has(f.column) && !/^https:\/\/[^\s]+$/i.test(v)) fail("must be an https:// link");
      if (f.column === "country_iso2" && !/^[A-Z]{2}$/.test(v)) fail("must be a 2-letter ISO country code");
      if (f.column === "transcript_language" && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(v)) fail("must be a language tag like en-IN");
      if (/at least 2 characters|min 2 chars/i.test(f.rule) && v.length < 2) fail("must be at least 2 characters");
      return v;
    }
    case "int":
    case "bigint": {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isInteger(n) || !Number.isSafeInteger(n)) fail("must be a whole number");
      checkBounds(f, n, fail);
      return n;
    }
    case "decimal": {
      const s = String(raw).trim();
      if (!/^-?\d+(\.\d+)?$/.test(s)) fail("must be a number");
      const [intPart, frac = ""] = s.replace("-", "").split(".");
      if (frac.length > (f.scale ?? 0)) fail(`allows at most ${f.scale} decimal places`);
      if (intPart.replace(/^0+(?=\d)/, "").length > (f.precision ?? 18) - (f.scale ?? 0)) fail("is too large");
      checkBounds(f, Number(s), fail);
      return new Prisma.Decimal(s).toFixed(f.scale ?? 0);
    }
    case "bool":
      if (typeof raw !== "boolean") fail("must be true or false");
      return raw;
    case "date": {
      const v = String(raw).trim();
      if (!isValidDateKey(v)) fail("must be a date (YYYY-MM-DD)");
      return v;
    }
    case "datetime": {
      const d = new Date(String(raw));
      if (Number.isNaN(d.getTime())) fail("must be a valid date and time");
      return d.toISOString();
    }
    case "json":
      return normalizeJson(f, raw, fail);
  }
}

function checkBounds(f: FieldDef, n: number, fail: (m: string) => never) {
  const b = boundsOf(f);
  if (b.min !== undefined && (b.exclusiveMin ? n <= b.min : n < b.min)) fail(b.exclusiveMin ? "must be greater than 0" : `must be at least ${b.min}`);
  if (b.max !== undefined && n > b.max) fail(`must be at most ${b.max}`);
}

function normalizeJson(f: FieldDef, raw: unknown, fail: (m: string) => never) {
  let v = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      fail("must be valid JSON");
    }
  }
  if (f.column === "top_challenges" || f.column === "skills") {
    const max = f.column === "top_challenges" ? 10 : 50;
    if (!Array.isArray(v) || v.length > max || v.some((s) => typeof s !== "string" || !s.trim() || s.length > 200)) {
      fail(`must be a list of up to ${max} short text items`);
    }
    return (v as string[]).map((s) => s.trim());
  }
  if (JSON.stringify(v).length > 500_000) fail("is too large");
  return v;
}

/** Rec value → Prisma data value. */
export function toPrismaValue(f: FieldDef, v: unknown): unknown {
  if (v === null || v === undefined) return v;
  switch (f.kind) {
    case "date":
      return new Date(`${v as string}T00:00:00.000Z`);
    case "datetime":
      return v instanceof Date ? v : new Date(v as string);
    case "decimal":
      return new Prisma.Decimal(v as string);
    case "bigint":
      return BigInt(v as number);
    case "json":
      return v as Prisma.InputJsonValue;
    default:
      return v;
  }
}

/** Rec (snake) → Prisma data (camel) for the given columns. */
export function toPrismaData(table: string, rec: Rec): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of tableDef(table).fields) {
    if (!(f.column in rec)) continue;
    out[f.prop] = toPrismaValue(f, rec[f.column]);
  }
  return out;
}

/** Prisma row (camel) → Rec (snake). */
export function fromPrismaRow(table: string, row: Record<string, unknown>): Rec {
  const out: Rec = {};
  for (const f of tableDef(table).fields) {
    const v = row[f.prop];
    if (v === undefined) continue;
    if (v === null) {
      out[f.column] = null;
      continue;
    }
    switch (f.kind) {
      case "date":
        out[f.column] = (v as Date).toISOString().slice(0, 10);
        break;
      case "datetime":
        out[f.column] = (v as Date).toISOString();
        break;
      case "decimal":
        out[f.column] = (v as Prisma.Decimal).toFixed(f.scale ?? 0);
        break;
      case "bigint":
        out[f.column] = Number(v as bigint);
        break;
      default:
        out[f.column] = v;
    }
  }
  return out;
}

/** Map a snake_case column to its Prisma prop for `where`/`orderBy`. */
export function propOf(table: string, column: string): string {
  const f = tableDef(table).fields.find((x) => x.column === column);
  if (!f) throw new Error(`${table} has no column ${column}`);
  return f.prop;
}

/** Decimal arithmetic on canonical strings. */
export const dec = {
  add: (...xs: (string | null | undefined)[]) => xs.reduce<Prisma.Decimal>((a, x) => a.plus(new Prisma.Decimal(x ?? 0)), new Prisma.Decimal(0)),
  of: (x: string | number | null | undefined) => new Prisma.Decimal(x ?? 0),
};
