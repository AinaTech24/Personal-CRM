import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isRestrictedFromModule } from "@/lib/social-media";
import { asJson, BillingValidationError, canAccessBillingRecord, canDeleteBillingRecord, computeTotals, pickSellerData, sellerSchemaFields, toNumber } from "@/lib/billing";
import { broadcastQuotationChange } from "@/lib/quotations";
import { notifyAndPush } from "@/lib/notify";

async function loadQuotation(id: string) {
  return db.quotation.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true } },
      items: true,
      versions: { orderBy: { versionNumber: "desc" } },
      approvals: { include: { approver: { select: { id: true, name: true } } }, orderBy: { decidedAt: "desc" } },
      invoices: { select: { id: true, invoiceNumber: true, status: true } },
    },
  });
}

function serialize(q: NonNullable<Awaited<ReturnType<typeof loadQuotation>>>) {
  return {
    ...q,
    subtotal: toNumber(q.subtotal),
    gstAmount: toNumber(q.gstAmount),
    discount: toNumber(q.discount),
    total: toNumber(q.total),
    items: q.items.map((i) => ({
      ...i,
      qty: toNumber(i.qty),
      unitPrice: toNumber(i.unitPrice),
      gstRate: toNumber(i.gstRate),
      lineTotal: toNumber(i.lineTotal),
    })),
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isRestrictedFromModule(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const quotation = await loadQuotation(id);
  if (!quotation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessBillingRecord(user, quotation)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ quotation: serialize(quotation) });
}

const itemSchema = z.object({
  description: z.string().min(1),
  hsnSac: z.string().optional().nullable(),
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
  placeOfSupply: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "SENT", "EXPIRED"]).optional(),
  discount: z.number().min(0).optional(),
  ...sellerSchemaFields,
  items: z.array(itemSchema).min(1).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isRestrictedFromModule(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await db.quotation.findUnique({ where: { id }, include: { items: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessBillingRecord(user, existing)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  // Recompute totals when items or discount change, and snapshot a new version.
  const itemsChanged = data.items !== undefined || data.discount !== undefined;
  const discount = data.discount ?? toNumber(existing.discount);
  const itemsInput =
    data.items ??
    existing.items.map((i) => ({
      description: i.description,
      hsnSac: i.hsnSac,
      qty: toNumber(i.qty),
      unitPrice: toNumber(i.unitPrice),
      gstRate: toNumber(i.gstRate),
    }));
  let totals;
  try {
    totals = computeTotals(itemsInput, discount);
  } catch (err) {
    if (err instanceof BillingValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  const quotation = await db.$transaction(async (tx) => {
    if (data.items !== undefined) {
      await tx.quotationItem.deleteMany({ where: { quotationId: id } });
      await tx.quotationItem.createMany({
        data: totals.items.map((i, idx) => ({
          quotationId: id,
          description: i.description,
          hsnSac: (itemsInput[idx] as { hsnSac?: string | null })?.hsnSac || null,
          qty: i.qty,
          unitPrice: i.unitPrice,
          gstRate: i.gstRate,
          lineTotal: i.lineTotal,
        })),
      });
    }

    const nextVersion = itemsChanged ? existing.currentVersion + 1 : existing.currentVersion;
    if (itemsChanged) {
      await tx.quotationVersion.create({
        data: {
          quotationId: id,
          versionNumber: nextVersion,
          snapshot: asJson({
            clientName: data.clientName ?? existing.clientName,
            discount,
            subtotal: totals.subtotal,
            gstAmount: totals.gstAmount,
            total: totals.total,
            items: totals.items,
          }),
        },
      });
    }

    return tx.quotation.update({
      where: { id },
      data: {
        ...(data.clientName !== undefined && { clientName: data.clientName }),
        ...(data.clientEmail !== undefined && { clientEmail: data.clientEmail || null }),
        ...(data.clientAddress !== undefined && { clientAddress: data.clientAddress || null }),
        ...(data.clientGstin !== undefined && { clientGstin: data.clientGstin || null }),
        ...(data.shipToAddress !== undefined && { shipToAddress: data.shipToAddress || null }),
        ...(data.shipToGstin !== undefined && { shipToGstin: data.shipToGstin || null }),
        ...(data.placeOfSupply !== undefined && { placeOfSupply: data.placeOfSupply || null }),
        ...(data.subject !== undefined && { subject: data.subject || null }),
        ...(data.notes !== undefined && { notes: data.notes || null }),
        ...(data.validUntil !== undefined && { validUntil: data.validUntil ? new Date(data.validUntil) : null }),
        ...pickSellerData(data),
        ...(data.status !== undefined && { status: data.status }),
        ...(itemsChanged && {
          discount,
          subtotal: totals.subtotal,
          gstAmount: totals.gstAmount,
          total: totals.total,
          currentVersion: nextVersion,
        }),
      },
    });
  });

  // Moving a quotation to "Sent" is what actually puts it in front of an
  // approver — nobody was ever told a quotation existed before this (only
  // the creator hears about the eventual approve/reject, via
  // quotation_decided in .../approve/route.ts). Only fires on the genuine
  // transition, not a re-save of an already-sent quotation.
  if (data.status === "SENT" && existing.status !== "SENT") {
    const admins = await db.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN", "SUPER_ADMIN"] }, NOT: { id: user.id } },
      select: { id: true },
    });
    await Promise.all(
      admins.map((a) =>
        notifyAndPush(
          a.id,
          "quotation_submitted",
          { quotationId: id, quotationNumber: quotation.quotationNumber, actorName: user.name },
          {
            title: "Quotation awaiting approval",
            body: `${user.name} sent quotation ${quotation.quotationNumber} for approval`,
            url: "/quotations",
            tag: "quotation-submitted",
          }
        )
      )
    );
  }

  broadcastQuotationChange("quotation_updated", quotation);
  return NextResponse.json({ quotation });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isRestrictedFromModule(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await db.quotation.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canDeleteBillingRecord(user, existing)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.quotation.delete({ where: { id } });
  broadcastQuotationChange("quotation_deleted", existing);
  return NextResponse.json({ ok: true });
}
