import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessBillingRecord, canDeleteBillingRecord, computeTotals, pickSellerData, sellerSchemaFields, toNumber } from "@/lib/billing";
import { broadcastInvoiceChange, recomputeInvoiceStatus } from "@/lib/invoices";

async function loadInvoice(id: string) {
  return db.invoice.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      quotation: { select: { id: true, quotationNumber: true } },
      items: true,
      payments: { include: { recordedBy: { select: { id: true, name: true } } }, orderBy: { paidAt: "desc" } },
    },
  });
}

function serialize(inv: NonNullable<Awaited<ReturnType<typeof loadInvoice>>>) {
  const amountPaid = inv.payments.reduce((sum, p) => sum + toNumber(p.amount), 0);
  return {
    ...inv,
    subtotal: toNumber(inv.subtotal),
    gstAmount: toNumber(inv.gstAmount),
    total: toNumber(inv.total),
    amountPaid,
    balance: toNumber(inv.total) - amountPaid,
    items: inv.items.map((i) => ({
      ...i,
      qty: toNumber(i.qty),
      unitPrice: toNumber(i.unitPrice),
      gstRate: toNumber(i.gstRate),
      lineTotal: toNumber(i.lineTotal),
    })),
    payments: inv.payments.map((p) => ({ ...p, amount: toNumber(p.amount) })),
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const invoice = await loadInvoice(id);
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessBillingRecord(user, invoice)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ invoice: serialize(invoice) });
}

const itemSchema = z.object({
  description: z.string().min(1),
  hsnSac: z.string().nullable().optional(),
  qty: z.number().positive(),
  unitPrice: z.number().min(0),
  gstRate: z.number().min(0).max(100),
});

const patchSchema = z.object({
  clientName: z.string().min(1).optional(),
  clientEmail: z.string().email().nullable().optional().or(z.literal("")),
  clientAddress: z.string().nullable().optional(),
  clientGstin: z.string().nullable().optional(),
  shipToAddress: z.string().nullable().optional(),
  shipToGstin: z.string().nullable().optional(),
  invoiceDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  poNumber: z.string().nullable().optional(),
  placeOfSupply: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  ...sellerSchemaFields,
  status: z.enum(["DRAFT", "SENT", "CANCELLED"]).optional(),
  items: z.array(itemSchema).min(1).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await db.invoice.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessBillingRecord(user, existing)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  const totals = data.items ? computeTotals(data.items, 0) : null;

  await db.$transaction(async (tx) => {
    if (data.items !== undefined && totals) {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceItem.createMany({
        data: totals.items.map((i, idx) => ({
          invoiceId: id,
          description: i.description,
          hsnSac: data.items?.[idx]?.hsnSac || null,
          qty: i.qty,
          unitPrice: i.unitPrice,
          gstRate: i.gstRate,
          lineTotal: i.lineTotal,
        })),
      });
    }
    await tx.invoice.update({
      where: { id },
      data: {
        ...(data.clientName !== undefined && { clientName: data.clientName }),
        ...(data.clientEmail !== undefined && { clientEmail: data.clientEmail || null }),
        ...(data.clientAddress !== undefined && { clientAddress: data.clientAddress || null }),
        ...(data.clientGstin !== undefined && { clientGstin: data.clientGstin || null }),
        ...(data.shipToAddress !== undefined && { shipToAddress: data.shipToAddress || null }),
        ...(data.shipToGstin !== undefined && { shipToGstin: data.shipToGstin || null }),
        ...(data.invoiceDate !== undefined && { invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date() }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null, overdueReminderSentAt: null }),
        ...(data.terms !== undefined && { terms: data.terms || null }),
        ...(data.poNumber !== undefined && { poNumber: data.poNumber || null }),
        ...(data.placeOfSupply !== undefined && { placeOfSupply: data.placeOfSupply || null }),
        ...(data.subject !== undefined && { subject: data.subject || null }),
        ...(data.notes !== undefined && { notes: data.notes || null }),
        ...pickSellerData(data),
        ...(data.status !== undefined && { status: data.status }),
        ...(totals && { subtotal: totals.subtotal, gstAmount: totals.gstAmount, total: totals.total }),
      },
    });
  });

  await recomputeInvoiceStatus(id);
  const invoice = await loadInvoice(id);
  if (invoice) broadcastInvoiceChange("invoice_updated", invoice);
  return NextResponse.json({ invoice: invoice ? serialize(invoice) : null });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await db.invoice.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canDeleteBillingRecord(user, existing)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.invoice.delete({ where: { id } });
  broadcastInvoiceChange("invoice_deleted", existing);
  return NextResponse.json({ ok: true });
}
