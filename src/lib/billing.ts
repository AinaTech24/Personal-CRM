import { z } from "zod";
import type { InputJsonObject } from "@/generated/prisma/internal/prismaNamespace";
import type { PermissionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";

const sellerImageUrl = z
  .string()
  .max(1_500_000)
  .regex(/^data:image\//, "Must be an image data URL")
  .nullable()
  .optional();

/** Zod fields for the per-document seller (company) header, shared by invoices and quotations. */
export const sellerSchemaFields = {
  sellerName: z.string().max(200).nullable().optional(),
  sellerAddress: z.string().max(1000).nullable().optional(),
  sellerGstin: z.string().max(40).nullable().optional(),
  sellerPhone: z.string().max(60).nullable().optional(),
  sellerEmail: z.string().max(160).nullable().optional(),
  sellerWebsite: z.string().max(200).nullable().optional(),
  sellerSignatory: z.string().max(160).nullable().optional(),
  sellerLogoDataUrl: sellerImageUrl,
  sellerSignatureDataUrl: sellerImageUrl,
};

const SELLER_KEYS = [
  "sellerName",
  "sellerAddress",
  "sellerGstin",
  "sellerPhone",
  "sellerEmail",
  "sellerWebsite",
  "sellerSignatory",
  "sellerLogoDataUrl",
  "sellerSignatureDataUrl",
] as const;

/** Extracts only the provided seller fields (for create/patch), normalizing empty strings to null. */
export function pickSellerData(d: Record<string, unknown>) {
  const out: Record<string, string | null> = {};
  for (const k of SELLER_KEYS) {
    if (d[k] !== undefined) out[k] = (d[k] as string) || null;
  }
  return out;
}

/** A single editable line item as it arrives from the client. */
export interface LineItemInput {
  description: string;
  qty: number;
  unitPrice: number;
  gstRate: number;
}

export interface ComputedLineItem extends LineItemInput {
  lineTotal: number;
}

export interface ComputedTotals {
  items: ComputedLineItem[];
  subtotal: number;
  gstAmount: number;
  total: number;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Computes per-line totals and document totals.
 * subtotal = Σ(qty · unitPrice); gstAmount = Σ(lineTotal · gstRate%); total = subtotal + gst − discount.
 * Discount is applied to the document total, not per line.
 */
export function computeTotals(items: LineItemInput[], discount = 0): ComputedTotals {
  const computed = items.map((item) => {
    const qty = Number(item.qty) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const gstRate = Number(item.gstRate) || 0;
    return {
      description: item.description,
      qty,
      unitPrice,
      gstRate,
      lineTotal: round2(qty * unitPrice),
    };
  });

  const subtotal = round2(computed.reduce((sum, i) => sum + i.lineTotal, 0));
  const gstAmount = round2(computed.reduce((sum, i) => sum + i.lineTotal * (i.gstRate / 100), 0));
  const total = round2(subtotal + gstAmount - (Number(discount) || 0));

  return { items: computed, subtotal, gstAmount, total };
}

/** Prisma Decimal fields serialize to strings; normalize a record's money fields to numbers for the client. */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

/** Round-trips a value to a plain JSON object suitable for a Prisma `Json` column. */
export function asJson(value: unknown): InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as InputJsonObject;
}

/** Generates a sequential document number scoped to the current year, e.g. QT-2026-0007. */
export function formatDocNumber(prefix: string, year: number, sequence: number) {
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}

/** Only Admins/Super Admins may approve or reject quotations. */
export { isAdmin };

/**
 * Visibility shared by quotations and invoices. Default (non-admin) access
 * is limited to records the user created — sharing a department doesn't by
 * itself grant visibility into a colleague's quotations/invoices (same
 * reasoning as canManageRecord in src/lib/permissions.ts).
 */
export function billingListWhere(user: PermissionUser) {
  if (isAdmin(user)) return {};
  return { createdById: user.id };
}

export function canAccessBillingRecord(user: PermissionUser, record: { createdById: string }) {
  return isAdmin(user) || record.createdById === user.id;
}

/** Deletion is restricted to Admins and the record's creator. */
export function canDeleteBillingRecord(user: PermissionUser, record: { createdById: string }) {
  return isAdmin(user) || record.createdById === user.id;
}
