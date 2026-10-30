import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { recomputeInvoiceStatus } from "@/lib/invoices";
import { notifyAndPush } from "@/lib/notify";

/**
 * Nudges an invoice's creator once it's gone overdue — same two ways in as
 * the task/meeting reminder routes: an admin trigger for testing, or a
 * scheduler with the CRON_SECRET header for the real schedule.
 *
 * An invoice's `status` is only recomputed on a write (payment or edit), so
 * one sitting untouched past its due date can still read "SENT" here —
 * recomputeInvoiceStatus is called per-candidate first so the overdue check
 * below is always against the live status, not a possibly-stale one.
 *
 * Idempotent via a persisted overdueReminderSentAt, cleared whenever the
 * due date is edited (see PATCH /api/invoices/[id]) so a new due date gets
 * its own chance to be missed before nagging again.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers.get("x-cron-secret");
  const viaCron = !!cronSecret && providedSecret === cronSecret;

  if (!viaCron) {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const candidates = await db.invoice.findMany({
    where: {
      dueDate: { lte: new Date() },
      status: { in: ["SENT", "PARTIAL_PAYMENT", "OVERDUE"] },
      overdueReminderSentAt: null,
      deletedAt: null,
    },
    select: { id: true, invoiceNumber: true, createdById: true, clientName: true },
  });

  let sent = 0;

  for (const invoice of candidates) {
    const recomputed = await recomputeInvoiceStatus(invoice.id);
    if (recomputed?.status !== "OVERDUE") continue;

    const notification = await notifyAndPush(
      invoice.createdById,
      "invoice_overdue",
      { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber },
      {
        title: "Invoice overdue",
        body: `${invoice.invoiceNumber} (${invoice.clientName}) is now overdue.`,
        url: "/invoices",
        tag: "invoice-overdue",
      }
    );
    if (notification) sent += 1;

    await db.invoice.update({ where: { id: invoice.id }, data: { overdueReminderSentAt: new Date() } });
  }

  return NextResponse.json({ checked: candidates.length, sent });
}
