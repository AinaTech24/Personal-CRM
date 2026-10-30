import type { Expense, User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isAdmin, type PermissionUser } from "@/lib/permissions";
import { moduleAccessScope } from "@/lib/module-permissions-store";
import { keyFromDate } from "@/lib/attendance";
import { toNumber } from "@/lib/billing";
import { TRASH_RETENTION_DAYS, trashExpiresAt, type TrashActionResult, type TrashItem } from "@/lib/trash-types";

export const expenseInclude = {
  user: { select: { id: true, name: true, surname: true, avatarDataUrl: true, department: { select: { name: true } } } },
  decidedBy: { select: { id: true, name: true, surname: true } },
} as const;

type WithRelations = Omit<Expense, "receiptData"> & {
  user: Pick<User, "id" | "name" | "surname" | "avatarDataUrl"> & { department: { name: string } | null };
  decidedBy: Pick<User, "id" | "name" | "surname"> | null;
};

const fullName = (u: { name: string; surname: string | null }) => [u.name, u.surname].filter(Boolean).join(" ");

/** The wire shape: the date as a "YYYY-MM-DD" key (never shifted by a timezone), instants as ISO strings, amount as a plain number. The base64 receipt blob itself is never included — it's served separately through /api/uploads. */
export function serializeExpense(e: WithRelations) {
  return {
    id: e.id,
    category: e.category,
    categoryOther: e.categoryOther,
    amount: toNumber(e.amount),
    expenseDate: keyFromDate(e.expenseDate),
    description: e.description,
    status: e.status,
    appliedAt: e.createdAt.toISOString(),
    decidedAt: e.decidedAt?.toISOString() ?? null,
    decidedByName: e.decidedBy ? fullName(e.decidedBy) : null,
    adminNote: e.adminNote,
    paidAt: e.paidAt?.toISOString() ?? null,
    receiptFileName: e.receiptFileName,
    receiptFilePath: e.receiptFilePath,
    user: {
      id: e.user.id,
      name: fullName(e.user),
      avatarDataUrl: e.user.avatarDataUrl,
      department: e.user.department?.name ?? null,
    },
  };
}

/* ------------------------------- Trash ------------------------------- */

/** Same scope as who's actually allowed to delete/restore/purge an expense — see the DELETE route. */
async function expenseDeleteScope(user: PermissionUser) {
  return isAdmin(user) ? ("all" as const) : await moduleAccessScope(user, "EXPENSES", "DELETE");
}

/** Every trashed expense claim this user is allowed to manage. */
export async function listTrashedExpensesFor(user: PermissionUser): Promise<TrashItem[]> {
  const scope = await expenseDeleteScope(user);
  if (scope === null) return [];
  const where = scope === "all" ? { deletedAt: { not: null } } : { deletedAt: { not: null }, user: { departmentId: scope.departmentId } };

  const expenses = await db.expense.findMany({
    where,
    include: { user: { select: { id: true, name: true, surname: true } }, deletedBy: { select: { id: true, name: true } } },
    orderBy: { deletedAt: "desc" },
  });
  return expenses.map((e) => ({
    id: e.id,
    module: "expenses",
    moduleLabel: "Expenses",
    title: `${fullName(e.user)}'s ${e.category === "OTHER" ? e.categoryOther || "Other" : e.category.replace(/_/g, " ").toLowerCase()} claim`,
    subtitle: e.description,
    deletedAt: e.deletedAt!.toISOString(),
    deletedBy: e.deletedBy,
    expiresAt: trashExpiresAt(e.deletedAt!).toISOString(),
  }));
}

/** Clears the trash flag, putting the claim back exactly as it was. */
export async function restoreExpense(user: PermissionUser, expenseId: string): Promise<TrashActionResult> {
  const expense = await db.expense.findUnique({ where: { id: expenseId }, include: { user: { select: { departmentId: true } } } });
  if (!expense || !expense.deletedAt) return "not_found";

  const scope = await expenseDeleteScope(user);
  if (scope === null || (scope !== "all" && expense.user.departmentId !== scope.departmentId)) return "forbidden";

  await db.expense.update({ where: { id: expenseId }, data: { deletedAt: null, deletedById: null } });
  return "ok";
}

/** Same permission as deleting it in the first place. */
export async function purgeExpense(user: PermissionUser, expenseId: string): Promise<TrashActionResult> {
  const expense = await db.expense.findUnique({ where: { id: expenseId }, include: { user: { select: { departmentId: true } } } });
  if (!expense || !expense.deletedAt) return "not_found";

  const scope = await expenseDeleteScope(user);
  if (scope === null || (scope !== "all" && expense.user.departmentId !== scope.departmentId)) return "forbidden";

  await db.expense.delete({ where: { id: expenseId } });
  return "ok";
}

/** The 30-day auto-purge job's actual work. */
export async function purgeExpiredExpenses(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.expense.deleteMany({ where: { deletedAt: { lte: cutoff } } });
  return count;
}
