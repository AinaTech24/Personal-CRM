import type { Expense, User } from "@/generated/prisma/client";
import { keyFromDate } from "@/lib/attendance";
import { toNumber } from "@/lib/billing";

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
