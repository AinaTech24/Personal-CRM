import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { isRestrictedFromModule } from "@/lib/social-media";
import {
  asJson,
  BillingValidationError,
  billingListWhere,
  canDeleteBillingRecord,
  computeTotals,
  isUniqueConstraintError,
  pickSellerData,
  sellerSchemaFields,
  toNumber,
} from "@/lib/billing";
import { broadcastQuotationChange, nextQuotationNumber } from "@/lib/quotations";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isRestrictedFromModule(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.quotation.findMany({
    where: billingListWhere(user),
    include: {
      department: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { items: true, invoices: true } },
    },
    // The list view never renders these — only the single-document view
    // does — but they're base64 images that can each run tens of KB, so
    // every list load was shipping that dead weight per row for nothing.
    omit: { sellerLogoDataUrl: true, sellerSignatureDataUrl: true },
    orderBy: { createdAt: "desc" },
  });

  const quotations = rows.map((q) => ({
    ...q,
    subtotal: toNumber(q.subtotal),
    gstAmount: toNumber(q.gstAmount),
    discount: toNumber(q.discount),
    total: toNumber(q.total),
  }));

  return NextResponse.json({ quotations });
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
  placeOfSupply: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
  discount: z.number().min(0).default(0),
  ...sellerSchemaFields,
  items: z.array(itemSchema).min(1),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isRestrictedFromModule(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const data = parsed.data;
  const departmentId = isAdmin(user) ? data.departmentId || null : user.departmentId;
  let totals;
  try {
    totals = computeTotals(data.items, data.discount);
  } catch (err) {
    if (err instanceof BillingValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  // nextQuotationNumber() checks for a collision up front, but two people
  // creating a quotation at the same instant could still both pass that
  // check before either write lands — retry with a freshly-generated number
  // rather than surfacing the database's own unique-constraint error (same
  // pattern as uniqueFormSlug in src/app/api/forms/route.ts).
  for (let attempt = 0; attempt < 3; attempt++) {
    const quotationNumber = await nextQuotationNumber();
    try {
      const quotation = await db.quotation.create({
        data: {
          quotationNumber,
          clientName: data.clientName,
          clientEmail: data.clientEmail || null,
          clientAddress: data.clientAddress || null,
          clientGstin: data.clientGstin || null,
          shipToAddress: data.shipToAddress || null,
          shipToGstin: data.shipToGstin || null,
          placeOfSupply: data.placeOfSupply || null,
          subject: data.subject || null,
          notes: data.notes || null,
          leadId: data.leadId || null,
          departmentId,
          validUntil: data.validUntil ? new Date(data.validUntil) : null,
          ...pickSellerData(data),
          discount: data.discount,
          subtotal: totals.subtotal,
          gstAmount: totals.gstAmount,
          total: totals.total,
          currentVersion: 1,
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
          versions: {
            create: {
              versionNumber: 1,
              snapshot: asJson({
                clientName: data.clientName,
                discount: data.discount,
                subtotal: totals.subtotal,
                gstAmount: totals.gstAmount,
                total: totals.total,
                items: totals.items,
              }),
            },
          },
        },
      });

      broadcastQuotationChange("quotation_created", quotation);
      return NextResponse.json({ quotation }, { status: 201 });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
    }
  }
  return NextResponse.json({ error: "Couldn't generate a unique quotation number — try again" }, { status: 500 });
}

const bulkDeleteSchema = z.object({ ids: z.array(z.string()).min(1) });

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isRestrictedFromModule(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bulkDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const rows = await db.quotation.findMany({ where: { id: { in: parsed.data.ids } } });
  const deletable = rows.filter((q) => canDeleteBillingRecord(user, q));

  if (deletable.length > 0) {
    await db.quotation.deleteMany({ where: { id: { in: deletable.map((q) => q.id) } } });
    for (const q of deletable) broadcastQuotationChange("quotation_deleted", q);
  }

  return NextResponse.json({ deleted: deletable.length, skipped: parsed.data.ids.length - deletable.length });
}
