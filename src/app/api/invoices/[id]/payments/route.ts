import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isRestrictedFromModule } from "@/lib/social-media";
import { isUngrantedModuleHidden } from "@/lib/module-permissions-store";
import { canAccessBillingRecord } from "@/lib/billing";
import { broadcastInvoiceChange, recomputeInvoiceStatus } from "@/lib/invoices";

const bodySchema = z.object({
  amount: z.number().positive(),
  method: z.string().min(1),
  note: z.string().optional().nullable(),
  paidAt: z.string().optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isRestrictedFromModule(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await isUngrantedModuleHidden(user, "invoices")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const invoice = await db.invoice.findUnique({ where: { id } });
  if (!invoice || invoice.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessBillingRecord(user, invoice)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const payment = await db.payment.create({
    data: {
      invoiceId: id,
      amount: parsed.data.amount,
      method: parsed.data.method,
      note: parsed.data.note || null,
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date(),
      recordedById: user.id,
    },
  });

  await recomputeInvoiceStatus(id);
  broadcastInvoiceChange("invoice_updated", invoice);
  return NextResponse.json({ payment }, { status: 201 });
}

const deleteSchema = z.object({ paymentId: z.string() });

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isRestrictedFromModule(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await isUngrantedModuleHidden(user, "invoices")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const invoice = await db.invoice.findUnique({ where: { id } });
  if (!invoice || invoice.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessBillingRecord(user, invoice)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await db.payment.deleteMany({ where: { id: parsed.data.paymentId, invoiceId: id } });
  await recomputeInvoiceStatus(id);
  broadcastInvoiceChange("invoice_updated", invoice);
  return NextResponse.json({ ok: true });
}
