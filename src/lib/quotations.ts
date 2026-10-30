import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { emitToAdmins, emitToDepartment, emitToUser } from "@/lib/socket-emit";
import { billingListWhere, canDeleteBillingRecord, formatDocNumber } from "@/lib/billing";
import { isRestrictedFromModule } from "@/lib/social-media";
import { isUngrantedModuleHidden } from "@/lib/module-permissions-store";
import { TRASH_RETENTION_DAYS, trashExpiresAt, type TrashActionResult, type TrashItem } from "@/lib/trash-types";

/** Generates the next quotation number for the current year, e.g. QT-2026-0007. */
export async function nextQuotationNumber() {
  const year = new Date().getFullYear();
  const prefix = `QT-${year}-`;
  const latest = await db.quotation.findFirst({
    where: { quotationNumber: { startsWith: prefix } },
    orderBy: { quotationNumber: "desc" },
    select: { quotationNumber: true },
  });
  const lastSeq = latest ? parseInt(latest.quotationNumber.slice(prefix.length), 10) || 0 : 0;
  return formatDocNumber("QT", year, lastSeq + 1);
}

export function broadcastQuotationChange(
  event: "quotation_created" | "quotation_updated" | "quotation_deleted",
  quotation: { id: string; departmentId: string | null; createdById: string }
) {
  if (quotation.departmentId) emitToDepartment(quotation.departmentId, event, { quotationId: quotation.id });
  emitToAdmins(event, { quotationId: quotation.id });
  emitToUser(quotation.createdById, event, { quotationId: quotation.id });
}

/* ------------------------------- Trash ------------------------------- */

/** Every trashed quotation this user can see — same visibility rule as the live list (billingListWhere), just the opposite set of `deletedAt`. */
export async function listTrashedQuotationsFor(user: PermissionUser): Promise<TrashItem[]> {
  if ((await isRestrictedFromModule(user)) || (await isUngrantedModuleHidden(user, "quotations"))) return [];
  const quotations = await db.quotation.findMany({
    where: { ...billingListWhere(user), deletedAt: { not: null } },
    include: { deletedBy: { select: { id: true, name: true } } },
    orderBy: { deletedAt: "desc" },
  });
  return quotations.map((q) => ({
    id: q.id,
    module: "quotations",
    moduleLabel: "Quotes",
    title: q.quotationNumber,
    subtitle: q.clientName,
    deletedAt: q.deletedAt!.toISOString(),
    deletedBy: q.deletedBy,
    expiresAt: trashExpiresAt(q.deletedAt!).toISOString(),
  }));
}

/** Clears the trash flag, putting the quotation back exactly as it was. */
export async function restoreQuotation(user: PermissionUser, quotationId: string): Promise<TrashActionResult> {
  if ((await isRestrictedFromModule(user)) || (await isUngrantedModuleHidden(user, "quotations"))) return "forbidden";
  const quotation = await db.quotation.findUnique({ where: { id: quotationId } });
  if (!quotation || !quotation.deletedAt) return "not_found";
  if (!canDeleteBillingRecord(user, quotation)) return "forbidden";

  const restored = await db.quotation.update({ where: { id: quotationId }, data: { deletedAt: null, deletedById: null } });
  broadcastQuotationChange("quotation_created", restored);
  return "ok";
}

/** Same permission as deleting it in the first place. */
export async function purgeQuotation(user: PermissionUser, quotationId: string): Promise<TrashActionResult> {
  if ((await isRestrictedFromModule(user)) || (await isUngrantedModuleHidden(user, "quotations"))) return "forbidden";
  const quotation = await db.quotation.findUnique({ where: { id: quotationId } });
  if (!quotation || !quotation.deletedAt) return "not_found";
  if (!canDeleteBillingRecord(user, quotation)) return "forbidden";

  await db.quotation.delete({ where: { id: quotationId } });
  return "ok";
}

/** The 30-day auto-purge job's actual work. */
export async function purgeExpiredQuotations(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.quotation.deleteMany({ where: { deletedAt: { lte: cutoff } } });
  return count;
}
