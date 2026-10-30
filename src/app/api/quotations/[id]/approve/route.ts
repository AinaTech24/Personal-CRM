import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canApproveQuotation } from "@/lib/permissions";
import { broadcastQuotationChange } from "@/lib/quotations";
import { notifyAndPush } from "@/lib/notify";

const bodySchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canApproveQuotation(user)) {
    return NextResponse.json({ error: "Only an admin can approve or reject quotations" }, { status: 403 });
  }

  const { id } = await params;
  const quotation = await db.quotation.findUnique({ where: { id } });
  if (!quotation || quotation.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const updated = await db.$transaction(async (tx) => {
    await tx.quotationApproval.create({
      data: {
        quotationId: id,
        approverId: user.id,
        decision: parsed.data.decision,
        comment: parsed.data.comment || null,
      },
    });
    return tx.quotation.update({ where: { id }, data: { status: parsed.data.decision } });
  });

  if (quotation.createdById !== user.id) {
    const decisionWord = parsed.data.decision === "APPROVED" ? "approved" : "rejected";
    await notifyAndPush(
      quotation.createdById,
      "quotation_decided",
      { quotationId: id, quotationNumber: quotation.quotationNumber, decision: parsed.data.decision, actorName: user.name },
      {
        title: "Quotation decided",
        body: `${user.name} ${decisionWord} quotation ${quotation.quotationNumber}`,
        url: "/quotations",
        tag: "quotation-decided",
      }
    );
  }

  broadcastQuotationChange("quotation_updated", updated);
  return NextResponse.json({ quotation: updated });
}
