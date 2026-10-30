import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { emitToAdmins, emitToDepartment, emitToUser } from "@/lib/socket-emit";
import { billingListWhere, canDeleteBillingRecord, formatDocNumber, toNumber } from "@/lib/billing";
import { isRestrictedFromModule } from "@/lib/social-media";
import { isUngrantedModuleHidden } from "@/lib/module-permissions-store";
import { TRASH_RETENTION_DAYS, trashExpiresAt, type TrashActionResult, type TrashItem } from "@/lib/trash-types";
import type { InvoiceStatus } from "@/generated/prisma/enums";

/** Generates the next invoice number for the current year, e.g. INV-2026-0007. */
export async function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const latest = await db.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  const lastSeq = latest ? parseInt(latest.invoiceNumber.slice(prefix.length), 10) || 0 : 0;
  return formatDocNumber("INV", year, lastSeq + 1);
}

/**
 * Derives an invoice's status from its payments and due date.
 * Never overrides a manually-set DRAFT or CANCELLED state.
 */
export function deriveInvoiceStatus(
  current: InvoiceStatus,
  total: number,
  amountPaid: number,
  dueDate: Date | null
): InvoiceStatus {
  if (current === "DRAFT" || current === "CANCELLED") return current;
  if (amountPaid >= total && total > 0) return "PAID";
  if (amountPaid > 0) return "PARTIAL_PAYMENT";
  if (dueDate && dueDate.getTime() < Date.now()) return "OVERDUE";
  return "SENT";
}

/** Recomputes and persists an invoice's status after a payment or edit. Returns the amount paid. */
export async function recomputeInvoiceStatus(invoiceId: string) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) return null;

  const amountPaid = invoice.payments.reduce((sum, p) => sum + toNumber(p.amount), 0);
  const status = deriveInvoiceStatus(invoice.status, toNumber(invoice.total), amountPaid, invoice.dueDate);

  if (status !== invoice.status) {
    await db.invoice.update({ where: { id: invoiceId }, data: { status } });
  }
  return { amountPaid, status };
}

export function broadcastInvoiceChange(
  event: "invoice_created" | "invoice_updated" | "invoice_deleted",
  invoice: { id: string; departmentId: string | null; createdById: string }
) {
  if (invoice.departmentId) emitToDepartment(invoice.departmentId, event, { invoiceId: invoice.id });
  emitToAdmins(event, { invoiceId: invoice.id });
  emitToUser(invoice.createdById, event, { invoiceId: invoice.id });
}

/* ------------------------------- Trash ------------------------------- */

/** Every trashed invoice this user can see — same visibility rule as the live list (billingListWhere), just the opposite set of `deletedAt`. */
export async function listTrashedInvoicesFor(user: PermissionUser): Promise<TrashItem[]> {
  if ((await isRestrictedFromModule(user)) || (await isUngrantedModuleHidden(user, "invoices"))) return [];
  const invoices = await db.invoice.findMany({
    where: { ...billingListWhere(user), deletedAt: { not: null } },
    include: { deletedBy: { select: { id: true, name: true } } },
    orderBy: { deletedAt: "desc" },
  });
  return invoices.map((inv) => ({
    id: inv.id,
    module: "invoices",
    moduleLabel: "Invoices",
    title: inv.invoiceNumber,
    subtitle: inv.clientName,
    deletedAt: inv.deletedAt!.toISOString(),
    deletedBy: inv.deletedBy,
    expiresAt: trashExpiresAt(inv.deletedAt!).toISOString(),
  }));
}

/** Clears the trash flag, putting the invoice back exactly as it was. */
export async function restoreInvoice(user: PermissionUser, invoiceId: string): Promise<TrashActionResult> {
  if ((await isRestrictedFromModule(user)) || (await isUngrantedModuleHidden(user, "invoices"))) return "forbidden";
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || !invoice.deletedAt) return "not_found";
  if (!canDeleteBillingRecord(user, invoice)) return "forbidden";

  const restored = await db.invoice.update({ where: { id: invoiceId }, data: { deletedAt: null, deletedById: null } });
  broadcastInvoiceChange("invoice_created", restored);
  return "ok";
}

/** Same permission as deleting it in the first place. */
export async function purgeInvoice(user: PermissionUser, invoiceId: string): Promise<TrashActionResult> {
  if ((await isRestrictedFromModule(user)) || (await isUngrantedModuleHidden(user, "invoices"))) return "forbidden";
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || !invoice.deletedAt) return "not_found";
  if (!canDeleteBillingRecord(user, invoice)) return "forbidden";

  await db.invoice.delete({ where: { id: invoiceId } });
  return "ok";
}

/** The 30-day auto-purge job's actual work. */
export async function purgeExpiredInvoices(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.invoice.deleteMany({ where: { deletedAt: { lte: cutoff } } });
  return count;
}
