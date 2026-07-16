import { db } from "@/lib/db";
import { emitToAdmins, emitToDepartment, emitToUser } from "@/lib/socket-emit";
import { formatDocNumber } from "@/lib/billing";

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
