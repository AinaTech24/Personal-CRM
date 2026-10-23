"use client";

import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/utils";

export type ExpenseStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAID";

export interface ExpenseRow {
  id: string;
  category: string;
  amount: number;
  expenseDate: string;
  description: string;
  status: ExpenseStatus;
  appliedAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
  adminNote: string | null;
  paidAt: string | null;
  receiptFileName: string | null;
  receiptFilePath: string | null;
  user: { id: string; name: string; avatarDataUrl: string | null; department: string | null };
}

export const CATEGORY_OPTIONS = [
  { value: "TRAVEL", label: "Travel" },
  { value: "FOOD", label: "Food" },
  { value: "ACCOMMODATION", label: "Accommodation" },
  { value: "OFFICE_SUPPLIES", label: "Office Supplies" },
  { value: "SOFTWARE", label: "Software" },
  { value: "CLIENT_ENTERTAINMENT", label: "Client Entertainment" },
  { value: "OTHER", label: "Other" },
];

export const categoryLabel = (c: string) => CATEGORY_OPTIONS.find((o) => o.value === c)?.label ?? c;

const STATUS_VARIANT = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  PAID: "default",
} as const;

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

export const fmtApplied = (iso: string) => format(parseISO(iso), "dd MMM yyyy");
export const fmtExpenseDate = (key: string) => format(parseISO(key), "d MMM yyyy");
export const fmtAmount = (n: number) => formatMoney(n);
