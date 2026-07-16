import { db } from "@/lib/db";
import { emitToAdmins, emitToDepartment, emitToUser } from "@/lib/socket-emit";
import { formatDocNumber, toNumber } from "@/lib/billing";
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
