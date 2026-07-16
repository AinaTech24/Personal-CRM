import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessBillingRecord, toNumber } from "@/lib/billing";
import { broadcastInvoiceChange, nextInvoiceNumber } from "@/lib/invoices";

/** Creates a DRAFT invoice from an approved quotation, copying its client and line items. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const quotation = await db.quotation.findUnique({ where: { id }, include: { items: true } });
  if (!quotation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessBillingRecord(user, quotation)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (quotation.status !== "APPROVED") {
    return NextResponse.json({ error: "Only an approved quotation can be converted to an invoice" }, { status: 400 });
  }

  const invoiceNumber = await nextInvoiceNumber();
  const invoice = await db.invoice.create({
    data: {
      invoiceNumber,
      quotationId: quotation.id,
      clientName: quotation.clientName,
      clientEmail: quotation.clientEmail,
      departmentId: quotation.departmentId,
      sellerName: quotation.sellerName,
      sellerAddress: quotation.sellerAddress,
      sellerGstin: quotation.sellerGstin,
      sellerPhone: quotation.sellerPhone,
      sellerEmail: quotation.sellerEmail,
      sellerWebsite: quotation.sellerWebsite,
      sellerSignatory: quotation.sellerSignatory,
      sellerLogoDataUrl: quotation.sellerLogoDataUrl,
      sellerSignatureDataUrl: quotation.sellerSignatureDataUrl,
      subtotal: quotation.subtotal,
      gstAmount: quotation.gstAmount,
      total: quotation.total,
      createdById: user.id,
      items: {
        create: quotation.items.map((i) => ({
          description: i.description,
          qty: toNumber(i.qty),
          unitPrice: toNumber(i.unitPrice),
          gstRate: toNumber(i.gstRate),
          lineTotal: toNumber(i.lineTotal),
        })),
      },
    },
  });

  broadcastInvoiceChange("invoice_created", invoice);
  return NextResponse.json({ invoice }, { status: 201 });
}
