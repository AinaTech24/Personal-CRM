import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import {
  billingListWhere,
  canDeleteBillingRecord,
  computeTotals,
  isUniqueConstraintError,
  pickSellerData,
  sellerSchemaFields,
  toNumber,
} from "@/lib/billing";
import { broadcastInvoiceChange, nextInvoiceNumber } from "@/lib/invoices";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.invoice.findMany({
    where: billingListWhere(user),
    include: {
      department: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      payments: { select: { amount: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const invoices = rows.map((inv) => {
    const amountPaid = inv.payments.reduce((sum, p) => sum + toNumber(p.amount), 0);
    return {
      ...inv,
      subtotal: toNumber(inv.subtotal),
      gstAmount: toNumber(inv.gstAmount),
      total: toNumber(inv.total),
      amountPaid,
      balance: toNumber(inv.total) - amountPaid,
    };
  });

  return NextResponse.json({ invoices });
}

const itemSchema = z.object({
  description: z.string().min(1),
  hsnSac: z.string().optional().nullable(),
  qty: z.number().positive(),
  unitPrice: z.number().min(0),
  gstRate: z.number().min(0).max(100),
});

const bodySchema = z.object({
  clientName: z.string().min(1),
  clientEmail: z.string().email().optional().nullable().or(z.literal("")),
  clientAddress: z.string().optional().nullable(),
  clientGstin: z.string().optional().nullable(),
  shipToAddress: z.string().optional().nullable(),
  shipToGstin: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  invoiceDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  poNumber: z.string().optional().nullable(),
  placeOfSupply: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  ...sellerSchemaFields,
  items: z.array(itemSchema).min(1),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const data = parsed.data;
  const departmentId = isAdmin(user) ? data.departmentId || null : user.departmentId;
  const totals = computeTotals(data.items, 0);

  // Same collision-retry reasoning as quotations' POST handler — see its
  // comment for why nextInvoiceNumber()'s own up-front check isn't enough.
  for (let attempt = 0; attempt < 3; attempt++) {
    const invoiceNumber = await nextInvoiceNumber();
    try {
      const invoice = await db.invoice.create({
        data: {
          invoiceNumber,
          clientName: data.clientName,
          clientEmail: data.clientEmail || null,
          clientAddress: data.clientAddress || null,
          clientGstin: data.clientGstin || null,
          shipToAddress: data.shipToAddress || null,
          shipToGstin: data.shipToGstin || null,
          departmentId,
          invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          terms: data.terms || null,
          poNumber: data.poNumber || null,
          placeOfSupply: data.placeOfSupply || null,
          subject: data.subject || null,
          notes: data.notes || null,
          ...pickSellerData(data),
          subtotal: totals.subtotal,
          gstAmount: totals.gstAmount,
          total: totals.total,
          createdById: user.id,
          items: {
            create: totals.items.map((i, idx) => ({
              description: i.description,
              hsnSac: data.items[idx]?.hsnSac || null,
              qty: i.qty,
              unitPrice: i.unitPrice,
              gstRate: i.gstRate,
              lineTotal: i.lineTotal,
            })),
          },
        },
      });

      broadcastInvoiceChange("invoice_created", invoice);
      return NextResponse.json({ invoice }, { status: 201 });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
    }
  }
  return NextResponse.json({ error: "Couldn't generate a unique invoice number — try again" }, { status: 500 });
}

const bulkDeleteSchema = z.object({ ids: z.array(z.string()).min(1) });

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bulkDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const rows = await db.invoice.findMany({ where: { id: { in: parsed.data.ids } } });
  const deletable = rows.filter((inv) => canDeleteBillingRecord(user, inv));

  if (deletable.length > 0) {
    await db.invoice.deleteMany({ where: { id: { in: deletable.map((inv) => inv.id) } } });
    for (const inv of deletable) broadcastInvoiceChange("invoice_deleted", inv);
  }

  return NextResponse.json({ deleted: deletable.length, skipped: parsed.data.ids.length - deletable.length });
}
