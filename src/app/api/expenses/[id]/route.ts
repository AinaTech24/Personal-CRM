import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { moduleAccessScope } from "@/lib/module-permissions-store";
import { sharesLedTeamWith } from "@/lib/teams";
import { dateFromKey } from "@/lib/attendance";
import { expenseInclude, serializeExpense } from "@/lib/expenses";
import { notifyAndPush } from "@/lib/notify";
import { emitToAdmins } from "@/lib/socket-emit";

const CATEGORIES = ["TRAVEL", "FOOD", "ACCOMMODATION", "OFFICE_SUPPLIES", "SOFTWARE", "CLIENT_ENTERTAINMENT", "OTHER"] as const;

const patchSchema = z.object({
  action: z.enum(["approve", "reject", "markPaid", "cancel", "edit"]),
  adminNote: z.string().trim().max(1000).optional().nullable(),
  // Only used by "edit".
  category: z.enum(CATEGORIES).optional(),
  categoryOther: z.string().trim().max(200).optional(),
  amount: z.coerce.number().positive().max(10_000_000).optional(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().trim().min(1).max(1000).optional(),
});

/**
 * approve / reject (admins, EXPENSES grantees, or the lead of any team the
 * requester belongs to) move a PENDING claim one way or the other; markPaid
 * is a separate step reachable only from APPROVED, so "this is legitimate"
 * and "the money has moved" stay distinct. cancel is the requester
 * withdrawing their own still-pending claim. Each decision is claimed
 * atomically so two deciders can't race each other. "edit" is separate:
 * admins/grantees can edit any claim regardless of status.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { action, adminNote } = parsed.data;

  const { id } = await params;
  const expense = await db.expense.findUnique({ where: { id }, include: { user: { select: { departmentId: true } } } });
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const expenseScope = isAdmin(user) ? ("all" as const) : await moduleAccessScope(user, "EXPENSES", "UPDATE");
  const canManageExpenses = expenseScope === "all" || (expenseScope !== null && expense.user.departmentId === expenseScope.departmentId);

  if (action === "edit") {
    if (!canManageExpenses) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const d = parsed.data;
    if (!d.category || d.amount === undefined || !d.expenseDate || !d.description) {
      return NextResponse.json({ error: "Please fill in every field." }, { status: 400 });
    }
    if (d.category === "OTHER" && !d.categoryOther) {
      return NextResponse.json({ error: "Please specify what this expense was for." }, { status: 400 });
    }
    if (Number.isNaN(dateFromKey(d.expenseDate).getTime())) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }
    const updated = await db.expense.update({
      where: { id },
      data: {
        category: d.category,
        categoryOther: d.category === "OTHER" ? d.categoryOther : null,
        amount: d.amount,
        expenseDate: dateFromKey(d.expenseDate),
        description: d.description,
      },
      include: expenseInclude,
      omit: { receiptData: true },
    });
    emitToAdmins("expense_request_changed", { id });
    return NextResponse.json({ expense: serializeExpense(updated) });
  }

  if (action === "cancel") {
    if (expense.userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (expense.status !== "PENDING") return NextResponse.json({ error: "Only a pending claim can be cancelled." }, { status: 400 });
  } else {
    const canDecide = canManageExpenses || (await sharesLedTeamWith(user.id, expense.userId));
    if (!canDecide) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (expense.userId === user.id) {
      return NextResponse.json({ error: "You can't decide your own expense claim." }, { status: 403 });
    }
  }

  let claimed: { count: number };
  if (action === "markPaid") {
    claimed = await db.expense.updateMany({ where: { id, status: "APPROVED" }, data: { status: "PAID", paidAt: new Date() } });
  } else {
    const targetStatus = action === "approve" ? "APPROVED" : "REJECTED"; // "reject" and "cancel" both land here
    claimed = await db.expense.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: targetStatus,
        decidedById: user.id,
        decidedAt: new Date(),
        adminNote: action === "cancel" ? null : adminNote || null,
      },
    });
  }
  if (claimed.count === 0) {
    return NextResponse.json({ error: "This claim has already been decided." }, { status: 409 });
  }

  const updated = await db.expense.findUniqueOrThrow({ where: { id }, include: expenseInclude, omit: { receiptData: true } });

  if (action === "approve" || action === "reject") {
    const word = action === "approve" ? "approved" : "rejected";
    await notifyAndPush(
      expense.userId,
      "expense_decided",
      { expenseId: id, decision: updated.status, actorName: user.name },
      { title: `Expense ${word}`, body: `${user.name} ${word} your expense claim`, url: "/expenses", tag: "expense-decided" }
    );
  } else if (action === "markPaid") {
    await notifyAndPush(
      expense.userId,
      "expense_paid",
      { expenseId: id, actorName: user.name },
      { title: "Expense reimbursed", body: `${user.name} marked your expense claim as paid`, url: "/expenses", tag: "expense-paid" }
    );
  }
  emitToAdmins("expense_request_changed", { id });

  return NextResponse.json({ expense: serializeExpense(updated) });
}

/** Admins and an EXPENSES grantee for their own department. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const expense = await db.expense.findUnique({ where: { id }, include: { user: { select: { departmentId: true } } } });
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const expenseScope = isAdmin(user) ? ("all" as const) : await moduleAccessScope(user, "EXPENSES", "DELETE");
  if (expenseScope !== "all" && !(expenseScope !== null && expense.user.departmentId === expenseScope.departmentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.expense.delete({ where: { id } });
  emitToAdmins("expense_request_changed", { id });
  return NextResponse.json({ ok: true });
}
